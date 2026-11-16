'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app/panel.js'),'utf8');
const slice=(start,end)=>{const a=src.indexOf(start),b=src.indexOf(end,a);assert.ok(a>=0&&b>a);return src.slice(a,b)};
function node(tag='',cls='',text=''){const classes=new Set();return {tag,cls,textContent:text||'',children:[],dataset:{},hidden:false,style:{},value:'',classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v},setAttribute(){},querySelectorAll(){return []},scrollIntoView(){}}}
test('sidebar opens just selected playlist and returns from settings',async()=>{
 const els={};const $=id=>els[id]||(els[id]=node());$('browser').hidden=true;$('query').value='';
 $('home-button').classList.add('active');$('netease-view').dataset.restore='true';
 const lists=[{id:'a',name:'歌单甲',tracks:[],conflicts:[]},{id:'b',name:'歌单乙',tracks:[],conflicts:[]}];let hide=0;
 const ctx={$ ,document:{getElementById:$},element:node,myPlaylists:lists,expandedPlaylists:new Set(),tab:'local',selectedLocalPlaylistId:null,localArtwork:new Map(),files:[],selection:null,
  safe:fn=>fn,loadTab:async()=>{},hideSheets:()=>{hide++;$('browser').hidden=false},coverURL:()=>'',availability:new Map(),
  window:{MusicTrackOrder:{pageOrder:r=>r}},player:{state:()=>({track:null})},empty:()=>node(),playlistSong:()=>({}),
  trackSelectionId:()=>'',transferTracks:async()=>{}};
 vm.createContext(ctx);vm.runInContext(slice(' function renderMuoniumPlaylistNavigation(){',' async function refreshMyPlaylists(')+';globalThis.render=renderMyPlaylists;',ctx);
 ctx.render();assert.equal($('track-list').children.length,2);
 await $('mu-nav-playlists').children[1].onclick();
 assert.equal(hide,1);assert.equal($('browser').hidden,false);assert.equal($('track-list').children.length,1);
 assert.equal($('home-button').classList.contains('active'),false);assert.equal($('netease-view').dataset.restore,'false');
 assert.equal($('track-list').children[0].children[0].dataset.selectId,'a');assert.equal($('mu-playlist-name').textContent,'歌单甲');
});
test('online playlist button plays from first page with queue extension',async()=>{
 const els={};const $=id=>els[id]||(els[id]=node());$('query').value='';const context={id:'42',name:'在线歌单'};let reads=[],played=null,updated=null;
 const ctx={$ ,activeDiscovery:context,discoverySongsPage:2,loadSerial:0,rows:[],onlineRow:s=>({...s,key:'online:'+s.id}),coverURL:()=>'',renderRows(){},probeRows:async()=>{},status(){},empty:()=>node(),safe:fn=>fn,
  readDiscoveryPage:async(_c,opts)=>{reads.push(opts.offset);return {tracks:[{id:opts.offset+1}],hasMore:true}},
  window:{MusicDiscoveryQueue:{createDiscoveryQueue:o=>({extend:async()=>[...o.initialRows,{key:'online:9'}]})}},
  player:{play:async(song,pool,opts)=>{played={song,pool,opts};return true}}};
 vm.createContext(ctx);vm.runInContext(slice(' async function playOnlineSong(', ' function renderRows()')+slice(' async function loadDiscoverySongs(){',' async function search(){')+';globalThis.load=loadDiscoverySongs;',ctx);
 await ctx.load();assert.equal($('mu-playlist-play').hidden,false);await $('mu-playlist-play').onclick();
 assert.deepEqual(reads,[8,0]);assert.equal(played.song.id,1);
 await played.opts.extendQueue({direction:1,isCurrent:()=>true,updateQueue:v=>{updated=v;return true}});assert.equal(updated[1].key,'online:9');
});
