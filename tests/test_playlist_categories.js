'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createCategoryStore}=require('../playlist_categories.js');
function fixture(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'music-categories-'));
 const file=path.join(tmp,'categories.json'),tracks=['[歌单] A.flac','[歌单] B.mp3','[歌单] C.flac'];
 for(const name of tracks)fs.writeFileSync(path.join(tmp,name),'audio');
 const store=createCategoryStore({getFile:()=>file,getTracks:()=>tracks,
  readJSON:(name,fallback)=>{try{return JSON.parse(fs.readFileSync(name,'utf8'))}catch{return fallback}},
  writeJSONAtomic:(name,value)=>{const temp=name+'.tmp';fs.writeFileSync(temp,JSON.stringify(value));fs.renameSync(temp,name)}});
 return {tmp,file,tracks,store,cleanup:()=>fs.rmSync(tmp,{force:true,recursive:true})};
}
test('folders categorize playlist tracks without moving or renaming physical audio or lyrics',t=>{
 const f=fixture();t.after(f.cleanup);
 fs.writeFileSync(path.join(f.tmp,'[歌单] A.lrc'),'[00:01]字幕');
 const list=f.store.create('最喜欢的歌曲'),id=list.categories[0].id;
 assert.ok(id);
 f.store.move(f.tracks[0],id);
 f.store.create('纯音乐');
 assert.equal(f.store.list().assignments[f.tracks[0]],id);
 assert.equal(fs.readFileSync(path.join(f.tmp,f.tracks[0]),'utf8'),'audio');
 assert.equal(fs.readFileSync(path.join(f.tmp,'[歌单] A.lrc'),'utf8'),'[00:01]字幕');
 const recreated=createCategoryStore({getFile:()=>f.file,getTracks:()=>f.tracks,readJSON:(p,x)=>JSON.parse(fs.readFileSync(p,'utf8')),writeJSONAtomic:(p,d)=>fs.writeFileSync(p,JSON.stringify(d))});
 assert.equal(recreated.list().assignments[f.tracks[0]],id,'classification survives reload');
 f.store.rename(id,'常听');
 assert.equal(f.store.list().categories[0].name,'常听');
 f.store.remove(id);
 assert.equal(f.store.list().assignments[f.tracks[0]],undefined,'deleting folder unclassifies songs');
 assert.equal(fs.existsSync(path.join(f.tmp,f.tracks[0])),true,'deleting a category never deletes music');
});
test('reject invalid categories and moving non-playlist tracks',t=>{
 const f=fixture();t.after(f.cleanup);
 const id=f.store.create('动漫')[0]?.id||f.store.list().categories[0].id;
 assert.throws(()=>f.store.create('动漫'),/已存在/);
 for(const n of ['', ' ', 'a/b','a\\b','X'.repeat(40)])assert.throws(()=>f.store.create(n),/分类名称/);
 assert.throws(()=>f.store.move('not-listed.flac',id),/不在我的歌单/);
 assert.throws(()=>f.store.move(f.tracks[0],'invalid'),/不存在/);
 assert.throws(()=>f.store.rename('invalid','新名称'),/不存在/);
});
test('deleted playlist entries automatically lose stale category records',t=>{
 const f=fixture();t.after(f.cleanup);
 const id=f.store.create('游戏OST').categories[0].id;
 f.store.move(f.tracks[2],id);
 f.tracks.pop();
 assert.deepEqual(f.store.list().assignments,{});
});
test('UI and IPC expose new folder actions and all toast messages appear top right',()=>{
 const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'..','preload.js'),'utf8');
 const renderer=fs.readFileSync(path.join(__dirname,'..','app/renderer.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'..','app/index.html'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','app/style.css'),'utf8');
 assert.match(html,/id="playlist-create-category"/);
 for(const op of ['categories-list','categories-create','categories-rename','categories-delete','categories-move'])assert.match(main,new RegExp("playlists:"+op));
 assert.match(preload,/playlistCategoryMove/);
 assert.match(renderer,/playlistCategoryMove\(name,category\.id\)/);
 assert.match(renderer,/dragPlaylistName=name/);
 assert.match(css,/\.toast-container\{top:55px;bottom:auto/);
 assert.match(renderer,/async function changeLocalPlaylistMembership/);
 assert.match(renderer,/await resume\(renamed,resumed\.queue\)/);
});
test('lyric visibility not gated by main focus, while settings save keeps the persisted mouse-through state',()=>{
 const floating=fs.readFileSync(path.join(__dirname,'..','floating_window.js'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 assert.doesNotMatch(floating,/if\(mainFocused\|\|/);
 assert.match(floating,/if\(floating\.isVisible\?\.\(\)\)return;/);
 assert.match(main,/persistFloatingLyricsLock/);
 assert.match(main,/mouseThrough:config\(\)\.floatingLyrics\.mouseThrough/);
 assert.match(main,/ipcMain\.handle\('lyrics:lock'/);
});

test('original unclassified playlist is renamable, persists across reloads, and keeps tracks',t=>{
 const f=fixture();t.after(f.cleanup);
 assert.equal(f.store.list().defaultName,'未分类','legacy settings keep original default name');
 f.store.renameDefault('学习时听');
 assert.equal(f.store.list().defaultName,'学习时听');
 assert.equal(f.store.list().assignments[f.tracks[0]],undefined);
 assert.throws(()=>f.store.create('学习时听'),/已存在/);
 const storeAgain=createCategoryStore({getFile:()=>f.file,getTracks:()=>f.tracks,
   readJSON:(file,v)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return v}},
   writeJSONAtomic:(file,v)=>fs.writeFileSync(file,JSON.stringify(v))});
 assert.equal(storeAgain.list().defaultName,'学习时听','rename survives process restart');
 storeAgain.create('运动歌单');
 const newId=storeAgain.list().categories[0].id;
 storeAgain.move(f.tracks[0],newId);
 assert.equal(storeAgain.list().assignments[f.tracks[0]],newId,'track belongs to new named playlist');
 assert.equal(fs.existsSync(path.join(f.tmp,f.tracks[0])),true,'playlist changes cannot remove physical tracks');
 storeAgain.remove(newId);
 assert.equal(storeAgain.list().defaultName,'学习时听','deleting a playlist never resets default name');
 assert.equal(storeAgain.list().assignments[f.tracks[0]],undefined,'songs fall back to renamed default');
});
test('playlist UI has actual New Playlist affordance, rename for default group and independent play queues',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','app/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'..','app/renderer.js'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 assert.match(html,/＋ 新建歌单/);
 assert.match(ui,/await bridge\.playlistRenameDefault\(value\)/);
 assert.match(ui,/name:meta\.defaultName\|\|'未分类'/);
 assert.match(ui,/tracks:names,index:names\.indexOf\(name\)/);
 assert.match(main,/ipcMain\.handle\('playlists:rename-default'/);
});
