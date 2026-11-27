'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/netease-hub.js'),'utf8');
class Element{
 constructor(tag='',cls='',text=''){this.tag=tag;this.children=[];this.parent=null;this.className=cls;this.textContent=text;this.dataset={};this.hidden=false;this.style={};this.classList={add:(...names)=>{this.className+=' '+names.join(' ');},remove:(...names)=>{this.className=this.className.split(' ').filter(c=>!names.includes(c)).join(' ');},toggle:(c,on)=>{this.classList.remove(c);if(on)this.classList.add(c);}};}
 append(...nodes){for(const n of nodes){n.remove();n.parent=this;this.children.push(n);}}
 prepend(...nodes){for(const n of [...nodes].reverse()){n.remove();n.parent=this;this.children.unshift(n);}}
 before(n){this.parent.append(n);}
 insertBefore(n,b){if(!b)return this.append(n);n.parent=this;this.children.splice(this.children.indexOf(b),0,n);}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}}
 replaceChildren(...nodes){this.children.forEach(n=>{n.parent=null;});this.children=[];this.append(...nodes);}
 setAttribute(k,v){this[k]=v;}addEventListener(k,v){(this.listeners??={})[k]=v;}
 querySelectorAll(selector){const out=[];for(const n of this.children){if(selector==='button'&&n.tag==='button'||selector.startsWith('.')&&n.className.split(' ').includes(selector.slice(1)))out.push(n);out.push(...n.querySelectorAll(selector));}return out;}
 querySelector(s){if(s==='.sheet-heading h2')return this.querySelector('.sheet-heading')?.children.find(c=>c.tag==='h2');return this.querySelectorAll(s)[0]||null;}
 showModal(){this.open=true;}close(){this.open=false;this.listeners?.close?.();}click(){return this.onclick?.();}
}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function setup(respond,initialStatus=async()=>({loggedIn:false})){const panel=new Element('main'),tabs=new Element('nav'),account=new Element('button'),volume=new Element('div'),player=new Element('div'),seek=new Element('input'),body=new Element('body');panel.append(tabs,account,volume,player,seek);body.append(panel);const calls=[];let changed,play=null;
 const bridge={neteaseRequest:async(op,args)=>{calls.push([op,args]);return respond(op,args);},accountStatus:initialStatus,onAccountStatus:cb=>{changed=cb;},panelAction(){}};
 const host={state:()=>({track:null}),cover:u=>u||'../assets/avatar.png',status(){},show(){},play:(...args)=>{play=args;},download:async()=>({ok:true}),next(){}};
 const document={createElement:t=>new Element(t),body,getElementById:id=>id==='account-entry'?account:id==='seek'?seek:body.querySelectorAll('#'+id)[0],querySelector:s=>({'.panel':panel,'.tabs':tabs,'.volume':volume,'.player':player}[s]||body.querySelector(s))};
 const context={window:{NeteaseDesktopHost:host,musicBridge:bridge},document,console,Promise,Set,Map,Error,String,Number,Math,Date,setTimeout,clearTimeout};vm.runInNewContext(source,context);const cloud=tabs.querySelector('.mu-cloud-playlists');return {host,cloud,calls,change:v=>changed(v),body,sheet:panel.querySelector('.netease-hub'),views:context.window.NeteaseViews,get play(){return play;}};
}
const list=(id,owner)=>({id,name:'歌单'+id,creator:{userId:owner},coverImgUrl:'https://p.music.126.net/'+id});
test('guest keeps cloud login invitation; stale account playlists cannot replace current user or logout',async()=>{
 let release;const ui=setup((op,a)=>op==='userPlaylists'&&a.uid==='1'?new Promise(r=>{release=r;}):{playlist:[list('b','2')]});await flush();assert.match(ui.cloud.children[0].textContent,/登录/);
 ui.change({loggedIn:true,userId:'1'});await flush();ui.change({loggedIn:true,userId:'2'});await flush();assert.equal(ui.cloud.children[0].title,'歌单b');release({playlist:[list('a','1')]});await flush();assert.equal(ui.cloud.children[0].title,'歌单b');
 ui.change({loggedIn:false});await flush();assert.match(ui.cloud.children[0].textContent,/登录/);assert.equal(ui.calls.filter(([op])=>op==='playlistTracks').length,0);
});
test('online add presents only own writable playlists and writes only after explicit selection',async()=>{
 const ui=setup((op)=>op==='userPlaylists'?{playlist:[list('own','7'),list('subscribed','8')]}:op==='search'?{result:{songs:[{id:42,name:'测试',ar:[],al:{}}]}}:{});await flush();ui.change({loggedIn:true,userId:'7'});await flush();await ui.views.search('测试');
 const row=ui.sheet.querySelector('.track-row');assert.ok(row);const add=row.children.find(n=>n.title==='加入网易云歌单');await add.click();await flush();const picker=ui.body.querySelector('.mu-cloud-picker');assert.ok(picker);const choices=picker.querySelectorAll('.mu-cloud-choice');assert.equal(choices.length,1);assert.equal(choices[0].children[1].textContent,'歌单own');assert.equal(ui.calls.filter(([op])=>op==='playlistTracks').length,0);
 await choices[0].click();assert.deepEqual(JSON.parse(JSON.stringify(ui.calls.filter(([op])=>op==='playlistTracks'))),[['playlistTracks',{id:'own',ids:['42'],remove:false}]]);assert.ok(row.children.some(n=>n.textContent==='下载'));
});
test('changing account revokes an already open cloud picker',async()=>{
 const ui=setup(op=>op==='userPlaylists'?{playlist:[list('own','7')]}:op==='search'?{result:{songs:[{id:42,name:'测试'}]}}:{});await flush();ui.change({loggedIn:true,userId:'7'});await flush();await ui.views.search('测试');await ui.sheet.querySelector('.track-row').children.find(n=>n.title==='加入网易云歌单').click();const oldChoice=ui.body.querySelector('.mu-cloud-choice');ui.change({loggedIn:false});await oldChoice.click();assert.equal(ui.calls.filter(([op])=>op==='playlistTracks').length,0);
});

test('downloaded rows preserve local objects and remain playable through account changes',async()=>{
 let release;const tracks=[{key:'local:test.mp3',file:'test.mp3',local:true,name:'本地测试',artists:'歌手',duration_seconds:123}];const ui=setup(()=>{throw Error('Local page must not call NetEase');});let played=null;ui.host.downloadedTracks=()=>new Promise(r=>{release=r;});ui.host.openDownloads=()=>{};ui.host.playRow=(row,pool)=>{played={row,pool};};await flush();const loading=ui.views.downloads();await flush();ui.change({loggedIn:false});release(tracks);await loading;
 const row=ui.sheet.querySelector('.track-row');assert.ok(row);await row.children[0].click();assert.equal(played.row,tracks[0]);assert.equal(played.pool,tracks);assert.equal(played.row.local,true);assert.equal(ui.calls.length,0);
});
test('empty downloads explains folder placement without requesting login or network',async()=>{
 const ui=setup(()=>{throw Error('No network expected');});ui.host.downloadedTracks=async()=>[];ui.host.openDownloads=()=>{};await flush();await ui.views.downloads();assert.match(ui.sheet.querySelector('.empty').textContent,/将音乐放入下载目录/);assert.equal(ui.calls.length,0);
});
test('official FM extends the playback queue and discards extension after logout',async()=>{
 let page=0;const ui=setup(op=>op==='userPlaylists'?{playlist:[]}:op==='fm'?{data:[{id:++page,name:'FM '+page}]}:{});await flush();ui.change({loggedIn:true,userId:'7'});await flush();await ui.views.open('私人 FM');await ui.sheet.querySelector('.row-play').click();assert.equal(ui.play[0][0].id,'1');const extend=ui.play[2].extendQueue;let queued=null;await extend({direction:1,isCurrent:()=>true,updateQueue:pool=>{queued=pool;return true;}});assert.deepEqual(queued.map(s=>s.id),['1','2']);assert.equal(queued[1].key,'online:2');ui.change({loggedIn:false});const calls=ui.calls.length;assert.equal(await extend({direction:1,isCurrent:()=>true,updateQueue:()=>{throw Error('Must not update');}}),false);assert.equal(ui.calls.length,calls);
});
test('account notification does not strand a pending public home',async()=>{
 const releases=[];const ui=setup(op=>['popular','personalized'].includes(op)?new Promise(r=>releases.push(r)):{playlist:[]});await flush();const opening=ui.views.home();assert.ok(ui.sheet.querySelector('.netease-loading'));ui.change({loggedIn:false});for(const release of releases)release({playlists:[list('public','99')]});await opening;assert.equal(ui.sheet.querySelector('.netease-loading'),null);assert.equal(ui.sheet.querySelectorAll('.netease-card').length,1);
});
test('account notification preserves a pending public playlist',async()=>{
 let release;const ui=setup(op=>op==='popular'?{playlists:[list('public','99')]}:op==='personalized'?{result:[]}:op==='playlist'?new Promise(r=>{release=r;}):{playlist:[]});await flush();await ui.views.home();const opening=ui.sheet.querySelector('.netease-card').click();await flush();ui.change({loggedIn:true,userId:'7'});release({playlist:{name:'公开歌单',tracks:[{id:9,name:'公开歌曲'}],trackCount:1}});await opening;assert.equal(ui.sheet.querySelector('.netease-loading'),null);assert.equal(ui.sheet.querySelectorAll('.track-row').length,1);
});
test('current FM refreshes on login/account switch/logout and rejects old account songs',async()=>{
 let release,owner='1';const ui=setup(op=>op==='userPlaylists'?{playlist:[]}:op==='fm'&&owner==='1'?new Promise(r=>{release=r;}):{data:[{id:2,name:'账号二的FM'}]});ui.host.show=()=>{ui.sheet.hidden=false;};await flush();await ui.views.open('私人 FM');assert.match(ui.sheet.querySelector('.empty').textContent,/登录/);ui.change({loggedIn:true,userId:'1'});await flush();assert.ok(release,'login must start official FM');owner='2';ui.change({loggedIn:true,userId:'2'});await flush();assert.equal(ui.sheet.querySelectorAll('.track-row').length,1);assert.equal(ui.sheet.querySelector('.track-row').dataset.key,'online:2');release({data:[{id:1,name:'旧账号的FM'}]});await flush();assert.equal(ui.sheet.querySelector('.track-row').dataset.key,'online:2');ui.change({loggedIn:false});await flush();assert.equal(ui.sheet.querySelectorAll('.track-row').length,0);assert.equal(ui.sheet.querySelector('.netease-loading'),null);assert.match(ui.sheet.querySelector('.empty').textContent,/登录/);
});
test('background FM logout refreshes its content without stealing the visible settings page',async()=>{
 const ui=setup(op=>op==='userPlaylists'?{playlist:[]}:{data:[{id:7,name:'私人歌曲'}]});let reveals=0;ui.host.show=()=>{reveals++;ui.sheet.hidden=false;};await flush();ui.change({loggedIn:true,userId:'7'});await flush();await ui.views.open('私人 FM');const count=reveals;ui.sheet.hidden=true;ui.change({loggedIn:false});await flush();assert.equal(ui.sheet.hidden,true);assert.equal(reveals,count);assert.equal(ui.sheet.querySelectorAll('.track-row').length,0);assert.match(ui.sheet.querySelector('.empty').textContent,/登录/);
});
test('logout leaves a private cloud playlist and ignores its late failed request',async()=>{
 let reject;const ui=setup(op=>op==='userPlaylists'?{playlist:[list('private','7')]}:op==='playlist'?new Promise((_r,j)=>{reject=j;}):{result:[],playlists:[list('public','99')]});ui.host.show=()=>{ui.sheet.hidden=false;};await flush();ui.change({loggedIn:true,userId:'7'});await flush();const opening=ui.cloud.children[0].click();await flush();assert.ok(reject);ui.change({loggedIn:false});await flush();reject(Error('旧账号请求失效'));await opening;assert.equal(ui.sheet.querySelector('.netease-loading'),null);assert.equal(ui.sheet.querySelectorAll('.netease-card').length,1);assert.equal(ui.sheet.querySelectorAll('.netease-error').length,0);
});
test('a late initial signed-in status refreshes an already opened guest FM page',async()=>{
 let release;const ui=setup(op=>op==='userPlaylists'?{playlist:[]}:{data:[{id:8,name:'恢复账号FM'}]},()=>new Promise(r=>{release=r;}));ui.host.show=()=>{ui.sheet.hidden=false;};await ui.views.open('私人 FM');assert.match(ui.sheet.querySelector('.empty').textContent,/登录/);release({loggedIn:true,userId:'8'});await flush();assert.equal(ui.sheet.querySelector('.track-row').dataset.key,'online:8');assert.equal(ui.sheet.querySelector('.netease-loading'),null);
});
test('liked playlist uses authenticated account IDs even when anonymous playlist is empty',async()=>{
 const liked={...list('10','7'),specialType:5};
 const ui=setup((op,args)=>{
  if(op==='userPlaylists')return {playlist:[liked]};
  if(op==='likes')return {ids:['42']};
  if(op==='songDetail'){assert.deepEqual([...args.ids],['42']);return {songs:[{id:42,name:'已收藏歌曲'}]};}
  if(op==='playlist')return {playlist:{trackCount:0,tracks:[]}};
  throw Error(op);
 });
 await flush();ui.change({loggedIn:true,userId:'7'});await flush();
 const row=ui.cloud.querySelector('.mu-cloud-row');
 assert.ok(row.querySelector('.mu-cloud-create'));
 await row.children[0].click();
 assert.equal(ui.sheet.querySelector('.track-row').dataset.key,'online:42');
 assert.equal(ui.calls.filter(([op])=>op==='playlist').length,0);
});
test('the sidebar creates a cloud playlist and adds it to the account list',async()=>{
 const ui=setup((op,args)=>{
  if(op==='userPlaylists')return {playlist:[list('existing','7')]};
  if(op==='likes')return {ids:[]};
  if(op==='createPlaylist')return {playlist:{id:'100',name:args.name}};
  throw Error(op);
 });
 ui.host.prompt=async()=> '夜间听歌';
 await flush();ui.change({loggedIn:true,userId:'7'});await flush();
 await ui.body.querySelector('.mu-cloud-create').click();
 assert.deepEqual(ui.cloud.children.map(n=>n.title),['歌单existing','夜间听歌']);
});
test('home has only recommendations and an adjacent SVG refresh that requests fresh playlists',async()=>{
 let generation=0;const ui=setup(op=>op==='personalized'?{result:[]}:op==='popular'?{playlists:[list('fresh'+(++generation),'99')]}:{playlist:[]});await flush();await ui.views.home();assert.equal(ui.sheet.querySelector('.sheet-heading').children[0].textContent,'推荐歌单');assert.equal(ui.sheet.querySelector('.home-intro'),null);const refresh=ui.sheet.querySelector('.mu-home-refresh');assert.ok(refresh.innerHTML.includes('<svg'));assert.equal(refresh.textContent,'');assert.equal(ui.sheet.querySelector('.netease-card').children[1].textContent,'歌单fresh1');await refresh.click();assert.equal(ui.sheet.querySelector('.netease-card').children[1].textContent,'歌单fresh2');assert.equal(ui.calls.filter(([op])=>op==='popular').length,2);assert.equal(ui.calls.filter(([op])=>op==='personalized').length,2);
});
