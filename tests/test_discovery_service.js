'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function load(){const p=path.join(__dirname,'../discovery_service.js');assert.ok(fs.existsSync(p),'real discovery service must be implemented');return require(p)}
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-discover-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let offline=false,calls=0,now=new Date(2026,9,19,9).getTime();
 const fetchJSON=async url=>{calls++;if(offline)throw new Error('offline');const u=new URL(url);
  if(u.pathname==='/top/playlist')return {code:200,playlists:Array.from({length:16},(_,i)=>({id:i+1,name:'在线歌单 '+i,coverImgUrl:'https://p1.music.126.net/cover.jpg',trackCount:70}))};
  if(u.pathname==='/playlist/track/all')return {code:200,songs:Array.from({length:40},(_,i)=>({id:Number(u.searchParams.get('id'))*100+i+1,name:'歌曲 '+i,ar:[{name:'歌手'}],dt:180000,al:{picUrl:'https://p1.music.126.net/song.jpg'}}))};
  return {code:404};};
 const api=load().createDiscoveryService({getFile:()=>path.join(dir,'cache.json'),getBases:()=>['https://example.test'],fetchJSON,now:()=>now});
 return {api,setOffline:v=>offline=v,setNow:v=>now=v,calls:()=>calls};}
test('daily public selection is real, repeatable, deduplicated and another batch differs',async t=>{
 const f=fixture(t),first=await f.api.get({category:'all'}),calls=f.calls();
 assert.equal(first.ok,true);assert.equal(first.personalized,false);assert.equal(first.day,'2026-10-19');assert.equal(first.songs.length,8);assert.equal(first.playlists.length,6);
 const again=await f.api.get({category:'all'});assert.deepEqual(again.songs,first.songs);assert.equal(f.calls(),calls,'reopening uses cache');
 const next=await f.api.get({category:'all',batch:1});assert.equal(next.songs.some(x=>first.songs.some(y=>y.id===x.id)),false);
 assert.equal(new Set(next.songs.map(x=>x.id)).size,next.songs.length);
});
test('offline fallback is labeled with the actual cache date; never invents music',async t=>{
 const f=fixture(t);await f.api.get({category:'all'});f.setOffline(true);f.setNow(new Date(2026,9,20,9).getTime());
 const stale=await f.api.get({category:'all'});assert.equal(stale.offline,true);assert.equal(stale.day,'2026-10-19');assert.equal(stale.requestedDay,'2026-10-20');assert.ok(stale.songs.length);
 const noCache=await f.api.get({category:'acg'});assert.equal(noCache.ok,false);assert.deepEqual(noCache.songs,[]);assert.deepEqual(noCache.playlists,[]);
});
test('invalid category, batch and arbitrary external cover URLs are rejected or filtered',async t=>{
 const f=fixture(t);await assert.rejects(f.api.get({category:'../../etc'}),/分类/);await assert.rejects(f.api.get({batch:-1}),/批次/);
 const {normalizeSong,normalizePlaylist}=load();
 assert.equal(normalizeSong({id:1,name:'短片段',dt:20000}),null);
 assert.equal(normalizeSong({id:1,name:'试听',dt:210000,freeTrialInfo:{start:0,end:30}}),null);
 assert.equal(normalizeSong({id:2,name:'歌曲',dt:180000,al:{picUrl:'https://evil.test/image'}}).cover_url,'');
 assert.equal(normalizePlaylist({id:'javascript:1',name:'fake'}),null);
});
test('concurrent homepage opens share a fetch, dismissed tracks are excluded',async t=>{
 const f=fixture(t);const [a,b]=await Promise.all([f.api.get({}),f.api.get({})]);assert.deepEqual(a.songs,b.songs);assert.ok(f.calls()<=5);
 const filtered=await f.api.get({excludeIds:a.songs.map(s=>s.id)});assert.equal(filtered.songs.some(s=>a.songs.some(x=>x.id===s.id)),false);
});
test('an old API request cannot overwrite the cache after settings switch',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-discover-race-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let bases=['https://old.test'],release;const gate=new Promise(resolve=>{release=resolve});
 const fetchJSON=async url=>{const u=new URL(url);if(u.hostname==='old.test')await gate;
  if(u.pathname==='/top/playlist')return {code:200,playlists:[{id:u.hostname==='old.test'?1:2,name:u.hostname}]};
  if(u.pathname==='/playlist/track/all')return {code:200,songs:[{id:u.hostname==='old.test'?11:22,name:u.hostname,dt:180000}]};
  return {code:404};};
 const api=load().createDiscoveryService({getFile:()=>path.join(dir,'cache.json'),getBases:()=>bases,fetchJSON});
 const old=api.get({});bases=['https://new.test'];const latest=await api.get({});release();await old;
 assert.equal(latest.songs[0].id,'22');
 const disk=JSON.parse(fs.readFileSync(path.join(dir,'cache.json'),'utf8'));
 assert.equal(disk.all.settingsKey,JSON.stringify(bases));assert.equal(disk.all.songs[0].id,'22');
});
