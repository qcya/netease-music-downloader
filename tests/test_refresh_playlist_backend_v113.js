'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createDiscoveryService}=require('../discovery_service');
const {createTasteDiscoveryService,PROFILES}=require('../taste_discovery');
function temp(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'music-v113-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return path.join(d,'cache.json');}
const song=id=>({id,name:'曲目 '+id,artists:[{name:'歌手'}],duration:180000});
test('playlist metadata preview of 10 resolves all 237 ordered IDs, including reversed detail responses',async t=>{
 const calls=[],ids=Array.from({length:237},(_,i)=>i+1);
 const api=createDiscoveryService({getFile:()=>temp(t),fetchJSON:async u=>{
  const x=new URL(u);calls.push(x.pathname);
  if(x.pathname.endsWith('/playlist/detail'))return {code:200,result:{name:'完整歌单',trackCount:237,trackIds:ids.map(id=>({id})),tracks:ids.slice(0,10).map(song)}};
  if(x.pathname.endsWith('/song/detail'))return {code:200,songs:JSON.parse(x.searchParams.get('ids')).slice().reverse().map(song)};
  return {code:404};
 }});
 const r=await api.playlist('999');
 assert.equal(r.tracks.length,237,'preview is not the whole playlist');assert.equal(r.total,237);
 assert.deepEqual(r.tracks.map(x=>x.id),ids.map(String));assert.equal(r.possibly_incomplete,false);
 assert.ok(calls.some(p=>p.endsWith('/song/detail')));
});
test('custom playlist pagination is followed even when server returns fewer than requested, without missing/duplicate songs',async t=>{
 const file=temp(t),ids=Array.from({length:135},(_,i)=>i+1),offsets=[];
 const api=createDiscoveryService({getFile:()=>file,getBases:()=>['https://fixture.test'],fetchJSON:async u=>{
  const x=new URL(u);
  if(x.pathname==='/playlist/detail')return {code:200,playlist:{trackCount:135,tracks:ids.slice(0,10).map(song)}};
  if(x.pathname==='/playlist/track/all'){const offset=Number(x.searchParams.get('offset'));offsets.push(offset);return {code:200,total:135,songs:ids.slice(offset,offset+40).map(song)};}
  return {code:404};
 }});
 const r=await api.playlist('1');assert.equal(r.tracks.length,135);assert.equal(r.possibly_incomplete,false);
 assert.deepEqual(offsets,[0,40,80,120]);
});
test('missing track details stay explicitly incomplete rather than filling with unrelated music',async t=>{
 const file=temp(t),ids=Array.from({length:25},(_,i)=>i+1);
 const api=createDiscoveryService({getFile:()=>file,fetchJSON:async u=>{
  const x=new URL(u);
  if(x.pathname.endsWith('/playlist/detail'))return {code:200,result:{trackCount:25,trackIds:ids.map(id=>({id})),tracks:ids.slice(0,10).map(song)}};
  if(x.pathname.endsWith('/song/detail'))return {code:200,songs:JSON.parse(x.searchParams.get('ids')).filter(id=>Number(id)!==24).map(song)};
  return {code:404};
 }});
 const r=await api.playlist('1');assert.equal(r.tracks.length,24);assert.equal(r.total,25);assert.equal(r.possibly_incomplete,true);assert.ok(!r.tracks.some(s=>s.id==='24'));
});
function tasteFixture(t,restricted=false){
 const file=temp(t),calls=[],terms=new Map(),anchors=new Map();let sid=10;
 for(const [taste,p] of Object.entries(PROFILES)){
  for(const s of p.seeds){anchors.set(s.query,{id:sid++,name:s.title,artists:[{name:s.artist||p.label}],duration:180000});}
  terms.set(p.related,{taste,base:sid*1000});sid+=100;
 }
 let offline=false;
 const api=createTasteDiscoveryService({getFile:()=>file,fetchJSON:async(u,o={})=>{
  if(offline)throw Error('offline');const x=new URL(u),a=o.body?new URLSearchParams(o.body):x.searchParams;
  const term=a.get('s')||a.get('keywords'),offset=Number(a.get('offset')||0);calls.push({url:u,term,offset});
  if(Number(a.get('type'))===1000)return {code:200,result:{playlists:[]}};
  const anchor=anchors.get(term);if(anchor)return {code:200,result:{songs:[anchor],songCount:1}};
  const hit=terms.get(term);const tracks=hit&&!restricted?Array.from({length:60},(_,i)=>({id:hit.base+offset+i,name:hit.taste+' 新曲 '+(offset+i),artists:[{name:term}],duration:180000})):[];
  return {code:200,result:{songs:tracks,songCount:3000}};
 }});return {api,calls,file,setOffline:v=>offline=v};
}
test('twelve recommendation refreshes use an expanding pool with no previously shown IDs',async t=>{
 const f=tasteFixture(t),seen=new Set();
 for(let batch=0;batch<12;batch++){
  const r=await f.api.get({batch});assert.equal(r.songs.length,8,'pool can supply a full batch');
  for(const s of r.songs){assert.ok(!seen.has(s.id),`batch ${batch} repeated ${s.name}`);seen.add(s.id);}
 }
 assert.equal(seen.size,96);assert.ok(f.calls.some(c=>c.term===PROFILES.cantonese.related));
});
test('force refresh also advances selection; reopening preserves selection; remembered exposure survives restart',async t=>{
 const f=tasteFixture(t),a=await f.api.get({}),b=await f.api.get({force:true});
 assert.ok(b.songs.every(s=>!a.songs.some(x=>x.id===s.id)),'refresh must not re-fetch exactly the same shortlist');
 assert.deepEqual((await f.api.get({})).songs,b.songs,'ordinary reopening is not another refresh');
 const stored=JSON.parse(fs.readFileSync(f.file,'utf8'));assert.ok(JSON.stringify(stored).includes(a.songs[0].id),'exposure persisted');
});
test('exhausted pool reports exhaustion and never loops seed titles as a new batch',async t=>{
 const f=tasteFixture(t,true),seen=new Set();let exhausted=false;
 for(let batch=0;batch<20;batch++){
  const r=await f.api.get({batch});for(const s of r.songs){assert.ok(!seen.has(s.id),`cycled ${s.name}`);seen.add(s.id);}
  if(r.exhausted){exhausted=true;break;}
 }
 assert.equal(exhausted,true);
});
test('pinned portable builder uses per-launch extraction; packaged backend path is revalidated',()=>{
 const root=path.join(__dirname,'..'),pkg=require('../package.json');
 assert.equal(pkg.devDependencies['electron-builder'],'26.0.12');
 // v26.0.12 checks !unpackDirName: true selects unique $PLUGINSDIR (not false).
 assert.equal(pkg.build.portable.unpackDirName,true,'do not reuse the same extraction folder on second launch');
 const s=fs.readFileSync(path.join(root,'main.js'),'utf8');
 const fn=s.slice(s.indexOf('async function findPython()'),s.indexOf('async function runCli('));
 assert.ok(fn.indexOf('embeddedBackend(')<fn.indexOf('if (cachedPython)'), 'revalidate standalone backend before returning cached dev interpreter');
});
