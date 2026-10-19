'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
test('first launch enables unlocked lyrics; stored lock, switch and negative-monitor coordinates survive reload',()=>{
 const source=fs.readFileSync(path.join(root,'main.js'),'utf8');
 const code=source.slice(source.indexOf('function config()'),source.indexOf('function ensureData()'));
 const {normalizeLyrics}=require('../lyric_preferences'),{normalizePosition}=require('../lyric_position');
 let stored=null;
 const config=vm.runInNewContext(code+';config',{fs:{readFileSync(){if(stored===null)throw Error('ENOENT');return JSON.stringify(stored)}},path,getDefaultDir:()=>'/music',configFile:()=>'/settings',normalizeLyrics,normalizePosition,BACKGROUND_EXTS:new Set()});
 assert.equal(config().desktopLyricsEnabled,true,'new installation must show desktop lyrics');
 assert.equal(config().floatingLyrics.mouseThrough,false);
 stored={floatingLyrics:{mouseThrough:true},floatingLyricsPosition:{x:-600,y:180}};
 assert.equal(config().desktopLyricsEnabled,true,'old config without switch gets new default');
 assert.equal(config().floatingLyrics.mouseThrough,true);
 assert.deepEqual(JSON.parse(JSON.stringify(config().floatingLyricsPosition)),stored.floatingLyricsPosition);
 stored.desktopLyricsEnabled=false;assert.equal(config().desktopLyricsEnabled,false,'explicit off is not a default');
});
test('availability does not interrupt current playback; no audio request, no trial or failed lookup advertised as playable',async()=>{
 const calls=[],source='https://m7.music.126.net/test.mp3';
 const s=require('../online_media').createOnlineMedia({fetchImpl:async u=>{
  calls.push(String(u));const url=new URL(u),ids=JSON.parse(url.searchParams.get('ids'));
  return json({code:200,data:ids.map(id=>({id,url:String(id)==='2'?null:source,freeTrialInfo:String(id)==='3'?{start:0,end:30}:null}))});
 }});
 const playing=await s.open('9');
 assert.equal(typeof s.availability,'function','availability must be a separate non-playing operation');
 const rows=await s.availability(['1','2','3']);
 assert.deepEqual(rows.map(r=>r.state),['available','unavailable','unavailable']);
 assert.ok(rows.every(r=>!Object.hasOwn(r,'url')),'never send expiring source URLs to the UI');
 assert.equal(s.currentURL(),playing.url,'checking cards cannot stop playing song');
 assert.ok(calls.every(u=>u.includes('/api/song/enhance/')),'only metadata is fetched');
 const count=calls.length;await s.availability(['1','2','3']);assert.equal(calls.length,count,'short-lived memory reuse');
 s.close();
 const broken=require('../online_media').createOnlineMedia({fetchImpl:async()=>{throw Error('timeout')}});
 assert.equal((await broken.availability(['1']))[0].state,'unknown','network error is not a rights verdict');broken.close();
});
test('availability is keyed by provider and expires; invalid IDs rejected; parallel requests coalesce',async()=>{
 let bases=['http://localhost:1234'],calls=0,clock=0;
 const s=require('../online_media').createOnlineMedia({getBases:()=>bases,now:()=>clock,fetchImpl:async u=>{
  calls++;await new Promise(r=>setTimeout(r,2));const x=new URL(u);return json({code:200,data:x.searchParams.get('id').split(',').map(id=>({id,url:x.origin+'/a.mp3'}))});
 }});
 assert.equal(typeof s.availability,'function');
 await Promise.all([s.availability(['1']),s.availability(['1'])]);assert.equal(calls,1);
 clock=10*60*1000;await s.availability(['1']);assert.equal(calls,2);
 bases=['http://localhost:4321'];await s.availability(['1']);assert.equal(calls,3);
 await assert.rejects(()=>s.availability(['../1']),/ID/);await assert.rejects(()=>s.availability(Array(41).fill('1')),/40/);s.close();
});
function tasteFixture(t){
 const file=path.join(root,'taste_discovery.js');assert.ok(fs.existsSync(file),'taste-aware retrieval must replace unrelated global playlist sampling');
 const {createTasteDiscoveryService,PROFILES}=require(file);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'taste-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let offline=false,clock=new Date(2026,9,19).getTime();const calls=[];const catalog=new Map();let sid=100;
 for(const p of Object.values(PROFILES))for(const seed of p.seeds){if(!catalog.has(seed.query))catalog.set(seed.query,{id:sid++,name:seed.title,artists:[{name:seed.artist||p.label}],duration:180000});}
 const service=createTasteDiscoveryService({getFile:()=>path.join(dir,'cache.json'),now:()=>clock,fetchJSON:async(u,o={})=>{
  calls.push(u);if(offline)throw Error('offline');const url=new URL(u);const args=o.body?new URLSearchParams(o.body):url.searchParams;const term=args.get('s')||args.get('keywords'),type=Number(args.get('type'));
  if(type===1000)return {code:200,result:{playlists:[{id:Math.abs([...term].reduce((n,c)=>n+c.codePointAt(0),0)),name:term+' 精选',trackCount:60,playCount:100000}]}};
  const hit=catalog.get(term);return {code:200,result:{songs:hit?[{id:999999,name:'无关钢琴铃声',duration:3000},hit,{...hit,id:hit.id+10000,name:hit.name+' (伴奏)'}]:[]}};
 }});return {service,calls,catalog,setOffline:v=>offline=v,setNow:v=>clock=v,dir};
}
test('mixed discovery covers five expressed tastes and favors identifiable titles, not random playlist members',async t=>{
 const f=tasteFixture(t),r=await f.service.get({});
 assert.equal(r.ok,true);assert.equal(r.songs.length,8);assert.ok(r.songs.every(s=>s.reason&&s.taste));
 assert.deepEqual(new Set(r.songs.map(s=>s.taste)),new Set(['vocaloid','bilibili','cantonese','electronic','chinese']));
 assert.ok(r.songs.filter(s=>s.familiar).length>=6);assert.ok(!r.songs.some(s=>s.name.includes('伴奏')||s.id==='999999'));
 assert.ok(r.playlists.length>=5);assert.ok(r.playlists.every(p=>p.reason));
 assert.ok(!f.calls.some(u=>u.includes('/playlist/list')),'cannot fall back to generic top playlists');
 const calls=f.calls.length;const repeat=await f.service.get({});assert.deepEqual(repeat.songs,r.songs);assert.equal(f.calls.length,calls);
 const next=await f.service.get({batch:1});assert.ok(next.songs.every(s=>!r.songs.some(a=>a.id===s.id)),'a new batch never repeats displayed seed titles');assert.equal(next.exhausted,true,'the seed-only fixture has no new candidate catalog');
});
test('exclusions, stale cache labeling and API failures never invent recommendation tracks',async t=>{
 const f=tasteFixture(t),a=await f.service.get({category:'vocaloid'});
 const b=await f.service.get({category:'vocaloid',excludeIds:a.songs.map(s=>s.id)});assert.ok(b.songs.every(s=>!a.songs.some(x=>x.id===s.id)));
 f.setOffline(true);f.setNow(new Date(2026,9,20).getTime());const stale=await f.service.get({category:'vocaloid'});assert.equal(stale.offline,true);assert.equal(stale.day,'2026-10-19');assert.ok(stale.songs.length);
 const empty=await f.service.get({category:'cantonese'});assert.equal(empty.ok,false);assert.deepEqual(empty.songs,[]);
 await assert.rejects(f.service.get({category:'../../etc'}),/分类/);
});
