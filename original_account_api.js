'use strict';
// Preserve the original NetEase method contracts; fallback only on transport or
// incompatible responses, never pretend an unavailable song became authorized.
function createOriginalAccountApi({getOriginal,fallback}){
 return Object.fromEntries(['login_qr_key','login_qr_create','login_qr_check','login_status','song_url_v1'].map(command=>[command,async args=>{
  const original=getOriginal();if(!original||command==='login_qr_create')return fallback(command,args);
  try{
   let r;
   if(command==='login_qr_key'){
    r=await original.invoke('loginQrKey',[]);const data=r.body?.data;
    if(data?.code!==200||!data.unikey)throw Error();return {body:{code:200,data:{unikey:data.unikey}}};
   }
   if(command==='login_qr_check'){
    r=await original.invoke('loginQrCheck',[args.key]);if(![800,801,802,803].includes(Number(r.body?.code)))throw Error();return r;
   }
   if(command==='login_status'){
    r=await original.invoke('loginStatusWithCookie',[args.cookie||'']);if(!r.body||!Number.isFinite(Number(r.body.code)))throw Error();return {body:{data:r.body}};
   }
   r=await original.invoke('songUrlV1',[Number(args.id),args.level],args.cookie||'');
   if(!Array.isArray(r.body?.data))throw Error();return r;
  }catch{return fallback(command,args);}
 }]));
}
module.exports={createOriginalAccountApi};
