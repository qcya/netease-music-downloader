'use strict';
// Informational live-provider check. It never downloads audio or uses credentials.
const {createDiscoveryService}=require('../discovery_service');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-live-'));
const service=createDiscoveryService({getFile:()=>path.join(dir,'cache.json'),fetchJSON:async(url,options)=>{
 const response=await fetch(url,options);if(!response.ok)throw Error('HTTP '+response.status);return response.json();
}});
(async()=>{try{const data=await service.get({});console.log(JSON.stringify({live:true,ok:data.ok,day:data.day,playlists:data.playlists.length,songs:data.songs.length,playlistNames:data.playlists.slice(0,2).map(x=>x.name),offline:data.offline,message:data.message},null,2));}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error('Live provider check unavailable:',e.message);process.exitCode=1;});
