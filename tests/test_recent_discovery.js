'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {normalizeSong}=require('../discovery_service');
test('song normalization preserves real release time',()=>{
 assert.equal(normalizeSong({id:1,name:'new',al:{publishTime:1790000000000}}).publishedAt,1790000000000);
});
test('recent feed excludes decade-old and undated songs, sorts by date, labels stale fallback',async t=>{
 assert.ok(fs.existsSync(path.join(__dirname,'../recent_discovery.js')),'recent service required');
 const {createRecentDiscovery}=require('../recent_discovery');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recent-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let clock=Date.UTC(2026,10,3),offline=false;
 const song=(id,age)=>({id,name:'song '+id,publishTime:age===null?0:clock-age*86400000});
 const s=createRecentDiscovery({getFile:()=>path.join(dir,'metadata.json'),now:()=>clock,fetchJSON:async()=>{
 if(offline)throw Error('offline');return {code:200,data:[song(1,3500),song(2,10),song(3,2),song(4,null)]};}});
 const r=await s.get({});assert.deepEqual(r.songs.map(s=>s.id),['3','2']);assert.equal(r.offline,false);
 assert.equal((await s.get({excludeIds:['3']})).songs.length,1);
 offline=true;clock+=86400000;const stale=await s.get({});assert.equal(stale.offline,true);assert.equal(stale.day,r.day);
});
