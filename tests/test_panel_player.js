'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('late online source does not replace a newer local track',async()=>{
 const file=path.join(__dirname,'../app/panel_player.js');assert.ok(fs.existsSync(file));const {createPlayer}=require(file);
 let release;const pending=new Promise(r=>release=r),a={paused:true,currentTime:0,duration:100,volume:.75,src:'',pause(){this.paused=true},removeAttribute(){this.src=''},load(){},async play(){this.paused=false}};
 const player=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},streamAudio:()=>pending,playLocal:async()=>({url:'file:///new.wav'})},onState:()=>{}});
 const old=player.play({key:'online:1',id:'1',name:'old'});await new Promise(r=>setImmediate(r));await player.play({key:'local:new',local:true,file:'new.wav',name:'new'});release({url:'music-preview://audio/old'});await old;
 assert.equal(a.src,'file:///new.wav');assert.equal(player.state().track.name,'new');
});

const {createPlayer}=require('../app/panel_player');
function audio(){return {paused:true,src:'',currentTime:0,duration:30,volume:.75,pause(){this.paused=true},removeAttribute(){this.src=''},load(){},async play(){this.paused=false}};}
test('stopping while a source is resolving clears busy and ignores its late result',async()=>{
 let release;const pending=new Promise(r=>release=r),a=audio(),p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},streamAudio:()=>pending}});
 const request=p.play({key:'online:1',id:'1'});await new Promise(r=>setImmediate(r));assert.equal(p.state().busy,true);
 p.stop();assert.equal(p.state().busy,false);release({url:'late'});await request;assert.notEqual(a.src,'late');
});
test('natural completion skips an unavailable candidate and starts the next usable song',async()=>{
 const rows=['a','bad','c'].map(id=>({key:'online:'+id,id,name:id})),attempts=[];
 const a=audio(),p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},streamAudio:async id=>{attempts.push(id);if(id==='bad')throw Error('unavailable');return {url:id};}}});
 await p.play(rows[0],rows);await p.step(1,'ended');assert.deepEqual(attempts,['a','bad','c']);assert.equal(a.src,'c');
});
test('a new selection cancels an older skip loop',async()=>{
 let reject;const pending=new Promise((_r,r)=>reject=r),rows=['a','bad','c'].map(id=>({key:'online:'+id,id,name:id}));
 const a=audio(),attempts=[],p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},streamAudio:id=>{attempts.push(id);return id==='bad'?pending:Promise.resolve({url:id});}}});
 await p.play(rows[0],rows);const skipping=p.step(1);await new Promise(r=>setImmediate(r));await p.play({key:'online:new',id:'new',name:'new'});reject(Error('unavailable'));await skipping;assert.equal(a.src,'new');assert.deepEqual(attempts,['a','bad','new']);
});
test('all unavailable candidates terminate after one traversal',async()=>{
 let count=0;const p=createPlayer({audio:audio(),bridge:{stopOnlinePlayback:async()=>{},streamAudio:async()=>{count++;throw Error('no source');}}}),rows=['a','b'].map(id=>({key:id,id}));
 await p.play(rows[0],rows);assert.equal(await p.step(1),false);assert.equal(count,3);
});
test('renaming playlist files preserves current audio and updates next-play target',async()=>{
 const a=audio(),p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},playLocal:async file=>({url:file})}}),row={key:'local:a.wav',file:'a.wav',name:'a',local:true};
 await p.play(row,[row]);p.renameLocal('a.wav','[playlist] a.wav');assert.equal(a.src,'a.wav');assert.equal(a.paused,false);await p.step();assert.equal(a.src,'[playlist] a.wav');
});
test('rename during source resolution discards the stale filename and resolves the new file',async()=>{
 let release;const pending=new Promise(r=>release=r),a=audio(),p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},playLocal:file=>file==='a.wav'?pending:Promise.resolve({url:file})}});
 const old=p.play({key:'local:a.wav',file:'a.wav',local:true});await new Promise(r=>setImmediate(r));await p.renameLocal('a.wav','renamed.wav');release({url:'a.wav'});await old;
 assert.equal(p.state().track.file,'renamed.wav');assert.equal(a.src,'renamed.wav');assert.deepEqual(p.state().queue.tracks,['local:renamed.wav']);
});
