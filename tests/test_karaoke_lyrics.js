'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('full-screen word brightness sweeps through each real vocal interval and rewinds on seek',()=>{
 const window={};vm.runInNewContext(fs.readFileSync(require.resolve('../app/karaoke-lyrics'),'utf8'),{window,WeakMap,Intl});
 const p=window.KaraokeLyrics.wordProgress;assert.equal(p({time:1,duration:2},0),0);assert.equal(p({time:1,duration:2},2),.5);assert.equal(p({time:1,duration:2},4),1);assert.equal(p({time:1,duration:2},1.5),.25);
});
test('untimed LRC opening lines sweep as complete lines without inventing word timestamps',()=>{
 const window={};vm.runInNewContext(fs.readFileSync(require.resolve('../app/karaoke-lyrics'),'utf8'),{window,WeakMap,Intl});
 const p=window.KaraokeLyrics.lineProgress;
 assert.equal(typeof p,'function');assert.equal(p({time:0},4,2),.5);assert.equal(p({time:4},8,6),.5);assert.equal(p({time:4},8,2),0);assert.equal(p({time:4},8,10),1);assert.equal(p({time:4},null,5),null,'unknown end must not fabricate a duration');
});
