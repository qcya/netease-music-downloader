'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSourceAvailability}=require('../source_availability');
test('explicit preview intent can stream supplied trial audio without advertising a full song',async()=>{
 const {createOnlineMedia}=require('../online_media');
 const s=createOnlineMedia({fetchImpl:async()=>new Response(JSON.stringify({data:[{id:1,url:'https://m7.music.126.net/trial.mp3',freeTrialInfo:{start:0,end:30000}}]}))});
 const row=(await s.availability(['1']))[0];assert.equal(row.state,'unavailable');assert.equal(row.trialAvailable,true);
 await assert.rejects(()=>s.open('1'),/试听/);
 const preview=await s.open('1',{allowTrial:true});assert.equal(preview.previewOnly,true);assert.equal(preview.trialSeconds,30);s.close();
});
test('play intent re-resolves a negative card result instead of keeping it unplayable',async()=>{
 let available=false,calls=0;
 const s=createSourceAvailability({getBases:()=>[],trusted:u=>!!u,json:async()=>{calls++;return {data:[{id:1,url:available?'https://m7.music.126.net/a.mp3':null}]}}});
 assert.equal((await s.check(['1']))[0].state,'unavailable');available=true;
 assert.equal((await s.resolve('1')).state,'available');assert.equal(calls,2);
});
test('configured provider failure falls back to official metadata',async()=>{
 const calls=[];const s=createSourceAvailability({getBases:()=>['https://example.org'],trusted:u=>!!u,json:async u=>{
 calls.push(u);if(u.startsWith('https://example.org'))throw Error('down');return {data:[{id:1,url:'https://m7.music.126.net/a.mp3'}]};}});
 assert.equal((await s.resolve('1')).state,'available');assert.equal(calls.length,2);
});
test('playback retries a higher quality source when standard has no URL',async()=>{
 const levels=[],s=createSourceAvailability({getBases:()=>['https://api.example'],trusted:u=>!!u,json:async u=>{levels.push(u);return {data:[{id:1,url:u.includes('level=exhigh')?'https://m7.music.126.net/full.mp3':null}]};}});
 const row=await s.resolve('1',new AbortController().signal);assert.equal(row.state,'available');assert.ok(levels.some(u=>u.includes('level=exhigh')));
});
