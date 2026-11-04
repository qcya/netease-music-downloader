'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createUserPlaylists}=require('../user_playlists');
const a='[歌单] A.mp3',b='[歌单] B.mp3',c='C.flac',missing='丢失.wav',oldId='e64fd1de-b2e1-467b-82a0-ab8fa6e7fc91';
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'user-playlists-')),file=path.join(dir,'lists.json');let files=[a,b,c].map(name=>({name}));
 const legacy=[{id:'default',name:'我的歌单',tracks:[a,b,missing]}],cats={categories:[{id:oldId,name:'夜晚'}],defaultName:'原默认',assignments:{[b]:oldId},order:[b,a,missing]};
 const store=createUserPlaylists({getFile:()=>file,getFiles:async()=>files,getLegacyCategories:()=>cats,getLegacyPlaylists:()=>legacy});
 return {dir,file,store,legacy,cats,setFiles:v=>{files=v}};
}
test('migration preserves existing playlists, missing references and default ordering without renaming audio',async()=>{
 const {store,legacy,cats}=fixture(),original=JSON.stringify({legacy,cats}),result=await store.list(),all=result.playlists.find(p=>p.id==='default'),night=result.playlists.find(p=>p.id===oldId),old=result.playlists.find(p=>p.name==='原默认');
 assert.deepEqual(all.tracks,[b,a,missing,c]);assert.deepEqual(all.missing,[missing]);assert.deepEqual(night.tracks,[b]);assert.deepEqual(old.tracks,[a,missing]);assert.equal(JSON.stringify({legacy,cats}),original);
});
test('songs can be copied and moved across lists, and merging retains both source lists',async()=>{
 const {store}=fixture();let out=await store.create('白天');const day=out.playlists.find(p=>p.name==='白天').id;
 out=await store.transfer('default',day,[a,b],true);assert.deepEqual(out.playlists.find(p=>p.id===day).tracks,[a,b]);assert.ok(out.playlists.find(p=>p.id==='default').tracks.includes(a));
 out=await store.transfer(day,oldId,[a],false);assert.ok(out.playlists.find(p=>p.id===day).tracks.includes(a));assert.ok(out.playlists.find(p=>p.id===oldId).tracks.includes(a));
 out=await store.transfer(day,oldId,[b],true);assert.deepEqual(out.playlists.find(p=>p.id===day).tracks,[a]);
 out=await store.merge([day,oldId],'合并');assert.deepEqual(out.playlists.find(p=>p.name==='合并').tracks,[a,b]);assert.ok(out.playlists.find(p=>p.id===day));assert.ok(out.playlists.find(p=>p.id===oldId));
 await assert.rejects(store.create('合并'),/已存在/);await assert.rejects(store.remove('default'),/不能删除/);
});
test('reorder persists, new files append, missing and same-name conflicts never overwrite',async()=>{
 const f=fixture();let state=await f.store.list(),old=state.playlists.find(p=>p.id==='default').tracks;
 await f.store.reorderTracks('default',[...old].reverse());f.setFiles([a,b,c,'新歌.mp3'].map(name=>({name})));state=await f.store.list();assert.deepEqual(state.playlists.find(p=>p.id==='default').tracks,[...old].reverse().concat('新歌.mp3'));
 await f.store.create('新歌单');state=await f.store.list();const target=state.playlists.find(p=>p.name==='新歌单').id;
 await assert.rejects(f.store.add(target,[missing]),/不存在/);f.setFiles([{name:a},{name:a}]);await assert.rejects(f.store.add(target,[a]),/同名/);state=await f.store.list();assert.deepEqual(state.playlists.find(p=>p.id===target).tracks,[]);
});
test('invalid saved data remains untouched and concurrent additions do not overwrite',async()=>{
 const f=fixture();fs.writeFileSync(f.file,'{"version":1,"playlists":"bad"}');await assert.rejects(f.store.list(),/损坏/);assert.equal(fs.readFileSync(f.file,'utf8'),'{"version":1,"playlists":"bad"}');
 const g=fixture();await g.store.list();await Promise.all([g.store.create('甲'),g.store.create('乙')]);const names=(await g.store.list()).playlists.map(p=>p.name);assert.ok(names.includes('甲')&&names.includes('乙'));
});
test('stale legacy filenames resolve to existing prefix counterparts without touching files',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'playlist-prefix-')),file=path.join(dir,'lists.json');
 const store=createUserPlaylists({getFile:()=>file,getFiles:async()=>[{name:'[歌单] A.mp3'}],getLegacyCategories:()=>({categories:[{id:oldId,name:'夜晚'}],assignments:{'A.mp3':oldId},order:['A.mp3']}),getLegacyPlaylists:()=>[{tracks:['A.mp3']}]});
 const lists=(await store.list()).playlists;assert.deepEqual(lists.find(p=>p.id==='default').tracks,['[歌单] A.mp3']);assert.deepEqual(lists.find(p=>p.id===oldId).tracks,['[歌单] A.mp3']);
});
test('forget removes missing files from all playlists but never removes live or ambiguous names',async()=>{
 const f=fixture();let data=await f.store.list();assert.ok(data.playlists.filter(p=>p.tracks.includes(missing)).length>=2);
 await assert.rejects(f.store.forgetFiles([a,missing]),/仍存在/);
 data=await f.store.list();assert.ok(data.playlists.some(p=>p.tracks.includes(missing)),'failed mixed operation must be atomic');
 data=await f.store.forgetFiles([missing]);assert.ok(data.playlists.every(p=>!p.tracks.includes(missing)));
 f.setFiles([{name:a},{name:a}]);await assert.rejects(f.store.forgetFiles([a]),/仍存在/);
 data=await f.store.list();assert.ok(data.playlists.some(p=>p.tracks.includes(a)),'same-name file must protect references');
});
