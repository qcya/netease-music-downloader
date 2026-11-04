'use strict';
// All upstream logging is discarded before the third-party module is loaded:
// its errors may contain Set-Cookie headers. Communication is IPC only.
for(const name of ['log','info','warn','error','debug','trace','dir'])console[name]=()=>{};
process.stdout?.on('error',()=>{});process.stderr?.on('error',()=>{});
process.on('uncaughtException',()=>process.exit(1));
process.on('unhandledRejection',()=>process.exit(1));
// Upstream loads .env from the current directory. Use a private, empty working
// directory so an unrelated project cannot inject cookies, proxies or options.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const originalDirectory=process.cwd(),privateDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'music-api-session-'));
process.chdir(privateDirectory);
process.on('exit',()=>{
 try{process.chdir(originalDirectory)}catch{try{process.chdir(os.tmpdir())}catch{}}
 try{fs.rmdirSync(privateDirectory)}catch{}
});
// Upstream Axios follows redirects by default. Disable all redirects before
// loading it, so a response can never forward the user's cookie elsewhere.
const packageRoot=path.dirname(require.resolve('@neteasecloudmusicapienhanced/api'));
const axiosModule=require(require.resolve('axios',{paths:[packageRoot]}));
(axiosModule.default||axiosModule).defaults.maxRedirects=0;
const api=require('@neteasecloudmusicapienhanced/api');
const commands=new Set(['login_qr_key','login_qr_create','login_qr_check','login_status','song_url_v1']);
let active=0;
process.on('disconnect',()=>process.exit(0));
process.on('message',async message=>{
 const id=message?.id,command=message?.command,args=message?.args;
 if(!Number.isSafeInteger(id)||!commands.has(command)||!args||typeof args!=='object'||Array.isArray(args)||active>=4){if(Number.isSafeInteger(id)&&process.connected)process.send({id,ok:false});return;}
 active++;
 try{
  // The module defaults to XEAPI, which requires a separate key bootstrap.
  // Fixed WEAPI reaches the official service without that fragile dependency;
  // callers cannot select a proxy, domain, unblock mode, or crypto variant.
  const options=command==='song_url_v1'?{...args,cookie:args.cookie||{},crypto:'weapi'}:command==='login_status'?{...args,cookie:args.cookie||{}}:args;
  const result=await api[command](options);
  if(process.connected)process.send({id,ok:true,result});
 }catch{if(process.connected)process.send({id,ok:false});}
 finally{active--;}
});
