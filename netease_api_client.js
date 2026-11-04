'use strict';
const path=require('node:path');
const {fork:defaultFork}=require('node:child_process');
const permitted=new Set(['login_qr_key','login_qr_create','login_qr_check','login_status','song_url_v1']);
function validate(command,args){
 if(!permitted.has(command)||!args||typeof args!=='object'||Array.isArray(args))throw Error('网易云请求参数无效');
 const allowed={login_qr_key:[],login_qr_create:['key','qrimg'],login_qr_check:['key'],login_status:['cookie'],song_url_v1:['id','level','cookie']}[command];
 if(Object.keys(args).some(key=>!allowed.includes(key)))throw Error('网易云请求参数无效');
 if('key' in args&&(typeof args.key!=='string'||!/^[A-Za-z0-9_-]{1,256}$/.test(args.key)))throw Error('网易云请求参数无效');
 if(['login_qr_create','login_qr_check'].includes(command)&&!args.key)throw Error('网易云请求参数无效');
 if('qrimg' in args&&args.qrimg!=='true'&&args.qrimg!==true)throw Error('网易云请求参数无效');
 if('cookie' in args&&(typeof args.cookie!=='string'||args.cookie.length>16384||/[\r\n]/.test(args.cookie)))throw Error('网易云请求参数无效');
 if(command==='song_url_v1'&&(!/^\d{1,20}$/.test(String(args.id||''))||!['standard','higher','exhigh','lossless','hires','jymaster'].includes(args.level)))throw Error('网易云请求参数无效');
}
function createNeteaseApiClient({fork=defaultFork,timeoutMs=15000,maxPending=4,workerPath=path.join(__dirname,'netease_api_worker.js')}={}){
 let child=null,sequence=0,closed=false;const pending=new Map();
 function rejectAll(){for(const {reject,timer} of pending.values()){clearTimeout(timer);reject(Error('网易云服务连接中断，请重试'));}pending.clear();}
 function stop(){const old=child;child=null;if(old){
  old.removeAllListeners('message');old.removeAllListeners('error');old.removeAllListeners('exit');old.on('error',()=>{});
  // Allow disconnect to trigger the worker's private-directory cleanup.
  // A stuck worker is still forcibly terminated after a short grace period.
  const killer=setTimeout(()=>{try{if(old.exitCode==null&&!old.killed)old.kill()}catch{}},1000);killer.unref?.();old.once('exit',()=>clearTimeout(killer));
  try{if(old.connected&&typeof old.disconnect==='function')old.disconnect();else old.kill()}catch{try{old.kill()}catch{}}
 }rejectAll();}
 function ensure(){
  if(closed)throw Error('网易云服务已关闭');if(child?.connected)return child;
  const env={...process.env,ELECTRON_RUN_AS_NODE:'1'};
  for(const key of Object.keys(env))if(/^NETEASE_/i.test(key)||/^(ENABLE_RANDOM_CN_IP|ENABLE_PROXY|PROXY_URL|ENABLE_UNBLOCK|UNBLOCK.*)$/i.test(key))delete env[key];
  const proc=fork(workerPath,[],{execPath:process.execPath,env,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});child=proc;
  proc.on('message',message=>{if(proc!==child||!Number.isSafeInteger(message?.id))return;const job=pending.get(message.id);if(!job)return;pending.delete(message.id);clearTimeout(job.timer);if(message.ok===true)job.resolve(message.result);else job.reject(Error('网易云接口请求失败，请重试'));});
  proc.on('error',()=>{if(proc===child)stop();});proc.on('exit',()=>{if(proc===child)stop();});return proc;
 }
 function call(command,args={}){
  try{validate(command,args);if(pending.size>=maxPending)throw Error('网易云请求繁忙，请稍后重试');const proc=ensure(),id=++sequence;
   return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(!pending.has(id))return;stop();},timeoutMs);timer.unref?.();pending.set(id,{resolve,reject,timer});try{proc.send({id,command,args},error=>{if(error&&proc===child)stop();});}catch{if(proc===child)stop();}});
  }catch(error){return Promise.reject(error);}
 }
 function close(){closed=true;stop();}
 return {call,close};
}
module.exports={createNeteaseApiClient};
