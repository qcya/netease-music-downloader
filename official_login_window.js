'use strict';
const {randomUUID}=require('node:crypto');

// A disposable browser session; never add a preload or expose app APIs to remote pages.
function isOfficialLoginURL(value){
 try{const u=new URL(value),host=u.hostname.toLowerCase();return u.protocol==='https:'&&!u.username&&!u.password&&(['reg.163.com','passport.163.com'].includes(host)||['music.163.com','qq.com','gtimg.com'].some(domain=>host===domain||host.endsWith('.'+domain)));}catch{return false;}
}
function createOfficialLoginWindow({BrowserWindow,session,onToken,onStatus=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,retryDelayMs=5000,setLoadingTimer=setTimeout,clearLoadingTimer=clearTimeout,loadingTimeoutMs=4000}){
 let active=null;
 const qqURL='https://music.163.com/api/sns/authorize?snsType=5&clientType=web2&callbackType=Login&forcelogin=true';
 const notify=state=>{try{onStatus(state)}catch{}};
 function close(){
  const item=active;if(!item)return;active=null;item.closed=true;
  item.cookies.removeListener('changed',item.changed);if(item.timer!==null)clearTimer(item.timer);if(item.dismissTimer!==null)clearTimer(item.dismissTimer);if(item.launchTimer!==null)clearTimer(item.launchTimer);if(item.readyTimer!==null)clearTimer(item.readyTimer);if(item.stopTimer!==null)clearLoadingTimer(item.stopTimer);
  for(const w of item.windows)try{if(!w.isDestroyed())w.close()}catch{}
  try{const p=item.session.clearStorageData();p?.catch?.(()=>{});}catch{}
 }
 function open(mode='phone'){
  if(!['qq','phone'].includes(mode))throw Error('登录方式无效');
  if(active&&active.mode!==mode)close();
  if(active){try{const w=mode==='qq'?[...active.windows].find(x=>x!==active.primary&&!x.isDestroyed()):active.primary;w?.show();w?.focus()}catch{}return {open:true};}
  const isolated=session.fromPartition('official-login-'+randomUUID());
  const options={width:920,height:700,minWidth:650,minHeight:520,show:mode!=='qq',title:'网易云音乐官方登录',autoHideMenuBar:true,
   webPreferences:{session:isolated,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,devTools:false,backgroundThrottling:false}};
  const primary=new BrowserWindow(options),item={mode,primary,session:isolated,cookies:isolated.cookies,windows:new Set([primary]),closed:false,busy:false,last:'',changed:null,timer:null,dismissTimer:null,launchTimer:null,readyTimer:null,stopTimer:null,forcedStop:false,reloaded:false,launchChecking:false,loginOpened:false,launched:false,retries:0,dismissed:false,failed:false,returning:false};active=item;
  isolated.setPermissionRequestHandler?.((_wc,_permission,cb)=>cb(false));
  isolated.on?.('will-download',event=>event.preventDefault());
  function configure(w){
   const wc=w.webContents;
   for(const event of ['will-navigate','will-redirect'])wc.on(event,(e,url,_inPlace,isMainFrame)=>{
    try{const u=new URL(url);if(isMainFrame!==false&&u.hostname==='music.163.com'&&['/back/qq','/back/sns'].includes(u.pathname)&&['https:','http:'].includes(u.protocol))item.returning=true;}catch{}
    if(isOfficialLoginURL(url))return;e.preventDefault();
    try{const u=new URL(url);if(isMainFrame!==false&&u.protocol==='http:'&&u.hostname==='music.163.com'&&!u.port&&!u.username&&!u.password&&u.pathname==='/back/sns'){u.protocol='https:';Promise.resolve(wc.loadURL(u.href)).catch(()=>{});}}catch{}
   });
   wc.on('page-title-updated',event=>event.preventDefault());
   wc.setWindowOpenHandler(details=>isOfficialLoginURL(details.url)?{action:'allow',overrideBrowserWindowOptions:{...options,show:true,parent:primary,webPreferences:{...options.webPreferences}}}:{action:'deny'});
   wc.on('did-create-window',child=>{if(active!==item){child.close();return;}if(item.launchTimer!==null){clearTimer(item.launchTimer);item.launchTimer=null;}item.windows.add(child);configure(child);child.on('closed',()=>{item.windows.delete(child);if(item.mode==='qq'&&active===item&&item.windows.size===1){if(!item.returning){close();notify({state:'cancelled'});return;}item.dismissed=true;item.dismissTimer=setTimer(async()=>{item.dismissTimer=null;if(active!==item)return;if(!item.busy)await inspect();if(active===item&&item.dismissed&&!item.busy&&item.timer===null)finishDismissed();},1800);item.dismissTimer?.unref?.();}});});
  }
  async function inspect(){
   if(active!==item||item.busy)return;item.busy=true;
   try{
    const cookies=await item.cookies.get({url:'https://music.163.com/',name:'MUSIC_U'});
    if(active!==item)return;
    const value=cookies.find(c=>c.name==='MUSIC_U'&&(c.domain==='music.163.com'||c.domain==='.music.163.com')&&typeof c.value==='string')?.value;
    if(!value||value===item.last)return;item.last=value;notify({state:'checking'});
    const result=await onToken(value,()=>active===item);
    if(active!==item)return;
    if(result?.loggedIn){notify({state:'authenticated',nickname:result.nickname||''});close();}
    else{item.failed=true;item.last='';notify({state:'waiting',message:retry()?'登录状态尚未确认，正在重试。':'无法验证登录，请关闭登录窗口重试。'});}
   }catch{if(active===item){item.failed=true;item.last='';notify({state:'waiting',message:retry()?'暂时无法验证登录，正在重试。':'无法验证登录，请关闭登录窗口重试。'});}}
   finally{item.busy=false;if(item.dismissed&&active===item&&item.timer===null&&item.dismissTimer===null)finishDismissed();}
  }
  function finishDismissed(){
   // The official QQ callback can close its popup before NetEase finishes an
   // additional verification step. Keep the opener available to the user.
   if(item.returning){item.dismissed=false;try{item.primary.show();item.primary.focus()}catch{}notify({state:'waiting',message:item.failed?'暂时无法验证登录，请在网易云页面重试或关闭后重新登录。':'请在网易云页面完成剩余验证，或关闭窗口取消。'});return;}
   close();notify({state:'cancelled'});
  }
  function retry(){if(active!==item||item.retries>=3)return false;if(item.timer!==null)return true;item.retries++;item.timer=setTimer(()=>{item.timer=null;void inspect()},retryDelayMs);item.timer?.unref?.();return true;}
  item.changed=(_event,cookie,_cause,removed)=>{if(!removed&&cookie?.name==='MUSIC_U'&&(cookie.domain==='music.163.com'||cookie.domain==='.music.163.com'))void inspect();};
  item.cookies.on('changed',item.changed);configure(primary);primary.on('closed',()=>{if(active===item){close();notify({state:'cancelled'});}});
  if(mode==='qq'){item.launchTimer=setTimer(()=>{item.launchTimer=null;if(active===item&&item.windows.size===1){notify({state:'error',message:'QQ 授权页面暂时无法打开，请检查网络后重试。'});close();}},15000);item.launchTimer?.unref?.();}
  async function launchWhenReady(){
   if(active!==item||item.launched||item.launchChecking)return;item.launchChecking=true;
   try{
    if(!item.loginOpened){const opened=await primary.webContents.executeJavaScript("(()=>{const button=document.querySelector('[data-action=login]');if(!button)return false;button.click();return true})()",true);if(active!==item)return;if(!opened)return;item.loginOpened=true;}
    const ready=await primary.webContents.executeJavaScript("typeof window.g_cbLogin==='function'",true);
    if(active!==item)return;
    if(ready){item.launched=true;if(item.readyTimer!==null){clearTimer(item.readyTimer);item.readyTimer=null;}if(item.stopTimer!==null){clearLoadingTimer(item.stopTimer);item.stopTimer=null;}
     if(mode==='qq')await primary.webContents.executeJavaScript(`window.open(${JSON.stringify(qqURL)},'netease-qq-login');true`,true);
     else await primary.webContents.executeJavaScript("setTimeout(()=>[...document.querySelectorAll('a')].find(e=>e.textContent.includes('选择其他登录模式'))?.click(),350);true",true);
    }
   }catch{if(active===item&&item.launched){notify({state:'error',message:'网易云官方登录暂时无法打开，请检查网络。'});if(mode==='qq')close();}}
   finally{item.launchChecking=false;if(active===item&&!item.launched&&item.forcedStop&&!item.reloaded){item.reloaded=true;item.forcedStop=false;item.loginOpened=false;primary.webContents.reload();}
    else if(active===item&&!item.launched&&item.readyTimer===null){item.readyTimer=setTimer(()=>{item.readyTimer=null;void launchWhenReady()},250);item.readyTimer?.unref?.();}}
  }
  primary.webContents.on('dom-ready',()=>{
   if(mode==='qq'&&item.stopTimer===null&&!item.launched){item.stopTimer=setLoadingTimer(()=>{item.stopTimer=null;if(active===item&&!item.launched){item.forcedStop=true;primary.webContents.stop();}},loadingTimeoutMs);item.stopTimer?.unref?.();}
   void launchWhenReady();
  });
  primary.loadURL('https://music.163.com/').catch(error=>{if(active===item&&!item.launched&&error?.code!=='ERR_ABORTED'&&!String(error?.message||'').includes('ERR_ABORTED')){notify({state:'error',message:'网易云官方登录暂时无法打开，请检查网络。'});if(mode==='qq')close();}});
  notify({state:'waiting',message:mode==='qq'?'正在打开 QQ 授权页面…':'请在网易云官方窗口选择手机号登录。'});return {open:true};
 }
 return {open,close,isOpen:()=>!!active,mode:()=>active?.mode||null};
}
module.exports={createOfficialLoginWindow,isOfficialLoginURL};
