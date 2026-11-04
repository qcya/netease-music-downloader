'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createOnlineMedia}=require('../online_media');
const base='https://example.test',cdn='https://m7.music.126.net/test';
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
function flac(seconds){const b=Buffer.alloc(50);b.write('fLaC',0);b.writeUIntBE(34,5,3);const rate=44100n, samples=BigInt(seconds)*rate;b.writeBigUInt64BE((rate<<44n)|samples,18);return b;}
function setup(seconds=180){const seen=[];const s=createOnlineMedia({getBases:()=>[base],fetchImpl:async(url,opts)=>{
 seen.push({url:String(url),opts});if(String(url).includes('/song/detail/'))return json({code:200,songs:[{id:123,dt:180000}]});
 if(String(url).includes('/meting/'))return new Response(null,{status:302,headers:{location:cdn}});
 if(String(url)===cdn)return new Response(flac(seconds),{status:206,headers:{'content-type':'audio/mpeg','content-range':'bytes 0-49/50'}});
 return json({code:200,data:[{id:123,url:null}]});
 }});return {s,seen};}
test('Meting FLAC is played only after length and trusted redirect are verified',async()=>{
 const {s,seen}=setup();const x=await s.open('123');assert.equal(x.streaming,true);const r=await s.handle(new Request(x.url,{headers:{Range:'bytes=0-'}}));assert.equal(r.headers.get('content-type'),'audio/flac');assert.equal((await r.arrayBuffer()).byteLength,50);
 assert.ok(seen.some(x=>x.url.includes('/meting/?')&&x.opts.credentials==='omit'));s.close();
});
test('Meting short sample cannot masquerade as a complete song',async()=>{const {s}=setup(30);await assert.rejects(()=>s.open('123'),/音源|地址|试听/);s.close()});
test('Meting never follows an untrusted redirect or sends an account cookie',async()=>{
 const seen=[];const s=createOnlineMedia({getBases:()=>[base],fetchImpl:async(url,opts)=>{seen.push({url:String(url),opts});
  if(String(url).includes('/song/detail/'))return json({code:200,songs:[{id:123,dt:180000}]});
  if(String(url).includes('/meting/'))return new Response(null,{status:302,headers:{location:'http://169.254.169.254/private'}});
  return json({code:200,data:[{id:123,url:null}]});}});
 await assert.rejects(()=>s.open('123'));assert.ok(!seen.some(x=>x.url.includes('169.254')));assert.ok(seen.every(x=>x.opts.credentials==='omit'));s.close();
});
test('unknown song duration and non-FLAC response cannot be marked complete',async()=>{
 for(const response of [json({code:200,songs:[]}),json({code:200,songs:[{id:123,dt:180000}]})]){
  const s=createOnlineMedia({getBases:()=>[base],fetchImpl:async(url)=>String(url).includes('/song/detail/')?response:String(url).includes('/meting/')?new Response(null,{status:302,headers:{location:cdn}}):String(url)===cdn?new Response('ID3 not a FLAC',{headers:{'content-type':'audio/mpeg'}}):json({code:200,data:[{id:123,url:null}]})});
  await assert.rejects(()=>s.open('123'));s.close();
 }
});
test('invalid partial ranges, empty bodies and oversized chunks are rejected',async()=>{
 for(const makeResponse of [
  ()=>new Response(flac(180),{status:206,headers:{'content-range':'bytes 1-50/100'}}),
  ()=>new Response(flac(180),{status:206,headers:{'content-range':'bytes 0-49/50','content-length':'70000'}}),
  ()=>new Response(new Uint8Array(0),{status:200}),
  ()=>new Response(new Uint8Array(65537),{status:200})]){
  const s=createOnlineMedia({getBases:()=>[base],fetchImpl:async(url)=>String(url).includes('/song/detail/')?json({code:200,songs:[{id:123,dt:180000}]}):String(url).includes('/meting/')?makeResponse():json({code:200,data:[{id:123,url:null}]})});
  await assert.rejects(()=>s.open('123'));s.close();
 }
});
test('direct Meting response ignoring Range reads only a bounded prefix and streams',async()=>{
 let calls=0,cancelled=false,pulls=0;
 const s=createOnlineMedia({getBases:()=>[base],fetchImpl:async(url)=>{
  if(String(url).includes('/song/detail/'))return json({code:200,songs:[{id:123,dt:180000}]});
  if(String(url).includes('/meting/')){calls++;if(calls===1)return new Response(new ReadableStream({pull(c){pulls++;c.enqueue(flac(180));},cancel(){cancelled=true;}},{highWaterMark:0}),{headers:{'content-type':'audio/mpeg','content-length':'10000000'}});return new Response(flac(180),{headers:{'content-type':'audio/mpeg'}});}
  return json({code:200,data:[{id:123,url:null}]});}});
 const x=await s.open('123');assert.equal(pulls,1);assert.equal(cancelled,true);
 const r=await s.handle(new Request(x.url));assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'audio/flac');assert.equal((await r.arrayBuffer()).byteLength,50);s.close();
});
test('Meting uses its own redirect-capable fetch while ordinary sources retain the original fetch',async()=>{
 let fallbackCalls=0,ordinaryCalls=0;const s=createOnlineMedia({getBases:()=>[base],
  fetchImpl:async(url)=>{ordinaryCalls++;if(String(url).includes('/song/detail/'))return json({code:200,songs:[{id:123,dt:180000}]});return json({code:200,data:[{id:123,url:null}]});},
  metingFetchImpl:async(url,opts)=>{fallbackCalls++;assert.equal(opts.credentials,'omit');if(String(url).includes('/meting/'))return new Response(null,{status:302,headers:{location:cdn}});return new Response(flac(180),{status:206,headers:{'content-type':'audio/mpeg','content-range':'bytes 0-49/50'}});}});
 const x=await s.open('123');const r=await s.handle(new Request(x.url,{headers:{Range:'bytes=0-'}}));assert.equal(r.status,206);await r.arrayBuffer();assert.ok(ordinaryCalls>0);assert.equal(fallbackCalls,3);s.close();
});
