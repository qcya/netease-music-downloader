'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createPlaybackSessionStore}=require('../playback_session');
const defaults={file:null,time:0,mode:'sequence',volume:0.75};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'playback-session-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'播放器数据','playback-session.json');
 return {root,file,store:createPlaybackSessionStore({getFile:()=>file}),write:value=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}};
}
test('persistent session survives deletion of all disposable cache and a store restart',t=>{
 const f=fixture(t),session={file:'歌曲 [123].flac',time:123.25,mode:'shuffle',volume:0.3};
 assert.deepEqual(f.store.read(),defaults);assert.deepEqual(f.store.save(session),session);
 const cache=path.join(f.root,'缓存');fs.mkdirSync(path.join(cache,'浏览器'),{recursive:true});fs.writeFileSync(path.join(cache,'浏览器','session'),'disposable');
 fs.rmSync(cache,{recursive:true});assert.deepEqual(createPlaybackSessionStore({getFile:()=>f.file}).read(),session);
 assert.deepEqual(JSON.parse(fs.readFileSync(f.file,'utf8')),session);
});
test('only known fields are saved and all five playback modes round-trip',t=>{
 const f=fixture(t);
 for(const mode of ['sequence','reverse','shuffle','stop-after','repeat-one']){
  const session={file:'本地.mp3',time:2,mode,volume:0};
  assert.deepEqual(f.store.save({...session,cookie:'never-persist',unknown:{unsafe:true}}),session);
  assert.deepEqual(f.store.read(),session);assert.equal(fs.readFileSync(f.file,'utf8').includes('never-persist'),false);
 }
 assert.deepEqual(f.store.save({file:'music.m4a',time:604801,mode:'reverse',volume:1}),{file:'music.m4a',time:604800,mode:'reverse',volume:1});
});
test('unsafe paths and nonaudio names never survive session normalization',t=>{
 const f=fixture(t);
 for(const file of ['../song.mp3','folder/song.mp3','folder\\song.mp3','C:\\song.mp3','C:/song.mp3','https://example/song.mp3','stream:bad.mp3','bad\u0000.mp3','bad\n.mp3','cover.png','song.mp3.exe','..',{},42]){
  assert.equal(f.store.save({file}).file,null,JSON.stringify(file));
 }
 for(const file of ['歌.mp3','song.FLAC','song.m4a','song.ogg','song.wav','song.aac'])assert.equal(f.store.save({file}).file,file);
});
test('invalid scalar fields normalize to defaults, without numeric coercion',t=>{
 const f=fixture(t);
 for(const value of [NaN,Infinity,-Infinity,-1,'0.5',null,{},true]){
  const result=f.store.save({time:value,volume:value,mode:'unsupported'});
  assert.deepEqual(result,defaults);
 }
 assert.deepEqual(f.store.save({}),defaults);
 for(const value of [null,undefined,[],42,'session',()=>{}])assert.throws(()=>f.store.save(value),TypeError);
});
test('malformed stored JSON returns defaults and preserves the corrupt original',t=>{
 const f=fixture(t),broken='{ malformed original';f.write(broken);
 assert.deepEqual(f.store.read(),defaults);assert.equal(fs.readFileSync(f.file,'utf8'),broken);
 assert.throws(()=>f.store.save({mode:'shuffle'}),{code:'DATA_CORRUPT'});assert.equal(fs.readFileSync(f.file,'utf8'),broken);
 for(const value of ['null','[]','42','"session"','{"file":"../escape.mp3","time":-12,"mode":"bad","volume":2}']){
  f.write(value);assert.deepEqual(f.store.read(),defaults);assert.equal(fs.readFileSync(f.file,'utf8'),value);
 }
});
