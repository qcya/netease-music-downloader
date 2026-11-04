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
test('artwork and matched lyric ID received during local source preparation are preserved',async()=>{
 let release;const pending=new Promise(r=>release=r),a=audio(),tracks=[];
 const p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},playLocal:()=>pending},onTrack:track=>tracks.push(track)});
 const row={key:'local:a.mp3',file:'a.mp3',name:'A',artists:'歌手',local:true};
 const playing=p.play(row,[row]);await new Promise(r=>setImmediate(r));p.updateLocalArtwork('a.mp3','data:image/png;base64,abcd','123');
 release({url:'file:a.mp3',id:null});assert.equal(await playing,true);
 assert.equal(p.state().track.id,'123');assert.equal(p.state().track.cover_url,'data:image/png;base64,abcd');assert.equal(tracks[0].id,'123');assert.equal(tracks[0].cover_url,'data:image/png;base64,abcd');
});
test('queue boundary loads additional rows and preserves extension across steps',async()=>{
 const rows=['1','2','3','4'].map(id=>({key:id,id})),calls=[];
 const p=createPlayer({audio:audio(),bridge:{stopOnlinePlayback:async()=>{},streamAudio:async id=>({url:id})}});
 await p.play(rows[0],rows.slice(0,2),{extendQueue:async ctx=>{calls.push(ctx.direction);assert.equal(ctx.updateQueue(rows.slice(0,calls.length+2)),true);return true;}});
 await p.step();await p.step();assert.equal(p.state().track.id,'3');await p.step();assert.equal(p.state().track.id,'4');assert.deepEqual(calls,[1,1]);
});
test('extension preserves sorted page order after an unavailable song and moves into the next page',async()=>{
 const rows=['a','bad','b','c','d'].map(id=>({key:id,id})),attempts=[];
 const p=createPlayer({audio:audio(),bridge:{stopOnlinePlayback:async()=>{},streamAudio:async id=>{attempts.push(id);if(id==='bad')throw Error('unavailable');return {url:id};}}});
 await p.play(rows[3],[rows[0],rows[2],rows[3],rows[1]],{extendQueue:async ctx=>ctx.updateQueue(rows)});
 await p.step();assert.equal(p.state().track.id,'d');assert.deepEqual(attempts,['c','bad','d']);assert.deepEqual(p.state().queue.tracks,['a','b','c','bad','d']);
});
test('shuffle loads a new batch when exhausted and preserves previous-track history',async()=>{
 const rows=['a','b','c'].map(id=>({key:id,id}));let loads=0;
 const p=createPlayer({audio:audio(),bridge:{stopOnlinePlayback:async()=>{},streamAudio:async id=>({url:id})}});
 p.setMode('shuffle');await p.play(rows[0],rows.slice(0,2),{extendQueue:async ctx=>{loads++;assert.equal(ctx.direction,1);return ctx.updateQueue(rows);}});
 await p.step();assert.equal(p.state().track.id,'b');assert.equal(loads,0);
 await p.step();assert.equal(p.state().track.id,'c');assert.equal(loads,1);
 await p.step(-1);assert.equal(p.state().track.id,'b');
});
test('reverse and previous extend the correct side; repeat-one and stop-after do not on ending',async()=>{
 const rows=['0','1','2'].map(id=>({key:id,id})),calls=[];
 const p=createPlayer({audio:audio(),bridge:{stopOnlinePlayback:async()=>{},streamAudio:async id=>({url:id})}});
 p.setMode('reverse');await p.play(rows[1],rows.slice(1),{extendQueue:async ctx=>{calls.push(ctx.direction);ctx.updateQueue(rows);return true;}});await p.step();assert.equal(p.state().track.id,'0');assert.deepEqual(calls,[-1]);
 p.setMode('repeat-one');await p.step(1,'ended');assert.equal(p.state().track.id,'0');p.setMode('stop-after');assert.equal(await p.step(1,'ended'),false);assert.deepEqual(calls,[-1]);
});
test('previous extends a missing prefix; a fully loaded queue still wraps normally',async()=>{
 const rows=['0','1','2'].map(id=>({key:id,id})),calls=[];
 const p=createPlayer({audio:audio(),bridge:{stopOnlinePlayback:async()=>{},streamAudio:async id=>({url:id})}});
 await p.play(rows[1],rows.slice(1),{extendQueue:async ctx=>{calls.push(ctx.direction);ctx.updateQueue(rows);return true;}});
 await p.step(-1);assert.equal(p.state().track.id,'0');assert.deepEqual(calls,[-1]);
 await p.play(rows[2],rows,{extendQueue:async()=>true});await p.step(1,'ended');assert.equal(p.state().track.id,'0');
});
test('failed extension does not wrap and stale extension cannot override a later same-song selection',async()=>{
 const rows=['a','b','c'].map(id=>({key:id,id}));let release,finish;const gate=new Promise(r=>release=r);
 const p=createPlayer({audio:audio(),bridge:{stopOnlinePlayback:async()=>{},streamAudio:async id=>({url:id})}});
 await p.play(rows[1],rows.slice(0,2),{extendQueue:async ctx=>{await gate;finish=ctx.updateQueue(rows);return true;}});
 const old=p.step();await new Promise(r=>setImmediate(r));await p.play(rows[1],[rows[1]]);release();assert.equal(await old,false);assert.equal(finish,false);assert.deepEqual(p.state().queue.tracks,['b']);
 await p.play(rows[1],rows.slice(0,2),{extendQueue:async()=>false});assert.equal(await p.step(),false);assert.equal(p.state().track.id,'b');
 await p.play(rows[1],rows.slice(0,2),{extendQueue:async()=>{throw Error('offline');}});assert.equal(await p.step(),false);assert.equal(p.state().track.id,'b');
 await p.play(rows[1],rows.slice(0,2),{extendQueue:async ctx=>ctx.updateQueue([rows[2]])});assert.equal(await p.step(),false);assert.deepEqual(p.state().queue.tracks,['a','b']);
});
test('adding more playlist songs to the queue keeps the current audio and permits cross-page next',async()=>{
 const a=audio(),p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},streamAudio:async id=>({url:'song:'+id})}});
 const rows=['1','2','3'].map(id=>({key:'online:'+id,id,name:id}));await p.play(rows[0],[rows[0],rows[1]]);const serial=p.serial(),src=a.src;
 assert.equal(p.updateQueue(rows,rows[0].key),true);assert.equal(p.serial(),serial);assert.equal(a.src,src);
 await p.step(1);await p.step(1);assert.equal(p.state().track.id,'3');assert.equal(p.updateQueue(rows,rows[0].key),false);
});
test('removing the currently playing local file clears it without leaving a stale audio source',async()=>{
 const a=audio(),p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},playLocal:async()=>({url:'file:track'})}});
 const song={key:'local:a.mp3',file:'a.mp3',name:'A',local:true};await p.play(song,[song]);p.removeLocal(song.file);
 assert.equal(p.state().track,null);assert.equal(a.src,'');assert.equal(a.paused,true);assert.deepEqual(p.state().rows,[]);
});
test('deleting a local copy currently playing from an online result clears the active source',async()=>{
 const a=audio(),p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},streamAudio:async()=>({url:'file:track',fromLocal:true,localFile:'a.mp3'})}});
 const song={key:'online:1',id:'1',name:'A',local:false};await p.play(song,[song]);p.removeLocal('a.mp3');
 assert.equal(p.state().track,null);assert.equal(a.src,'');assert.equal(a.paused,true);assert.equal(p.state().rows[0].fromLocal,false);
});
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
