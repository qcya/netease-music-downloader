'use strict';
const {createRecentDiscovery}=require('../recent_discovery');
const {createOnlineMedia}=require('../online_media');
const path=require('node:path'),fs=require('node:fs');
(async()=>{
 const folder=path.join(__dirname,'../.validation');fs.mkdirSync(folder,{recursive:true});
 const s=createRecentDiscovery({getFile:()=>path.join(folder,'recent.json'),fetchJSON:async(u,o)=>{const r=await fetch(u,o);if(!r.ok)throw Error('HTTP '+r.status);return r.json();}});
 const result=await s.get({force:true});
 console.log(JSON.stringify({kind:'recent',ok:result.ok,day:result.day,pool:result.poolSize,songs:result.songs.map(s=>({id:s.id,name:s.name,date:s.reason}))}));
 if(!result.ok||result.offline||!result.songs.length)throw Error('No live recent songs');
 const media=createOnlineMedia();
 try{
  for(const id of ['2649156123','1397744004']){
   const availability=(await media.availability([id]))[0];
   try{const track=await media.open(id,{allowTrial:availability.trialAvailable===true});const response=await media.handle(new Request(track.url,{headers:{Range:'bytes=0-1023'}}));
    const reader=response.body?.getReader(),chunk=await reader?.read();await reader?.cancel();
    console.log(JSON.stringify({kind:'audio',id,availability,previewOnly:track.previewOnly,status:response.status,bytes:chunk?.value?.length||0}));
   }catch(e){console.log(JSON.stringify({kind:'audio',id,error:e.message,availability}));}
  }
 }finally{media.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
