'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {create}=require('../app/playlist_name_dialog.js');
const {createCategoryStore}=require('../playlist_categories.js');

class FakeElement {
  constructor(doc){this.doc=doc;this.listeners=new Map();this.hidden=true;this.disabled=false;this.value='';this.textContent='';this.focusCount=0;}
  addEventListener(name,handler){const list=this.listeners.get(name)||[];list.push(handler);this.listeners.set(name,list);}
  async emit(name,extra={}){
    const event={target:this,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},...extra};
    for(const handler of this.listeners.get(name)||[])await handler(event);
    return event;
  }
  focus(){this.doc.activeElement=this;this.focusCount++;}
  select(){this.selected=true;}
}
function page(){
  const names=['playlist-name-dialog','playlist-name-form','playlist-name-title','playlist-name-input','playlist-name-error','playlist-name-cancel','playlist-name-save'];
  const doc={activeElement:null,getElementById(name){return this.elements[name]||null},elements:{}};
  for(const name of names)doc.elements[name]=new FakeElement(doc);
  const opener=new FakeElement(doc);opener.focus();
  return {doc,opener,els:doc.elements,dialog:create(doc)};
}
function categoryFixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'playlist-dialog-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'playlist-categories.json');
  const tracks=['[歌单] test.flac'];
  const build=()=>createCategoryStore({
    getFile:()=>file,getTracks:()=>tracks,
    readJSON:(p,fallback)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return fallback}},
    writeJSONAtomic:(p,data)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(data));fs.renameSync(p+'.tmp',p)}
  });
  return {build,tracks};
}

test('new playlist and both kinds of rename use a real input form and survive restart',async t=>{
  const fixture=categoryFixture(t),store=fixture.build();
  const {doc,opener,els,dialog}=page();
  const createPromise=dialog.open({
    title:'新建歌单',confirmText:'创建歌单',onSubmit:name=>store.create(name)
  });
  assert.equal(els['playlist-name-dialog'].hidden,false);
  assert.equal(els['playlist-name-input'].selected,true);
  els['playlist-name-input'].value='  游戏OST  ';
  await els['playlist-name-form'].emit('submit');
  assert.equal(await createPromise,'游戏OST');
  assert.equal(els['playlist-name-dialog'].hidden,true);
  assert.equal(doc.activeElement,opener);
  const id=store.list().categories[0].id;

  const renamePromise=dialog.open({
    title:'重命名歌单',initialName:'游戏OST',
    onSubmit:name=>store.rename(id,name)
  });
  assert.equal(els['playlist-name-input'].value,'游戏OST');
  els['playlist-name-input'].value='睡前音乐';
  await els['playlist-name-form'].emit('submit');
  assert.equal(await renamePromise,'睡前音乐');

  const defaultPromise=dialog.open({
    title:'重命名默认歌单',initialName:'未分类',
    onSubmit:name=>store.renameDefault(name)
  });
  els['playlist-name-input'].value='我的收藏';
  await els['playlist-name-form'].emit('submit');
  assert.equal(await defaultPromise,'我的收藏');

  const reloaded=fixture.build().list();
  assert.equal(reloaded.categories.find(c=>c.id===id).name,'睡前音乐');
  assert.equal(reloaded.defaultName,'我的收藏');
  assert.deepEqual(reloaded.assignments,{},'editing names cannot reassign tracks');
});

test('invalid and duplicate playlist names stay open for correction, not silent failure',async t=>{
  const store=categoryFixture(t).build();
  store.create('已有歌单');
  const {els,dialog}=page();
  const result=dialog.open({title:'新建歌单',onSubmit:name=>store.create(name)});
  const input=els['playlist-name-input'],form=els['playlist-name-form'],error=els['playlist-name-error'];
  input.value=' ';
  await form.emit('submit');
  assert.match(error.textContent,/1—32/);
  assert.equal(els['playlist-name-dialog'].hidden,false);
  input.value='已有歌单';
  await form.emit('submit');
  assert.match(error.textContent,/已存在/);
  assert.equal(els['playlist-name-dialog'].hidden,false);
  input.value='新歌单';
  await input.emit('input');
  assert.equal(error.textContent,'');
  await form.emit('submit');
  assert.equal(await result,'新歌单');
  assert.equal(store.list().categories.length,2);
});

test('Escape, Cancel and backdrop click never send IPC writes',async()=>{
  const {els,dialog}=page();
  let writes=0;
  const begin=()=>dialog.open({title:'重命名',onSubmit:()=>{writes++}});
  let pending=begin();
  const event=await els['playlist-name-dialog'].emit('keydown',{key:'Escape'});
  assert.equal(event.defaultPrevented,true);
  assert.equal(await pending,null);
  pending=begin();
  await els['playlist-name-cancel'].emit('click');
  assert.equal(await pending,null);
  pending=begin();
  await els['playlist-name-dialog'].emit('click');
  assert.equal(await pending,null);
  assert.equal(writes,0);
});

test('pending IPC requests cannot be submitted twice or dismissed',async()=>{
  const {els,dialog}=page();
  let calls=0,finish;
  const request=new Promise(resolve=>{finish=resolve});
  const pending=dialog.open({title:'新建歌单',onSubmit:async()=>{calls++;await request}});
  els['playlist-name-input'].value='批量测试';
  const write=els['playlist-name-form'].emit('submit');
  assert.equal(els['playlist-name-save'].disabled,true);
  await els['playlist-name-form'].emit('submit');
  await els['playlist-name-dialog'].emit('keydown',{key:'Escape'});
  assert.equal(calls,1);
  assert.equal(els['playlist-name-dialog'].hidden,false);
  finish();
  await write;
  assert.equal(await pending,'批量测试');
  assert.equal(els['playlist-name-dialog'].hidden,true);
});

test('renderer loads the editor before event bindings and neither action uses native prompt()',()=>{
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'app/index.html'),'utf8');
  const renderer=fs.readFileSync(path.join(root,'app/renderer.js'),'utf8');
  const names=['playlist-name-dialog','playlist-name-form','playlist-name-input','playlist-name-save','playlist-name-cancel'];
  for(const name of names)assert.ok(html.includes('id="'+name+'"'));
  assert.ok(html.indexOf('playlist_name_dialog.js')<html.indexOf('renderer.js'));
  assert.match(renderer,/window\.PlaylistNameDialog\.create\(document\)/);
  assert.match(renderer,/await bridge\.playlistCategoryCreate\(name\)/);
  assert.match(renderer,/await bridge\.playlistCategoryRename\(category\.id,value\)/);
  assert.match(renderer,/await bridge\.playlistRenameDefault\(value\)/);
  assert.doesNotMatch(renderer,/\bprompt\s*\(/);
  const empty=renderer.split('if(!tracks.length&&!categories.length){')[1].split('const updatePlaylistOrder=')[0];
  assert.doesNotMatch(empty,/\breturn\s*;/,'empty default group must still render and be renamable');
});
