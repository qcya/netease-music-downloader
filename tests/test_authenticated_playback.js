'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSourceAvailability}=require('../source_availability');
const url='https://m7.music.126.net/authorized.mp3';
test('authenticated sources are used before anonymous providers without sending credentials to them',async()=>{
 let publicCalls=0;const calls=[];
 const service=createSourceAvailability({getBases:()=>['https://public.example'],getAuthState:()=>({enabled:true,revision:1}),authLookup:async(id,level)=>{calls.push([id,level]);return {code:200,data:[{id:Number(id),url}]};},trusted:u=>u===url,json:async()=>{publicCalls++;throw Error('should not be called');}});
 assert.equal((await service.resolve('123')).state,'available');assert.deepEqual(calls,[['123','standard']]);assert.equal(publicCalls,0);
});
test('account changes invalidate cached and in-flight availability',async()=>{
 let revision=1,release;const pending=new Promise(r=>release=r);let calls=0;
 const service=createSourceAvailability({getBases:()=>[],getAuthState:()=>({enabled:revision===1,revision}),authLookup:async()=>{calls++;await pending;return {data:[{id:123,url}]};},trusted:u=>u===url,json:async()=>({data:[{id:123,url:null}]})});
 const old=service.check(['123']);await new Promise(r=>setImmediate(r));revision=2;release();await assert.rejects(old,/账号状态/);
 assert.equal((await service.check(['123']))[0].state,'unavailable');assert.equal(calls,1);
});
test('authenticated trial stays marked as a trial and unsafe audio URLs are rejected',async()=>{
 const lookup=async(id)=>({data:[{id:Number(id),url:id==='1'?url:'https://other.example/evil',freeTrialInfo:{start:0,end:30000}}]});
 const service=createSourceAvailability({getBases:()=>[],getAuthState:()=>({enabled:true,revision:1}),authLookup:lookup,trusted:u=>u===url,json:async()=>({data:[]})});
 const rows=await service.check(['1','2']);assert.equal(rows[0].trialAvailable,true);assert.equal(rows[0].state,'unavailable');assert.equal(rows[1].trialAvailable,undefined);
});
test('trial durations are reported correctly when an API uses seconds or milliseconds',async()=>{
 const service=createSourceAvailability({getBases:()=>[],getAuthState:()=>({enabled:true,revision:1}),authLookup:async id=>({data:[{id:Number(id),url,freeTrialInfo:{start:0,end:id==='1'?30:30000}}]}),trusted:u=>u===url,json:async()=>({data:[]})});
 const rows=await service.check(['1','2']);assert.equal(rows[0].trialSeconds,30);assert.equal(rows[1].trialSeconds,30);
});
