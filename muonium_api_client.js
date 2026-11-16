'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
function createMuoniumApiClient({directory=path.join(__dirname,'backend/muonium'),spawnImpl=spawn,timeoutMs=25000}={}){
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'endpoints.json'),'utf8')),paths=new Set(manifest.paths);
 let child=null,sequence=0,buffer='',closed=false;const jobs=new Map();
 function stop(){const previous=child;child=null;buffer='';previous?.kill();for(const j of jobs.values()){clearTimeout(j.timer);j.reject(Error('网易云原接口连接中断，请重试'));}jobs.clear();}
 function start(){
  if(closed)throw Error('网易云服务已关闭');if(child)return child;
  const java=path.join(directory,'runtime/bin/java.exe');if(!fs.existsSync(java))throw Error('内置网易云运行环境缺失');
  const env={...process.env};for(const k of Object.keys(env))if(/NETEASE|COOKIE|JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS/i.test(k))delete env[k];
  const proc=spawnImpl(java,['-Xmx128m','-cp',['muonium-netease.jar','gson-2.11.0.jar','commons-lang3-3.18.0.jar'].map(f=>path.join(directory,f)).join(path.delimiter),'DesktopWorker',path.join(directory,'endpoints.json')],{stdio:['pipe','pipe','ignore'],windowsHide:true,env});child=proc;
  proc.stdout.setEncoding('utf8');proc.stdout.on('data',chunk=>{if(child!==proc)return;buffer+=chunk;if(buffer.length>4*1024*1024){stop();return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const data=JSON.parse(line),job=jobs.get(data.id);if(!job)continue;jobs.delete(data.id);clearTimeout(job.timer);if(data.ok)job.resolve(data.result||{body:data.body,cookie:data.cookie||''});else job.reject(Error('网易云原接口请求失败'));}catch{stop();return;}}});
  proc.on('error',()=>{if(child===proc)stop();});proc.on('exit',()=>{if(child===proc)stop();});return proc;
 }
 function call(endpoint,params={},cookie=''){
  try{
   if((!paths.has(endpoint)&&!/^\/weapi\/v1\/album\/\d{1,20}$/.test(endpoint))||!params||typeof params!=='object'||Array.isArray(params)||typeof cookie!=='string'||cookie.length>16384||/[\r\n]/.test(cookie))throw Error('网易云请求参数无效');
   if(jobs.size>=4)throw Error('网易云请求繁忙');
   for(const [key,v] of Object.entries(params))if(!/^[\w-]{1,80}$/.test(key)||!['string','boolean','number'].includes(typeof v)||String(v).length>16000)throw Error('网易云请求参数无效');
   const proc=start(),id=++sequence,payload=JSON.stringify({id,path:endpoint,params,cookie});
   if(payload.length>60000)throw Error('网易云请求过大');
   return new Promise((resolve,reject)=>{const timer=setTimeout(stop,timeoutMs);jobs.set(id,{resolve,reject,timer});proc.stdin.write(payload+'\n',e=>{if(e&&child===proc)stop();});});
  }catch(e){return Promise.reject(e);}
 }
 function invoke(method,args=[],cookie=''){
  try{
   if(!manifest.features.some(f=>f.method===method)||!Array.isArray(args)||args.length>12||typeof cookie!=='string'||cookie.length>16384||/[\r\n]/.test(cookie))throw Error('网易云原方法参数无效');
   if(jobs.size>=4)throw Error('网易云请求繁忙');
   const proc=start(),id=++sequence,payload=JSON.stringify({id,method,arguments:args,cookie});if(payload.length>60000)throw Error('网易云请求过大');
   return new Promise((resolve,reject)=>{const timer=setTimeout(stop,timeoutMs);jobs.set(id,{resolve,reject,timer});proc.stdin.write(payload+'\n',e=>{if(e&&child===proc)stop();});});
  }catch(e){return Promise.reject(e);}
 }
 return {call,invoke,suspend:stop,close(){closed=true;stop();}};
}
module.exports={createMuoniumApiClient};
