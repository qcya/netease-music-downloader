'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {pageOrder}=require('../app/track_order');
test('only confirmed unavailable items move to the bottom of the current page, preserving relative order',()=>{
 const rows=['1','2','3','4','5','6','7','8'].map(id=>({id}));
 const states=new Map([['2',{state:'unavailable'}],['3',{state:'unknown'}],['4',{state:'unavailable',trialAvailable:true}],['6',{state:'unavailable',fromLocal:true}],['7',{state:'unavailable'}]]);
 assert.deepEqual(pageOrder(rows,states).map(s=>s.id),['1','3','4','5','6','8','2','7']);
 assert.deepEqual(rows.map(s=>s.id),['1','2','3','4','5','6','7','8']);
 assert.deepEqual(pageOrder([{id:'9'},{id:'10'}],new Map([['9',{state:'unavailable'}]])).map(s=>s.id),['10','9']);
});
test('local path conflicts appear last without discarding local songs',()=>{
 const rows=[{id:'a',local:true,conflict:true},{id:'b',local:true}];
 assert.deepEqual(pageOrder(rows,new Map()).map(s=>s.id),['b','a']);
});
