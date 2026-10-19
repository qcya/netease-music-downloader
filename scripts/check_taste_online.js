'use strict';
// Public metadata only; no account cookies and no audio downloads.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createTasteDiscoveryService}=require('../taste_discovery');
const {createOnlineMedia}=require('../online_media');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'taste-online-')),results=[];
 try{
  const service=createTasteDiscoveryService({getFile:()=>path.join(dir,'metadata.json'),fetchJSON:async(u,o)=>{const r=await fetch(u,o);if(!r.ok)throw Error('HTTP '+r.status);return r.json();}});
  const media=createOnlineMedia();
  for(const options of [{category:'all',batch:0},{category:'all',batch:1},{category:'vocaloid',batch:0}]){
   const data=await service.get(options);const availability=await media.availability(data.songs.map(s=>s.id));
   const item={options,ok:data.ok,offline:data.offline,day:data.day,songs:data.songs,playlists:data.playlists,availability};results.push(item);
   console.log(JSON.stringify(item));
  }
  media.close();
  if(process.env.MUSIC_TASTE_EVIDENCE)fs.writeFileSync(process.env.MUSIC_TASTE_EVIDENCE,JSON.stringify(results,null,2));
  if(results.some(x=>!x.ok||!x.songs.length))throw Error('A taste query returned no real tracks');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
