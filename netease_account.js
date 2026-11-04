'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

// This object is owned by the main process. Neither the credential nor QR key
// crosses the renderer boundary; no external API host is configurable here.
function createNeteaseAccount({api,safeStorage,file,now=Date.now,onChange=()=>{}}){
 if(!api||!safeStorage||!file)throw Error('账号服务配置错误');
 let cookie='',nickname='',generation=0,qr=null,polling=null,refreshing=null,loadError='',authState='signed-out';
 const levels=new Set(['standard','higher','exhigh','lossless','hires','jymaster']);
 const available=()=>{try{return safeStorage.isEncryptionAvailable()===true}catch{return false}};
 const notifyChange=()=>{try{onChange()}catch{}};
 function writeAtomic(data){
  fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';let fd;
  try{fd=fs.openSync(tmp,'wx',0o600);fs.writeFileSync(fd,data);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(tmp,file);}
  finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(tmp)}catch(e){if(e.code!=='ENOENT')throw e}}
 }
 function extract(value){
  const raw=Array.isArray(value)?value.join(';'):String(value||'');
  const match=/(?:^|[;,]\s*)MUSIC_U=([^;\s,]+)/i.exec(raw);
  return match&&/^[A-Za-z0-9%._~+\/-]{10,4096}$/.test(match[1])?'MUSIC_U='+match[1]:'';
 }
 function load(){
  if(!fs.existsSync(file))return;
  if(!available()){loadError='系统安全存储不可用，无法读取登录信息';return;}
  try{cookie=extract(safeStorage.decryptString(fs.readFileSync(file)));if(!cookie)loadError='保存的登录信息无效，请重新登录';else authState='unverified';}catch{cookie='';loadError='保存的登录信息不可读取，请重新登录';}
 }
 load();
 const status=()=>({loggedIn:!!cookie&&authState==='valid',savedCredential:!!cookie,state:authState,...(nickname?{nickname}:{}),...(loadError?{error:loadError}:authState==='expired'?{error:'登录已失效，请重新扫码'}:authState==='unverified'?{error:'暂时无法验证登录状态'}:{})});
 async function refreshStatus(){
  if(!cookie)return status();const token=generation,session=cookie;
  if(refreshing&&refreshing.token===token&&refreshing.session===session)return refreshing.promise;
  const promise=(async()=>{
   try{
    const result=await api.login_status({cookie:session});if(token!==generation||cookie!==session)return status();
    const data=result?.body?.data,code=Number(data?.code??result?.body?.code);
    const previous=authState;
    if(code===200&&(data?.account?.id||data?.profile?.userId)){authState='valid';loadError='';nickname=typeof data.profile?.nickname==='string'?data.profile.nickname.slice(0,80):'';}
    else if([301,401,403].includes(code)){authState='expired';nickname='';loadError='';}
    else{authState='unverified';nickname='';loadError='';}
    if(previous!==authState)notifyChange();return status();
   }catch{if(token===generation&&cookie===session){const previous=authState;authState='unverified';nickname='';loadError='';if(previous!==authState)notifyChange();}return status();}
  })();
  const entry={token,session,promise};refreshing=entry;
  try{return await promise}finally{if(refreshing===entry)refreshing=null;}
 }
 function clearQr(){qr=null;polling=null;}
 // Only the trusted main-process browser controller may call this. No token is
 // ever returned: a failed or cancelled login leaves the current account intact.
 async function importWebCookie(raw){
  const token=++generation;clearQr();
  if(typeof raw!=='string'||raw.length>16384)throw Error('网页登录信息无效，请重新登录');
  const next=extract(raw);if(!next)throw Error('网页尚未完成网易云登录，请继续操作');
  if(!available())throw Error('系统安全存储不可用，无法安全登录');
  try{
   const verify=await api.login_status({cookie:next});if(token!==generation)return {status:'cancelled'};
   const data=verify?.body?.data;if(Number(data?.code)!==200||!(data.account?.id||data.profile?.userId))throw Error();
   if(!available())throw Error();const encrypted=safeStorage.encryptString(next);if(!Buffer.isBuffer(encrypted)||!encrypted.length)throw Error();
   writeAtomic(encrypted);cookie=next;authState='valid';nickname=typeof data.profile?.nickname==='string'?data.profile.nickname.slice(0,80):'';loadError='';generation++;notifyChange();return {status:'logged-in',...status()};
  }catch{if(token!==generation)return {status:'cancelled'};throw Error('未能验证网易云登录，请重试');}
 }
 async function startQr(){
  const token=++generation;clearQr();if(!available())throw Error('系统安全存储不可用，无法安全登录');
  try{
   const keyResult=await api.login_qr_key({});if(token!==generation)return {status:'cancelled'};
   const key=keyResult?.body?.data?.unikey;if(typeof key!=='string'||!/^[A-Za-z0-9_-]{8,256}$/.test(key))throw Error();
   const created=await api.login_qr_create({key,qrimg:true});if(token!==generation)return {status:'cancelled'};
   const image=created?.body?.data?.qrimg;if(typeof image!=='string'||image.length>600000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image))throw Error();
   qr={key,expiresAt:now()+180000,token};return {status:'waiting',image,expiresAt:qr.expiresAt};
  }catch{if(token!==generation)return {status:'cancelled'};clearQr();throw Error('二维码暂时无法获取，请稍后重试');}
 }
 async function pollQr(){
  if(!qr)return {status:'expired'};
  if(now()>=qr.expiresAt){generation++;clearQr();return {status:'expired'};}
  if(polling)return polling;
  const current=qr,token=current.token;
  const work=(async()=>{
   try{
    const response=await api.login_qr_check({key:current.key});if(token!==generation||qr!==current)return {status:'cancelled'};
    if(now()>=current.expiresAt){generation++;clearQr();return {status:'expired'};}
    const code=Number(response?.body?.code);
    if(code===800){generation++;clearQr();return {status:'expired'};}
    if(code===801)return {status:'waiting'};if(code===802)return {status:'scanned'};
    if(code!==803)throw Error();
    const next=extract(response.body.cookie||response.cookie);if(!next)throw Error();
    const verify=await api.login_status({cookie:next});if(token!==generation||qr!==current)return {status:'cancelled'};
    if(now()>=current.expiresAt){generation++;clearQr();return {status:'expired'};}
    const data=verify?.body?.data;if(data?.code!==200||!(data.account?.id||data.profile?.userId))throw Error();
    if(!available())throw Error();const encrypted=safeStorage.encryptString(next);if(!Buffer.isBuffer(encrypted)||!encrypted.length)throw Error();
    writeAtomic(encrypted);cookie=next;authState='valid';nickname=typeof data.profile?.nickname==='string'?data.profile.nickname.slice(0,80):'';loadError='';generation++;clearQr();notifyChange();return {status:'logged-in',...status()};
   }catch{if(token!==generation||qr!==current)return {status:'cancelled'};throw Error('登录暂时无法完成，请重新扫码');}
  })();polling=work;try{return await work}finally{if(polling===work)polling=null}
 }
 function cancel(){generation++;clearQr();return {status:'cancelled'};}
 function logout(){
  generation++;clearQr();try{fs.unlinkSync(file)}catch(e){if(e.code!=='ENOENT')throw Error('无法删除本机登录信息');}
  cookie='';nickname='';loadError='';authState='signed-out';notifyChange();return status();
 }
 async function songUrl(id,level='standard'){
  const sid=String(id);if(!/^\d{1,20}$/.test(sid)||!levels.has(level))throw Error('歌曲请求参数无效');
  if(!cookie||authState==='expired')throw Error('请先登录网易云账号');if(authState==='unverified')throw Error('暂时无法验证登录状态，请检查网络');const token=generation,session=cookie;
  try{
   // Omit unblock/source/proxy/realIP: the user receives only their own rights.
   const result=await api.song_url_v1({id:sid,level,cookie:session});if(token!==generation||cookie!==session)throw Error();
   const body=result?.body;
   // Only explicit account-level authorization failures justify rechecking
   // login. A per-song -110 response does not mean the account has expired.
   if([301,401,403].includes(Number(body?.code))){await refreshStatus();throw Error();}
   if(!body||!Array.isArray(body.data))throw Error();
   const rows=body.data.slice(0,1).map(row=>({id:row.id,url:row.url,br:row.br,level:row.level,expi:row.expi,code:row.code,freeTrialInfo:row.freeTrialInfo,trialInfo:row.trialInfo,freeTrialPrivilege:row.freeTrialPrivilege}));
   return {code:body.code,data:rows};
  }catch{throw Error('登录账号的音源查询暂时不可用');}
 }
 return {status,refreshStatus,startQr,pollQr,importWebCookie,cancel,logout,songUrl};
}
module.exports={createNeteaseAccount};
