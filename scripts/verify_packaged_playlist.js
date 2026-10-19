'use strict';
// End-to-end smoke test for the ACTUAL packed Windows executable.
// Invocation: node scripts/verify_packaged_playlist.js <CDP-port> <user-data-dir>
// The executable must be launched with --remote-debugging-port=<CDP-port>.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const port = Number(process.argv[2]);
const userData = process.argv[3];
if (!Number.isInteger(port) || port < 1 || !userData) throw new Error('Usage: node scripts/verify_packaged_playlist.js PORT USER_DATA');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const endAt = Date.now() + 30000;
async function debuggerTarget() {
  while (Date.now() < endAt) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list', {signal:AbortSignal.timeout(1500)});
      if (response.ok) {
        const pages = await response.json();
        const target = pages.find(x => x.type === 'page' && /index\.html/i.test(x.url));
        if (target && target.webSocketDebuggerUrl) return target;
      }
    } catch { /* The packaged process might still be starting. */ }
    await delay(250);
  }
  throw new Error('Packaged Electron renderer did not expose a CDP page at port ' + port);
}
async function client(url) {
  const socket = new WebSocket(url);
  let serial = 0;
  const pending = new Map();
  socket.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once:true});
    socket.addEventListener('error', reject, {once:true});
  });
  return {
    async command(method,params) {
      const id = ++serial;
      const resultPromise = new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
      socket.send(JSON.stringify({id,method,params}));
      let timer;let result;
      try { result=await Promise.race([resultPromise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('CDP command timed out: '+method)),15000);})]); }
      finally {clearTimeout(timer);pending.delete(id);}
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result;
    },
    async run(expression) {
      const result = await this.command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      return result.result?.value;
    },
    close() { socket.close(); }
  };
}
// Synthetic 45-second PCM silence. This verifies file transport/decode, not online music availability.
async function startFixture() {
  const http=require('node:http');let failed=false,downloads=0,base='';
  const rate=8000,frames=rate*45,pcm=Buffer.alloc(44+frames*2);
  pcm.write('RIFF',0);pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);
  pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);
  pcm.writeUInt32LE(rate,24);pcm.writeUInt32LE(rate*2,28);pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);
  pcm.write('data',36);pcm.writeUInt32LE(frames*2,40);
  const songs=Array.from({length:32},(_,i)=>({id:700001+i,name:'验收音频 '+i,dt:45000,ar:[{name:'自动验收'}],al:{name:'合成静音测试'}}));
  const playlists=Array.from({length:14},(_,i)=>({id:800001+i,name:'验收精选 '+i,trackCount:songs.length}));
  const server=http.createServer((req,res)=>{
    const u=new URL(req.url,base);let payload={code:200};
    if(failed){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"code":503}');return;}
    if(u.pathname==='/top/playlist'||u.pathname==='/personalized')payload={code:200,playlists,result:playlists};
    else if(u.pathname==='/playlist/track/all')payload={code:200,songs,total:songs.length};
    else if(u.pathname==='/playlist/detail')payload={code:200,playlist:{tracks:songs,trackCount:songs.length,trackIds:songs.map(x=>({id:x.id}))}};
    else if(u.pathname==='/song/detail')payload={code:200,songs:songs.filter(x=>(u.searchParams.get('ids')||'').split(',').includes(String(x.id)))};
    else if(u.pathname==='/song/url/v1')payload={code:200,data:[{id:Number(u.searchParams.get('id')),url:base+'/audio.wav',type:'wav',level:'lossless',br:128000}]};
    else if(u.pathname==='/lyric/new'||u.pathname==='/lyric')payload={code:200,lrc:{lyric:'[00:00.00]自动验收音频\n[00:10.00]第二行验收文字'},tlyric:{lyric:''}};
    else if(u.pathname==='/audio.wav'){downloads++;res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':pcm.length});res.end(pcm);return;}
    else payload={code:404};
    const body=Buffer.from(JSON.stringify(payload));res.writeHead(200,{'Content-Type':'application/json','Content-Length':body.length});res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  return {base,downloads:()=>downloads,offline:()=>{failed=true;},close:async()=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}};
}

async function main() {
  const target = await debuggerTarget();
  console.log('Renderer URL:',target.url);
  const c = await client(target.webSocketDebuggerUrl);let fixture;
  try {
    async function wait(condition, reason, attempts=70) {
      for (let attempt=0;attempt<attempts;attempt++) {
        if (await c.run(condition)) return;
        await delay(180);
      }
      throw new Error(reason);
    }
    async function realClick(selector) {
      const point = await c.run('(()=>{let e=document.querySelector('+JSON.stringify(selector)+');if(!e)return null;e.scrollIntoView({block:"center"});let r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
      if (!point) throw new Error('Click target not found: '+selector);
      const hit = await c.run('document.elementFromPoint('+point.x+','+point.y+')?.outerHTML?.slice(0,150)');
      console.log('Click',selector,'hit',hit);
      await c.command('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
      await c.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
    }
    await wait('!!document.getElementById("playlist-create-category")','Playlist creation button absent');
    // Complete first-launch consent before any pointer testing, so a modal cannot cover controls.
    const disclaimer = await c.run('!document.getElementById("first-run").hidden');
    if (disclaimer) {
      await c.run('(()=>{const box=document.getElementById("agree-disclaimer");box.checked=true;box.dispatchEvent(new Event("change",{bubbles:true}));return true})()');
      await realClick('#first-confirm');
      await wait('document.getElementById("first-run").hidden','First-run disclaimer could not be dismissed');
    }
    await realClick('.nav-item[data-view=playlists]');
    await wait('document.getElementById("view-playlists").classList.contains("active")',
      'My Playlists did not open');

    // A clean install has no songs: default section must still be visible and renamable.
    await wait('!!document.querySelector(".playlist-category[data-category-id=uncategorized] button")',
      'Empty default playlist cannot be renamed');

    const createButton = '#playlist-create-category';
    await realClick(createButton);
    await wait('!document.getElementById("playlist-name-dialog").hidden',
      'Clicking New Playlist did not open an input dialog');
    await c.command('Input.insertText',{text:'打包验收歌单'});
    await realClick('#playlist-name-save');
    await wait('document.getElementById("playlist-name-dialog").hidden && [...document.querySelectorAll(".playlist-category-header strong")].some(x=>x.textContent.includes("打包验收歌单"))',
      'New playlist not saved/rendered by packaged Electron');

    await realClick('.playlist-category:not([data-category-id=uncategorized]) .playlist-category-header button');
    await wait('!document.getElementById("playlist-name-dialog").hidden',
      'Clicking Rename did not open dialog');
    await c.command('Input.insertText',{text:'打包验收已改名'});
    await realClick('#playlist-name-save');
    await wait('document.getElementById("playlist-name-dialog").hidden && [...document.querySelectorAll(".playlist-category-header strong")].some(x=>x.textContent.includes("打包验收已改名"))',
      'Named playlist rename was not persisted/displayed');

    await realClick('.playlist-category[data-category-id=uncategorized] button');
    await wait('!document.getElementById("playlist-name-dialog").hidden',
      'Default playlist rename dialog absent');
    await c.command('Input.insertText',{text:'打包验收默认歌单'});
    await realClick('#playlist-name-save');
    await wait('document.getElementById("playlist-name-dialog").hidden && document.querySelector(".playlist-category[data-category-id=uncategorized] strong")?.textContent.includes("打包验收默认歌单")',
      'Default playlist rename not persisted/displayed');

    const filename = path.join(userData,'playlist-categories.json');
    const saved = JSON.parse(fs.readFileSync(filename,'utf8'));
    assert.equal(saved.defaultName,'打包验收默认歌单');
    assert.ok(saved.categories.some(x=>x.name==='打包验收已改名'));
    assert.equal(saved.categories.some(x=>x.name==='打包验收歌单'),false);
    console.log('PASS: packaged app New Playlist and both Rename buttons clicked, IPC succeeded, JSON persisted.');
    // Real Electron main-process fetch, Python download, local file decode and pointer interactions.
    fixture=await startFixture();
    const downloadDir=path.join(userData,'discovery-audio');fs.mkdirSync(downloadDir,{recursive:true});
    await c.run('(async()=>{const settings=await musicBridge.getSettings();return musicBridge.saveSettings({...settings,downloadDir:'+JSON.stringify(downloadDir)+',apiBases:['+JSON.stringify(fixture.base)+']});})()');
    await realClick('.nav-item[data-view=home]');
    await realClick('#home-discover-tab');
    await wait('!document.getElementById("discovery-refresh").disabled','Initial discovery request never settled',200);
    await realClick('#discovery-refresh');
    await wait('document.querySelectorAll(".discovery-song").length===8 && document.querySelector(".discovery-song")?.textContent.includes("验收音频")','Real recommendation IPC did not render fixture songs');
    assert.equal(await c.run('document.querySelectorAll(".discovery-playlist").length'),6);
    assert.equal(fixture.downloads(),0,'opening recommendations must never download or autoplay');
    const first=await c.run('document.querySelector(".discovery-song").dataset.songId');
    await realClick('#discovery-next');
    await wait('document.querySelector(".discovery-song")?.dataset.songId!=='+JSON.stringify(first),'Next batch did not change selection');
    await realClick('.discovery-playlist');
    await wait('!document.getElementById("search-panel").hidden && document.querySelectorAll(".song-card").length===32','Recommended playlist did not reach the public metadata service',200);
    await realClick('#home-discover-tab');
    await realClick('.discovery-play');
    await wait('document.getElementById("music-audio").currentSrc.startsWith("file:") && !document.getElementById("music-audio").paused','Download-and-play did not decode a local file',250);
    assert.ok(fixture.downloads()>0,'explicit click must download fixture audio');
    assert.ok(fs.readdirSync(downloadDir).some(x=>x.endsWith('.wav')),'complete file must exist on disk');
    await realClick('#toggle-queue');
    await wait('!document.getElementById("queue-panel").hidden && document.querySelectorAll(".queue-item").length===1','Current queue was not visible');
    await realClick('#queue-close');
    console.log('PASS: packaged discovery API, daily batch, playlist import, explicit download and real local WAV playback, visible queue.');
    fixture.offline();
    await realClick('#discovery-refresh');
    await wait('document.getElementById("discovery-state").textContent.includes("缓存推荐") && !document.getElementById("discovery-refresh").disabled','Offline homepage did not show dated cache',200);
    const runtimeInfo=await c.run('musicBridge.appInfo()');
    assert.equal(runtimeInfo.version,'1.1.0');
    console.log('PASS: packaged offline cache fallback retains cards and shows actual cache date; build version',runtimeInfo.version);
    await c.run('document.getElementById("music-audio").pause()');
    // Reload the renderer after writes and verify persisted groups and disabled first-run preferences.
    await c.command('Page.reload',{});
    await wait('!!window.musicBridge && !!document.getElementById("playlist-create-category")','Renderer did not reload');
    await realClick('.nav-item[data-view=playlists]');
    await wait('document.getElementById("my-playlist-tracks").textContent.includes("打包验收已改名") && document.getElementById("my-playlist-tracks").textContent.includes("打包验收默认歌单")','Playlist names did not survive renderer reload');
    const prefs=await c.run('musicBridge.getSettings()');
    assert.equal(prefs.desktopLyricsEnabled,false);assert.equal(prefs.miniPlayerEnabled,false);
    console.log('PASS: persisted playlist names and first-run preferences survive renderer reload.');

  } finally {if(fixture)await fixture.close();c.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
