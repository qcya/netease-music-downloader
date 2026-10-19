'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createCategoryStore}=require('../playlist_categories');
const {createPlaylistStore}=require('../local_playlist');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-v110-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir}
const read=(p,d)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){if(e.code==='ENOENT')return d;throw e}};
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v));
test('reading category metadata never rewrites a damaged source through fallback',t=>{
 const dir=fixture(t),file=path.join(dir,'categories.json'),broken='{"categories":[';fs.writeFileSync(file,broken);
 const store=createCategoryStore({getFile:()=>file,getTracks:()=>[],readJSON:()=>({}),writeJSONAtomic:write});
 store.list();assert.equal(fs.readFileSync(file,'utf8'),broken,'read must not overwrite a failed source with empty data');
});
test('durable JSON distinguishes missing and corrupt files and backs up previous good data',t=>{
 const modulePath=path.join(__dirname,'../durable_json.js');assert.ok(fs.existsSync(modulePath),'durable JSON protection is required');
 const {readJSON,writeJSONAtomic}=require(modulePath),dir=fixture(t),file=path.join(dir,'library.json');
 assert.deepEqual(readJSON(file,{}),{});writeJSONAtomic(file,{value:1});writeJSONAtomic(file,{value:2});
 assert.deepEqual(readJSON(file+'.bak',{}),{value:1});
 fs.writeFileSync(file,'{broken');assert.throws(()=>readJSON(file,{}),/损坏/);assert.equal(fs.readFileSync(file,'utf8'),'{broken');
 assert.throws(()=>writeJSONAtomic(file,{}),/损坏/);assert.equal(fs.readFileSync(file,'utf8'),'{broken');
});
test('playlist lookup and prefix renaming survive a changed download directory',t=>{
 const root=fixture(t),old=path.join(root,'old'),next=path.join(root,'new');fs.mkdirSync(old);fs.mkdirSync(next);
 fs.writeFileSync(path.join(old,'A.flac'),'audio');const file=path.join(root,'index.json');
 const store=createPlaylistStore({getDir:()=>next,getDirs:()=>[old,next],getIndexFile:()=>file,readJSON:read,writeJSONAtomic:write});
 assert.equal(store.localFile('A.flac'),path.join(old,'A.flac'));
 store.add('default','A.flac');assert.equal(store.localFile('[歌单] A.flac'),path.join(old,'[歌单] A.flac'));
 fs.writeFileSync(path.join(next,'[歌单] A.flac'),'different');assert.throws(()=>store.localFile('[歌单] A.flac'),/同名/);
});
test('one atomic metadata operation changes group and order together',t=>{
 const dir=fixture(t),file=path.join(dir,'categories.json'),tracks=['A.flac','B.flac','C.flac'];let writes=0;
 const store=createCategoryStore({getFile:()=>file,getTracks:()=>tracks,readJSON:read,writeJSONAtomic:(p,v)=>{writes++;write(p,v)}});
 const id=store.create('OST').categories[0].id;writes=0;
 assert.equal(typeof store.organize,'function');store.organize(['C.flac','A.flac','B.flac'],'C.flac',id);
 assert.equal(writes,1);assert.deepEqual(store.list().order,['C.flac','A.flac','B.flac']);assert.equal(store.list().assignments['C.flac'],id);
 assert.throws(()=>store.organize(['A.flac'],'C.flac',id),/过期|无效/);assert.equal(writes,1);
});
test('queue synchronization stays in its group, reflects order and preserves current audio',()=>{
 const modulePath=path.join(__dirname,'../app/playlist_queue.js');assert.ok(fs.existsSync(modulePath),'queue reconciliation is required');
 const {reconcile}=require(modulePath);const tracks=['C.flac','B.flac','A.flac'],meta={categories:[{id:'ost'}],assignments:{'B.flac':'ost'}};
 const q=reconcile({id:'default',tracks:['A.flac','C.flac'],index:0,mode:'sequence'},'A.flac',tracks,meta);
 assert.deepEqual(q.tracks,['C.flac','A.flac']);assert.equal(q.index,1);
 const q2=reconcile({id:'ost',tracks:['B.flac','C.flac'],index:0,mode:'sequence'},'B.flac',tracks,{categories:[{id:'ost'}],assignments:{'B.flac':'ost','C.flac':'ost'}});
 assert.deepEqual(q2.tracks,['C.flac','B.flac']);assert.equal(q2.index,1);
 const local={id:'local',tracks:['A.flac'],index:0};assert.equal(reconcile(local,'A.flac',tracks,meta),local);
});
test('valid JSON with an invalid playlist shape is not silently reinitialized',t=>{
 const dir=fixture(t),file=path.join(dir,'index.json');fs.writeFileSync(file,'{"unexpected":true}');
 const store=createPlaylistStore({getDir:()=>dir,getIndexFile:()=>file,readJSON:read,writeJSONAtomic:write});
 assert.throws(()=>store.list(),/格式|损坏/);assert.equal(fs.readFileSync(file,'utf8'),'{"unexpected":true}');
});
test('library directory registry persists old roots and reports every file beyond 1000',async t=>{
 const {createLibraryRoots}=require('../library_roots'),dir=fixture(t),a=path.join(dir,'a'),b=path.join(dir,'b');fs.mkdirSync(a);fs.mkdirSync(b);
 for(let i=0;i<1005;i++)fs.writeFileSync(path.join(a,'track'+i+'.wav'),'audio');
 let current=a;const options={getFile:()=>path.join(dir,'roots.json'),getCurrent:()=>current};const store=createLibraryRoots(options);
 store.remember(a,b);current=b;const recreated=createLibraryRoots(options);
 assert.equal((await recreated.files()).length,1005);fs.writeFileSync(path.join(b,'track1.wav'),'other');
 const files=await recreated.files();assert.equal(files.length,1006);assert.equal(files.filter(f=>f.conflict).length,2);
});
