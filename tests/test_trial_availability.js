'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSourceAvailability}=require('../source_availability');
const url='https://m7.music.126.net/trial.mp3';
test('anonymous API trial stays marked as a trial and unsafe audio URLs are rejected',async()=>{
 const service=createSourceAvailability({getBases:()=>[],trusted:u=>u===url,json:async()=>({data:[{id:1,url,freeTrialInfo:{start:0,end:30000}},{id:2,url:'https://other.example/evil',freeTrialInfo:{start:0,end:30000}}]})});
 const rows=await service.check(['1','2']);assert.equal(rows[0].trialAvailable,true);assert.equal(rows[0].state,'unavailable');assert.equal(rows[1].trialAvailable,undefined);
});
test('trial durations are reported correctly when an anonymous API uses seconds or milliseconds',async()=>{
 const service=createSourceAvailability({getBases:()=>[],trusted:u=>u===url,json:async()=>({data:[{id:1,url,freeTrialInfo:{start:0,end:30}},{id:2,url,freeTrialInfo:{start:0,end:30000}}]})});
 const rows=await service.check(['1','2']);assert.equal(rows[0].trialSeconds,30);assert.equal(rows[1].trialSeconds,30);
});
