'use strict';
const fs=require('node:fs');const path=require('node:path');
/** Minimal local rotating diagnostics. Never log cookies, API keys or full request URLs. */
function createLogger(userData){
 const dir=path.join(userData,'logs');const file=path.join(dir,'application.log');
 function log(level,event,message=''){
  try{fs.mkdirSync(dir,{recursive:true});if(fs.existsSync(file)&&fs.statSync(file).size>2_000_000){
    fs.renameSync(file,path.join(dir,'application.old.log'));}
    const safe=String(message).replace(/(MUSIC_U|token|password|cookie)\s*[:=]\s*\S+/gi,'$1=[REDACTED]').slice(0,1200);
    fs.appendFileSync(file,JSON.stringify({time:new Date().toISOString(),level,event,message:safe})+'\n');
  }catch{}
 }
 return {info:(e,m)=>log('info',e,m),warn:(e,m)=>log('warn',e,m),error:(e,m)=>log('error',e,m)};
}
module.exports={createLogger};
