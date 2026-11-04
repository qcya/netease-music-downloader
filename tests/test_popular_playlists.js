'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPopularPlaylists}=require('../popular_playlists');
const make=(id)=>({id,name:'歌单 '+id,coverImgUrl:'http://p1.music.126.net/example.jpg',trackCount:30,playCount:100,creator:{nickname:'作者'}});
test('hot playlists use real order, page eight at a time and refresh to a different batch',async()=>{
 const offsets=[];const service=createPopularPlaylists({fetchJSON:async url=>{const u=new URL(url);assert.equal(u.pathname,'/api/playlist/list');assert.equal(u.searchParams.get('order'),'hot');const offset=Number(u.searchParams.get('offset'));offsets.push(offset);return {code:200,total:300,more:true,playlists:Array.from({length:8},(_,i)=>make(offset+i+1))};}});
 const one=await service.get({page:1}),two=await service.get({page:2}),next=await service.get({page:1,force:true});
 assert.deepEqual(offsets,[0,8,40]);assert.equal(one.playlists[0].id,'1');assert.equal(two.playlists[0].id,'9');assert.equal(next.playlists[0].id,'41');assert.equal(next.playlists[0].cover_url,'https://p1.music.126.net/example.jpg');assert.equal(next.playlists[0].playCount,100);
});
test('offline refresh preserves prior successful batch and reports cache honestly',async()=>{
 let fail=false;const service=createPopularPlaylists({fetchJSON:async()=>{if(fail)throw Error('offline');return {code:200,total:1,more:false,playlists:[make(7)]};}});
 const online=await service.get();fail=true;const offline=await service.get({force:true});assert.equal(offline.offline,true);assert.equal(offline.playlists[0].id,online.playlists[0].id);assert.match(offline.message,/之前/);
});
test('playlist pages are ordered and can load a larger queue',async()=>{
 const ids=Array.from({length:30},(_,i)=>({id:i+1})),songs=ids.map(({id})=>({id,name:'歌曲 '+id,dt:180000}));
 const service=createPopularPlaylists({fetchJSON:async url=>{const u=new URL(url);if(u.pathname.endsWith('/playlist/detail'))return {code:200,playlist:{trackCount:30,trackIds:ids,tracks:songs.slice(0,10)}};if(u.pathname.endsWith('/song/detail')){const wanted=JSON.parse(u.searchParams.get('ids'));return {code:200,songs:songs.filter(s=>wanted.includes(String(s.id)))};}throw Error('unexpected endpoint');}});
 const page=await service.playlist('100',{offset:8,limit:8});assert.deepEqual(page.tracks.map(s=>s.id),['9','10','11','12','13','14','15','16']);assert.equal(page.total,30);assert.equal(page.hasMore,true);assert.equal(page.missingCount,0);
 const all=await service.playlist('100',{offset:0,limit:500});assert.equal(all.tracks.length,30);assert.equal(all.hasMore,false);
 await assert.rejects(service.playlist('100',{limit:501}),/分页/);
});
test('playlist details retain short and trial-marked songs for per-page availability sorting',async()=>{
 const raw=[{id:1,name:'短歌',dt:15000},{id:2,name:'试听曲',dt:180000,freeTrialInfo:{start:0,end:30000}}];
 const service=createPopularPlaylists({fetchJSON:async url=>{
  const u=new URL(url);if(u.pathname.endsWith('/playlist/detail'))return {code:200,playlist:{trackCount:2,trackIds:[{id:1},{id:2}],tracks:raw}};
  throw Error('unexpected endpoint');
 }});
 const page=await service.playlist('100',{offset:0,limit:8});
 assert.deepEqual(page.tracks.map(s=>s.id),['1','2']);assert.equal(page.tracks[0].duration_seconds,15);assert.equal(page.missingCount,0);
 assert.ok(raw[1].freeTrialInfo,'normalization must not mutate the upstream response');
});
