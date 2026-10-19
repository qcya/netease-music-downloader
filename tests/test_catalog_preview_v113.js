'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPlaylistReader}=require('../playlist_reader');
const raw=id=>({id,name:'曲目 '+id});
const normalizeSong=s=>s&&({id:String(s.id),name:s.name});
test('classic endpoint lies with trackCount=10: v6 catalog still resolves all 970 tracks',async()=>{
 const ids=Array.from({length:970},(_,i)=>i+1),calls=[];
 const reader=createPlaylistReader({normalizeSong,fetchJSON:async url=>{
  const u=new URL(url);calls.push(u.pathname);
  if(u.pathname==='/api/playlist/detail')return {code:200,result:{trackCount:10,tracks:ids.slice(0,10).map(raw)}};
  if(u.pathname==='/api/v6/playlist/detail')return {code:200,playlist:{trackCount:970,trackIds:ids.map(id=>({id})),tracks:ids.slice(0,10).map(raw)}};
  if(u.pathname==='/api/song/detail')return {code:200,songs:JSON.parse(u.searchParams.get('ids')).map(raw)};
  return {code:404};
 }});
 const r=await reader.read('1');assert.equal(r.tracks.length,970);assert.equal(r.total,970);assert.equal(r.possibly_incomplete,false);assert.ok(calls.includes('/api/v6/playlist/detail'));
});
test('classic-only preview is explicitly incomplete when catalog lookup is unavailable',async()=>{
 const reader=createPlaylistReader({normalizeSong,fetchJSON:async url=>new URL(url).pathname==='/api/playlist/detail'?{code:200,result:{trackCount:10,tracks:Array.from({length:10},(_,i)=>raw(i+1))}}:{code:404}});
 const r=await reader.read('2');assert.equal(r.tracks.length,10);assert.equal(r.possibly_incomplete,true);
});
