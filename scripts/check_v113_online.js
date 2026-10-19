'use strict';
// Metadata-only live checks. No audio requests, account credentials or invented IDs.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createTasteDiscoveryService}=require('../taste_discovery');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-metadata-v113-')),report={playlists:[],batches:[]};
 try{
  const service=createTasteDiscoveryService({getFile:()=>path.join(dir,'metadata.json'),fetchJSON:async(u,o)=>{const r=await fetch(u,o);if(!r.ok)throw Error('HTTP '+r.status);return r.json();}});
  for(const id of ['5017390341','95073804']){
   try{const r=await service.playlist(id);report.playlists.push({id,total:r.total,loaded:r.tracks.length,incomplete:r.possibly_incomplete,first:r.tracks[0]?.name,last:r.tracks.at(-1)?.name});}catch(e){report.playlists.push({id,error:e.message});}
  }
  const seen=new Set();
  for(let batch=0;batch<12;batch++){
   const r=await service.get({batch,force:batch%2===1});const duplicates=r.songs.filter(s=>seen.has(s.id)).map(s=>s.id);
   report.batches.push({batch,pool:r.poolSize,offline:r.offline,exhausted:r.exhausted,duplicates,songs:r.songs.map(s=>({id:s.id,name:s.name,artists:s.artists,reason:s.reason}))});
   for(const s of r.songs)seen.add(s.id);
   if(!r.ok||r.offline)break;
  }
  report.unique=seen.size;
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 fs.writeFileSync(process.env.MUSIC_TASTE_EVIDENCE||'v113-online-evidence.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
