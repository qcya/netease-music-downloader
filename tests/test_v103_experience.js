'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {importMusic}=require('../local_import.js');
const {createPlaylistStore}=require('../local_playlist.js');
const {createQueue,step}=require('../app/playback_navigation.js');
const read=pathName=>fs.readFileSync(path.join(__dirname,'..',pathName),'utf8');
test('repeat one and stop after natural completion do not disable manual skipping',()=>{
 const songs=['A','B','C'];
 let q=createQueue(songs,1,'repeat-one');
 assert.equal(step(q,1,Math.random,'ended').index,1);
 assert.equal(step(q,1,Math.random,'manual').index,2);
 q=createQueue(songs,1,'stop-after');
 assert.equal(step(q,1,Math.random,'ended'),null);
 assert.equal(step(q,1,Math.random,'manual').index,2);
 assert.equal(step(q,-1,Math.random,'manual').index,0);
});
test('reorder persists only if exact playlist membership is supplied',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'music-reorder-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const json=path.join(root,'playlist.json');
 const store=createPlaylistStore({getDir:()=>root,getIndexFile:()=>json,
  readJSON:(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return d}},
  writeJSONAtomic:(f,d)=>fs.writeFileSync(f,JSON.stringify(d))});
 for(const file of ['A.flac','B.flac','C.flac'])fs.writeFileSync(path.join(root,file),'fLaC');
 for(const name of ['A.flac','B.flac','C.flac'])store.add('default',name);
 const before=store.list()[0].tracks;
 const reordered=[before[2],before[0],before[1]];
 assert.deepEqual(store.reorder(reordered)[0].tracks,reordered);
 assert.deepEqual(store.list()[0].tracks,reordered);
 assert.throws(()=>store.reorder([before[0],before[0],before[2]]),/过期/);
 assert.deepEqual(store.list()[0].tracks,reordered);
});
test('import copies existing music plus sidecar without changing source or overwriting colliding files',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'music-import-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const from=path.join(root,'outside'),into=path.join(root,'library');fs.mkdirSync(path.join(from,'nested'),{recursive:true});fs.mkdirSync(into);
 fs.writeFileSync(path.join(from,'nested','A.mp3'),'original');fs.writeFileSync(path.join(from,'nested','A.lrc'),'[00:01]我的歌词');
 fs.writeFileSync(path.join(into,'A.mp3'),'different');
 fs.writeFileSync(path.join(from,'nested','ignore.txt'),'skip');
 let result=await importMusic({sources:[from],destination:into});
 assert.equal(result.imported,1);assert.equal(result.lyrics,1);
 assert.equal(fs.readFileSync(path.join(into,'A.mp3'),'utf8'),'different');
 assert.equal(fs.readFileSync(path.join(into,'A (导入 2).mp3'),'utf8'),'original');
 assert.equal(fs.readFileSync(path.join(into,'A (导入 2).lrc'),'utf8'),'[00:01]我的歌词');
 assert.equal(fs.readFileSync(path.join(from,'nested','A.mp3'),'utf8'),'original');
 result=await importMusic({sources:[path.join(from,'nested','A.mp3')],destination:into});
 assert.equal(result.imported,1);
 assert.ok(fs.existsSync(path.join(into,'A (导入 3).mp3')));
});
