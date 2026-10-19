'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
function service(options={}){const p=path.join(__dirname,'../online_media.js');assert.ok(fs.existsSync(p),'memory-only service is required');return require(p).createOnlineMedia(options);}
const source='https://m7.music.126.net/audio/test.mp3';
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
test('anonymous URL + lyric resolution uses no filesystem, skips trial data, preserves bilingual text',async()=>{
 const seen=[];const s=service({fetchImpl:async(url,opts)=>{seen.push([String(url),opts]);return String(url).includes('lyric')?json({code:200,lrc:{lyric:'[00:00.10]original'},tlyric:{lyric:'[00:00.10]翻译'}}):json({code:200,data:[{id:1,url:source,freeTrialInfo:null,type:'mp3',time:240000}]});}});
 const track=await s.open('1');assert.match(track.url,/^music-preview:\/\/audio\//);assert.equal(track.streaming,true);
 const l=await s.lyrics('1');assert.equal(l.found,true);assert.match(l.translated_lrc,/翻译/);assert.ok(seen.every(([,o])=>o.cache==='no-store'&&o.credentials==='omit'));
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../online_media.js'),'utf8'),/require\(['"](?:node:)?fs['"]\)/);
 s.close();
});
test('stream starts before complete response, forwards byte range and cancels on next/stop',async()=>{
 let aborted=false,pulls=0;const s=service({fetchImpl:async(url,o)=>{
  if(String(url)!==source)return json({code:200,data:[{url:source,type:'mp3'}]});
  assert.equal(o.headers.Range,'bytes=0-');o.signal.addEventListener('abort',()=>{aborted=true});
  return new Response(new ReadableStream({pull(c){pulls++;if(pulls===1)c.enqueue(Buffer.from('ID3'+'.'.repeat(40)));else return new Promise(()=>{});},cancel(){aborted=true;}}),{status:206,headers:{'content-type':'audio/mpeg','content-range':'bytes 0-999/1000','content-length':'1000'}});
 }});
 const item=await s.open('1');const response=await s.handle(new Request(item.url,{headers:{Range:'bytes=0-'}}));
 assert.equal(response.status,206);assert.equal(response.headers.get('cache-control'),'no-store');
 const reader=response.body.getReader();const data=await reader.read();assert.equal(Buffer.from(data.value).subarray(0,3).toString(),'ID3');
 s.close();assert.equal(aborted,true);assert.equal((await s.handle(new Request(item.url))).status,404);
});
test('paid/trial sources do not fall back to download and unsafe redirects never get fetched',async()=>{
 const trial=service({fetchImpl:async()=>json({code:200,data:[{url:source,freeTrialInfo:{start:0,end:30000}}]})});
 await assert.rejects(()=>trial.open('1'),/试听|播放|权限|音源/);trial.close();
 const seen=[];const s=service({fetchImpl:async(url)=>{seen.push(String(url));if(String(url)===source)return new Response(null,{status:302,headers:{location:'http://169.254.169.254/latest/meta-data/'}});return json({code:200,data:[{url:source}]});}});
 const x=await s.open('2');assert.equal((await s.handle(new Request(x.url))).status,403);assert.ok(!seen.some(u=>u.includes('169.254')));s.close();
});
test('invalid IDs/ranges rejected; advertised audio with JSON body rejected',async()=>{
 const s=service({fetchImpl:async(url)=>String(url)===source?new Response('{"error":401}',{headers:{'content-type':'audio/mpeg'}}):json({code:200,data:[{url:source}]})});
 await assert.rejects(()=>s.open('../1'),/ID/);const x=await s.open('1');
 assert.equal((await s.handle(new Request(x.url,{headers:{Range:'bytes=0-1,4-5'}}))).status,400);
 assert.equal((await s.handle(new Request(x.url))).status,415);s.close();
});
test('late source response cannot replace a newer selection',async()=>{
 let release;const wait=new Promise(r=>{release=r});
 const s=service({fetchImpl:async(url)=>{if(decodeURIComponent(String(url)).includes('[1]'))await wait;return json({code:200,data:[{url:source}]});}});
 const old=s.open('1').catch(e=>e);const next=await s.open('2');release();assert.ok((await old) instanceof Error);
 assert.equal(s.currentURL(),next.url);s.close();
});
