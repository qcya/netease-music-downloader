'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLocalCovers,safeCoverURL,lookupTerms,matchingCover}=require('../local_covers');
test('online lookup requires exact title and artists, and a unique song ID',()=>{
 assert.deepEqual(lookupTerms('乱名.mp3',{title:'夜曲',artist:'周杰伦'}),{title:'夜曲',artist:'周杰伦'});
 assert.deepEqual(lookupTerms('夜曲 - 周杰伦.mp3',{}),{title:'夜曲',artist:'周杰伦'});
 assert.equal(lookupTerms('夜曲.mp3',{}),null);assert.equal(lookupTerms('别的 - 周杰伦.mp3',{title:'夜曲'}),null);
 const song=(id,name,artist,cover='https://p1.music.126.net/art.jpg')=>({id,name,artists:[{name:artist}],album:{picUrl:cover}});
 assert.equal(matchingCover([song(1,'夜曲','另一位'),song(2,'夜曲','周杰伦')],'夜曲','周杰伦'),'https://p1.music.126.net/art.jpg');
 assert.equal(matchingCover([song(1,'夜曲','另一位')],'夜曲','周杰伦'),'');
 assert.equal(matchingCover([song(1,'夜曲','周杰伦'),song(2,'夜曲','周杰伦','')],'夜曲','周杰伦'),'');
 assert.equal(matchingCover([song(1,'夜曲','周杰伦')],'夜曲',''),'');
});
test('returns reliable song IDs from filename or unique metadata even without artwork',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-id-'));try{
  const names=['已有 [42].mp3','夜曲 - 周杰伦.mp3','仅封面.mp3','多个 - 歌手.mp3'];for(const name of names)fs.writeFileSync(path.join(dir,name),'x');
  const service=createLocalCovers({resolve:n=>path.join(dir,n),readEmbedded:async files=>files.map(file=>file.includes('仅封面')?{cover:'data:image/png;base64,iVBORw0KGgo=',title:'唯一',artist:'歌手'}:{cover:''}),fetchDetails:async()=>({}),fetchSearch:async(title,artist)=>title==='多个'?[{id:2,name:title,artists:[{name:artist}]},{id:3,name:title,artists:[{name:artist}]}]:[{id:11,name:title,artists:[{name:artist}]}]});
  const rows=await service.get(names);assert.equal(rows[0].id,'42');assert.equal(rows[1].id,'11');assert.equal(rows[1].cover,'');assert.equal(rows[2].id,'11');assert.match(rows[2].cover,/^data:image\/png/);assert.equal(rows[3].id,'');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('embedded cover stays usable while a timed-out ID search retries',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-id-retry-'));try{
  const name='标题 - 歌手.mp3';fs.writeFileSync(path.join(dir,name),'x');let calls=0;
  const service=createLocalCovers({resolve:n=>path.join(dir,n),readEmbedded:async()=>[{cover:'data:image/png;base64,iVBORw0KGgo=',title:'标题',artist:'歌手'}],fetchDetails:async()=>({}),fetchSearch:async(title,artist)=>{calls++;if(calls===1)throw Error('timeout');return [{id:98,name:title,artists:[{name:artist}]}];}});
  const first=(await service.get([name]))[0];assert.equal(first.id,'');assert.match(first.cover,/^data:image/);
  const second=(await service.get([name]))[0];assert.equal(second.id,'98');assert.match(second.cover,/^data:image/);assert.equal(calls,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('name lookup respects tags, avoids path disclosure and retries network failures',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-match-'));try{
  const name='夜曲 - 周杰伦.mp3';fs.writeFileSync(path.join(dir,name),'x');let searches=0;
  const service=createLocalCovers({resolve:n=>path.join(dir,n),readEmbedded:async()=>[{cover:'',title:'夜曲',artist:'周杰伦'}],fetchDetails:async()=>({}),fetchSearch:async(title,artist)=>{searches++;assert.equal(title,'夜曲');assert.equal(artist,'周杰伦');if(searches===1)throw Error('timeout');return [{id:1,name:title,artists:[{name:artist}],album:{picUrl:'https://p1.music.126.net/cover'}}];}});
  assert.equal((await service.get([name]))[0].cover,'');assert.equal((await service.get([name]))[0].cover,'https://p1.music.126.net/cover');assert.equal(searches,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('definitive name miss is only cached briefly; concurrency is bounded',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-miss-'));try{
  const names=Array.from({length:8},(_,i)=>`曲${i} - 歌手.mp3`);for(const name of names)fs.writeFileSync(path.join(dir,name),'x');let clock=0,searches=0,active=0,peak=0;
  const service=createLocalCovers({resolve:n=>path.join(dir,n),readEmbedded:async files=>files.map(()=>({cover:''})),fetchDetails:async()=>({}),now:()=>clock,fetchSearch:async()=>{searches++;active++;peak=Math.max(active,peak);await new Promise(r=>setTimeout(r,5));active--;return [];}});
  await Promise.all([service.get(names.slice(0,4)),service.get(names.slice(4))]);assert.equal(searches,8);assert.ok(peak<=3);
  await service.get(names.slice(0,4));assert.equal(searches,8);clock=5*60*1000+1;await service.get(names.slice(0,4));assert.equal(searches,12);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('embedded covers win, known IDs use matching official covers, failures can retry',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'local-art-'));try{
  const names=['本地.mp3','下载 [42].mp3','无封面.mp3'];for(const name of names)fs.writeFileSync(path.join(dir,name),'x');let details=0,reads=0;
  const service=createLocalCovers({resolve:n=>path.join(dir,n),readEmbedded:async files=>{reads++;return files.map(file=>({cover:file.includes('本地')?'data:image/png;base64,iVBORw0KGgo=':''}));},fetchDetails:async ids=>{details++;assert.deepEqual(ids,['42']);return details===1?{}:{42:'http://p1.music.126.net/art.jpg'};}});
  const first=await service.get(names);assert.match(first[0].cover,/^data:image\/png/);assert.equal(first[1].cover,'');assert.equal(first[2].cover,'');
  const second=await service.get(names);assert.equal(second[1].cover,'https://p1.music.126.net/art.jpg');assert.equal(details,2);
  await service.get(names);assert.equal(details,2);assert.equal(reads,2);assert.equal(safeCoverURL('https://music.126.net.evil.test/a'),'');
  await assert.rejects(service.get(['a','b','c','d','e']),/最多/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
