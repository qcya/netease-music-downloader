'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createDiscoveryService,normalizePlaylist}=require('../discovery_service');
function officialFixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'public-discovery-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const calls=[];
 const service=createDiscoveryService({getFile:()=>path.join(dir,'cache.json'),fetchJSON:async(url,options)=>{
  calls.push({url,options});const u=new URL(url);
  if(u.hostname!=='music.163.com')throw Error('not the public provider');
  if(u.pathname==='/api/playlist/list')return {code:200,playlists:Array.from({length:12},(_,i)=>({id:i+1,name:'公开歌单 '+i,trackCount:40,coverImgUrl:'http://p2.music.126.net/cover.jpg'}))};
  if(u.pathname==='/api/playlist/detail')return {code:200,result:{name:'公开歌单',trackCount:45,tracks:Array.from({length:40},(_,i)=>({id:i+1+Number(u.searchParams.get('id'))*100,name:'公开歌曲 '+i,artists:[{name:'歌手'}],album:{picUrl:'http://p1.music.126.net/song.jpg'},duration:180000}))}};
  return {code:404};
 }});return {service,calls};
}
test('default discovery reads anonymous official public metadata with working URL shapes',async t=>{
 const {service,calls}=officialFixture(t);const data=await service.get({});
 assert.equal(data.ok,true);assert.equal(data.songs.length,8);assert.equal(data.playlists.length,6);
 assert.ok(data.playlists.every(p=>p.cover_url.startsWith('https://')));
 assert.ok(calls.every(c=>c.options.credentials==='omit'),'no account credentials in public recommendation requests');
});
test('recommended playlist detail works without the separate download API and reports partial results',async t=>{
 const {service,calls}=officialFixture(t);assert.equal(typeof service.playlist,'function');
 const data=await service.playlist('42');assert.equal(data.tracks.length,40);assert.equal(data.total,45);assert.equal(data.possibly_incomplete,true);
 assert.ok(data.source.startsWith('https://music.163.com/api/'));
 await assert.rejects(service.playlist('../42'),/ID/);assert.ok(calls.length>=1,'partial preview also tries public ID-catalog endpoints');
});
test('only official CDN http cover URLs can be upgraded to https',()=>{
 assert.equal(normalizePlaylist({id:1,name:'封面',picUrl:'http://p1.music.126.net/a.jpg'}).cover_url,'https://p1.music.126.net/a.jpg');
 for(const picUrl of ['http://evil.test/a','file:///tmp/a','https://music.126.net.evil.test/a','https://u:p@p1.music.126.net/a'])assert.equal(normalizePlaylist({id:1,name:'封面',picUrl}).cover_url,'');
});
test('explicit custom provider is isolated and does not silently fall back to other hosts',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'custom-discovery-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const calls=[];
 const service=createDiscoveryService({getFile:()=>path.join(dir,'cache.json'),getBases:()=>['http://127.0.0.1:8888'],fetchJSON:async url=>{calls.push(url);throw Error('offline');}});
 assert.equal((await service.get({})).ok,false);assert.ok(calls.every(u=>new URL(u).hostname==='127.0.0.1'));
});
