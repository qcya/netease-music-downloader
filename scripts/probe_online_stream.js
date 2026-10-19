'use strict';
// Informational live probe: anonymous access, no credentials or music files.
const {createOnlineMedia}=require('../online_media');
const {createDiscoveryService}=require('../discovery_service');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'metadata-probe-'));
 try{
  const d=createDiscoveryService({getFile:()=>path.join(dir,'metadata.json'),fetchJSON:async(u,o)=>{const r=await fetch(u,o);if(!r.ok)throw Error('HTTP '+r.status);return r.json();}});
  const data=await d.get({});const ids=[...new Set([...(data.songs||[]).slice(0,3).map(s=>s.id),'1397744004'])];
  for(const id of ids){const s=createOnlineMedia();const lyrics=await s.lyrics(id).catch(()=>({found:false}));try{const start=Date.now(),x=await s.open(id);const r=await s.handle(new Request(x.url,{headers:{Range:'bytes=0-1023'}}));const reader=r.body?.getReader(),chunk=await reader?.read();await reader?.cancel();console.log(JSON.stringify({id,ok:r.ok,status:r.status,type:r.headers.get('content-type'),sampleBytes:chunk?.value?.length||0,elapsedMs:Date.now()-start,lyrics:lyrics.found}));}catch(e){console.log(JSON.stringify({id,ok:false,lyrics:lyrics.found,reason:e.message}));}finally{s.close();}}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.log('Live stream probe unavailable: '+e.message);});
