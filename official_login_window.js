'use strict';
const {randomUUID}=require('node:crypto');

// A disposable browser session; never add a preload or expose app APIs to remote pages.
function isOfficialLoginURL(value){
 try{const u=new URL(value),host=u.hostname.toLowerCase();return u.protocol==='https:'&&!u.username&&!u.password&&(['reg.163.com','passport.163.com'].includes(host)||['music.163.com','qq.com','gtimg.com'].some(domain=>host===domain||host.endsWith('.'+domain)));}catch{return false;}
}
function createOfficialLoginWindow({BrowserWindow,session,onToken,onStatus=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,retryDelayMs=5000}){
 let active=null;
 const notify=state=>{try{onStatus(state)}catch{}};
 function close(){
  const item=active;if(!item)return;active=null;item.closed=true;
  item.cookies.removeListener('changed',item.changed);if(item.timer!==null)clearTimer(item.timer);
  for(const w of item.windows)try{if(!w.isDestroyed())w.close()}catch{}
  try{const p=item.session.clearStorageData();p?.catch?.(()=>{});}catch{}
 }
 function open(){
  if(active){try{active.primary.show();active.primary.focus()}catch{}return {open:true};}
  const isolated=session.fromPartition('official-login-'+randomUUID());
  const options={width:920,height:700,minWidth:650,minHeight:520,show:true,title:'网易云音乐官方登录',autoHideMenuBar:true,
   webPreferences:{session:isolated,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,devTools:false}};
  const primary=new BrowserWindow(options),item={primary,session:isolated,cookies:isolated.cookies,windows:new Set([primary]),closed:false,busy:false,last:'',changed:null,timer:null,retries:0};active=item;
  isolated.setPermissionRequestHandler?.((_wc,_permission,cb)=>cb(false));
  isolated.on?.('will-download',event=>event.preventDefault());
  function configure(w){
   const wc=w.webContents;
   for(const event of ['will-navigate','will-redirect'])wc.on(event,(e,url)=>{if(!isOfficialLoginURL(url))e.preventDefault();});
   wc.on('page-title-updated',event=>event.preventDefault());
   wc.setWindowOpenHandler(details=>isOfficialLoginURL(details.url)?{action:'allow',overrideBrowserWindowOptions:{...options,parent:primary,webPreferences:{...options.webPreferences}}}:{action:'deny'});
   wc.on('did-create-window',child=>{if(active!==item){child.close();return;}item.windows.add(child);configure(child);child.on('closed',()=>item.windows.delete(child));});
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
    else{item.last='';notify({state:'waiting',message:retry()?'登录状态尚未确认，正在重试。':'无法验证登录，请关闭登录窗口重试。'});}
   }catch{if(active===item){item.last='';notify({state:'waiting',message:retry()?'暂时无法验证登录，正在重试。':'无法验证登录，请关闭登录窗口重试。'});}}
   finally{item.busy=false;}
  }
  function retry(){if(active!==item||item.retries>=3)return false;if(item.timer!==null)return true;item.retries++;item.timer=setTimer(()=>{item.timer=null;void inspect()},retryDelayMs);item.timer?.unref?.();return true;}
  item.changed=(_event,cookie,_cause,removed)=>{if(!removed&&cookie?.name==='MUSIC_U'&&(cookie.domain==='music.163.com'||cookie.domain==='.music.163.com'))void inspect();};
  item.cookies.on('changed',item.changed);configure(primary);primary.on('closed',()=>{if(active===item){close();notify({state:'cancelled'});}});
  primary.loadURL('https://music.163.com/').catch(()=>{if(active===item)notify({state:'error',message:'网易云官方网页暂时无法打开，请检查网络。'});});
  notify({state:'waiting'});return {open:true};
 }
 return {open,close,isOpen:()=>!!active};
}
module.exports={createOfficialLoginWindow,isOfficialLoginURL};
