const {test}=require('node:test'),assert=require('node:assert/strict'),lrc=require('../app/lrc');
test('YRC keeps real Unicode word timestamps, rests and translated line alignment',()=>{
 const rows=lrc.parseLyrics('[00:01.00]你好 world\n[00:05.00]次の行','[00:01.00]Hello 世界','[1000,3000](1000,500,0)你(1600,800,0)好 (2500,1000,0)world\n[5000,1200](5000,600,0)次の(5600,600,0)行');
 assert.equal(rows[0].text,'你好 world');assert.equal(rows[0].translation,'Hello 世界');assert.equal(rows[0].words[1].time,1.6);assert.equal(rows[0].words[2].duration,1);assert.equal(rows[1].text,'次の行');
});
test('missing or malformed YRC retains ordinary LRC without fabricating word timings',()=>{
 const rows=lrc.parseLyrics('[00:01]普通歌词','','not YRC');assert.equal(rows[0].text,'普通歌词');assert.equal(rows[0].words,undefined);
});
test('word animation interpolates its audio clock, freezes on pause/seek and releases hidden work',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');let now=0,id=0;const frames=new Map(),window={},document={hidden:false};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/word-lyrics.js'),'utf8'),{window,document,WeakMap,performance:{now:()=>now},requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:n=>frames.delete(n)});
 const seen=[],clock=window.MusicWords.clock(t=>seen.push(t));clock.sample(3,true);assert.equal(seen.at(-1),3);now=100;const [key,callback]=frames.entries().next().value;frames.delete(key);callback();assert.equal(seen.at(-1),3.1);
 clock.sample(8,false);assert.equal(frames.size,0);now=2000;assert.equal(seen.at(-1),8);document.hidden=true;clock.sample(9,true);assert.equal(frames.size,0);clock.stop();
});
test('translation progress uses sung durations, freezes over rests and preserves graphemes',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),window={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/word-lyrics.js'),'utf8'),{window,WeakMap,Intl});
 const words=[{time:1,duration:1,text:'Hello'},{time:4,duration:1,text:' world'}],progress=window.MusicWords.translationProgress;
 for(const [time,value] of [[0,0],[1.5,.25],[2,.5],[3.5,.5],[4.5,.75],[5,1],[1.25,.125]])assert.equal(progress(words,time),value);
 assert.equal(progress([],1),null);
 assert.deepEqual(Array.from(window.MusicWords.graphemes('e\u0301👨‍👩‍👧‍👦中')),['e\u0301','👨‍👩‍👧‍👦','中']);
});
