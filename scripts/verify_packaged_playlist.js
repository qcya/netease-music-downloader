'use strict';
// End-to-end smoke test for the ACTUAL packed Windows executable.
// Invocation: node scripts/verify_packaged_playlist.js <CDP-port> <user-data-dir>
// The executable must be launched with --remote-debugging-port=<CDP-port>.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const port = Number(process.argv[2]);
const userData = process.argv[3];
const processName=process.env.MUSIC_DOWNLOADER_TEST_PROCESS==='electron'?'electron':'MusicDownloader';
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
  const http=require('node:http');let failed=false,downloads=0,completed=0,base='';
  const rate=8000,frames=rate*45,pcm=Buffer.alloc(44+frames*2);
  pcm.write('RIFF',0);pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);
  pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);
  pcm.writeUInt32LE(rate,24);pcm.writeUInt32LE(rate*2,28);pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);
  pcm.write('data',36);pcm.writeUInt32LE(frames*2,40);
  const {PROFILES}=require('../taste_discovery');
  const catalog=new Map();let nextID=700001;
  for(const profile of Object.values(PROFILES))for(const seed of profile.seeds){
    if(!catalog.has(seed.query))catalog.set(seed.query,{id:nextID++,name:seed.title,dt:45000,ar:[{name:seed.artist||'自动验收'}],al:{name:'合成静音测试'}});
  }
  const songs=[...catalog.values()];
  const related=Object.values(PROFILES).map(p=>p.related);
  while(songs.length<237){const i=songs.length;songs.push({id:nextID++,name:'扩展验收曲目 '+i,dt:45000,ar:[{name:related[i%related.length]}],al:{name:'合成测试曲库'}});}
  const playlists=Array.from({length:14},(_,i)=>({id:800001+i,name:'验收精选 '+i,trackCount:songs.length}));
  const server=http.createServer((req,res)=>{
    const u=new URL(req.url,base);let payload={code:200};
    if(failed){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"code":503}');return;}
    if(u.pathname==='/search'){
      const term=u.searchParams.get('keywords')||'';
      if(u.searchParams.get('type')==='1000')payload={code:200,result:{playlists:[{id:800000+[...term].reduce((n,c)=>n+c.codePointAt(0),0),name:term+' 验收精选',trackCount:songs.length}]}};
      else payload={code:200,result:{songs:catalog.has(term)?[catalog.get(term)]:songs.filter(s=>s.ar.some(a=>a.name.includes(term))).slice(Number(u.searchParams.get('offset')||0),Number(u.searchParams.get('offset')||0)+60)}};
    }
    else if(u.pathname==='/top/playlist'||u.pathname==='/personalized')payload={code:200,playlists,result:playlists};
    else if(u.pathname==='/playlist/track/all')payload={code:200,songs:songs.slice(Number(u.searchParams.get('offset')||0),Number(u.searchParams.get('offset')||0)+Number(u.searchParams.get('limit')||200)),total:songs.length};
    else if(u.pathname==='/playlist/detail')payload={code:200,playlist:{tracks:songs.slice(0,10),trackCount:songs.length,trackIds:songs.map(x=>({id:x.id}))}};
    else if(u.pathname==='/song/detail')payload={code:200,songs:songs.filter(x=>(u.searchParams.get('ids')||'').split(',').includes(String(x.id)))};
    else if(u.pathname==='/song/url/v1')payload={code:200,data:(u.searchParams.get('id')||'').split(',').filter(id=>id!=='700003').map(id=>({id:Number(id),url:id==='700002'?null:base+'/audio.wav',type:'wav',level:'lossless',br:128000}))};
    else if(u.pathname==='/lyric/new'||u.pathname==='/lyric')payload={code:200,lrc:{lyric:'[00:00.00]自动验收音频\n[00:03.00]第二行验收文字'},tlyric:{lyric:'[00:00.00]翻译验收一\n[00:03.00]翻译验收二'}};
    else if(u.pathname==='/audio.wav'){
      downloads++;const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
      const start=m?Number(m[1]):0,end=m&&m[2]?Math.min(Number(m[2]),pcm.length-1):pcm.length-1;
      if(start> end){res.writeHead(416,{'Content-Range':'bytes */'+pcm.length});res.end();return;}
      const headers={'Content-Type':'audio/wav','Content-Length':end-start+1,'Accept-Ranges':'bytes'};
      if(m)headers['Content-Range']=`bytes ${start}-${end}/${pcm.length}`;
      res.writeHead(m?206:200,headers);
      // A direct-HTTP control also stalls with only 128044 bytes of this WAV.
      // Deliver progressive decoder input, then keep most of the body pending.
      // The before-completion assertion below remains mandatory.
      let cursor=start,timer;
      const prefixEnd=Math.min(start+256*1024,end+1);
      const send=()=>{
        const next=Math.min(cursor+32*1024,prefixEnd);
        res.write(pcm.subarray(cursor,next));cursor=next;
        if(cursor>=end+1){completed++;res.end();return;}
        if(cursor<prefixEnd)timer=setTimeout(send,100);
        else timer=setTimeout(()=>{completed++;res.end(pcm.subarray(cursor,end+1));},9000);
      };
      send();res.on('close',()=>clearTimeout(timer));return;
    }
    else payload={code:404};
    const body=Buffer.from(JSON.stringify(payload));res.writeHead(200,{'Content-Type':'application/json','Content-Length':body.length});res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  return {base,songCount:songs.length,downloads:()=>downloads,completed:()=>completed,offline:()=>{failed=true;},close:async()=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}};
}

async function main() {
  const target = await debuggerTarget();
  console.log('Renderer URL:',target.url);
  const c = await client(target.webSocketDebuggerUrl);let fixture;
  const initialized='document.readyState==="complete" && !!document.querySelector(".nav-icon svg") && /就绪/.test(document.getElementById("python-label")?.textContent||"")';
  try {
    async function wait(condition, reason, attempts=70) {
      for (let attempt=0;attempt<attempts;attempt++) {
        if (await c.run(condition)) return;
        await delay(180);
      }
      console.error('AUDIO FAILURE STATE',await c.run('(()=>{const a=document.getElementById("music-audio");return {document:document.readyState,icons:document.querySelectorAll(".nav-icon svg").length,environment:document.getElementById("python-label")?.textContent,ready:a.readyState,network:a.networkState,time:a.currentTime,paused:a.paused,error:a.error&&{code:a.error.code,message:a.error.message}}})()'));
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
    await wait(initialized,'Renderer initialization did not finish before input',150);
    assert.equal((await c.run('musicBridge.checkPython()')).ok,true,'backend must still work after repeated portable launch');
    console.log('PASS: backend health check after repeated portable launch.');
    if(process.argv[4]!=='restart'){
    await wait('(async()=>{const s=await musicBridge.floatingLyricsStatus();return s.open&&s.visible&&s.loaded&&!s.locked;})()','First launch must show unlocked desktop lyrics');
    console.log('PASS: clean installation starts with visible unlocked desktop lyrics.');
    }
    // Complete first-launch consent before any pointer testing, so a modal cannot cover controls.
    if(process.argv[4]==='restart'){
      const expected=JSON.parse(fs.readFileSync(path.join(userData,'restart-expected.json'),'utf8'));
      await wait('(async()=>{const s=await musicBridge.floatingLyricsStatus();return s.open&&s.visible&&s.loaded&&s.locked;})()','Restart must restore the enabled and locked desktop lyric window');
      const status=await c.run('musicBridge.floatingLyricsStatus()');
      assert.deepEqual(status.position,expected.position,'restart must preserve lyric coordinates');
      const prefs=await c.run('musicBridge.getSettings()');assert.equal(prefs.desktopLyricsEnabled,true);assert.equal(prefs.floatingLyrics.mouseThrough,true);
      console.log('PASS: full process restart restores enabled lyrics, user-selected lock and exact coordinates.',JSON.stringify(status));
      await realClick('#toggle-desktop-lyrics');
      return;
    }
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
    await wait('document.querySelectorAll(".discovery-song").length===8 && document.querySelector(".discovery-song")?.dataset.songId.startsWith("700")','Real recommendation IPC did not render fixture songs');
    assert.equal(await c.run('document.querySelectorAll(".discovery-playlist").length'),5);
    assert.equal(fixture.downloads(),0,'opening recommendations must never download or autoplay');
    await c.run(`document.querySelector('.discovery-song[data-song-id="700002"]').scrollIntoView({block:"center"})`);
    await wait(`document.querySelector('.discovery-song[data-song-id="700002"] [data-availability="unavailable"]')!==null`,'Known unavailable source did not settle');
    assert.equal(await c.run(`document.querySelector('.discovery-song[data-song-id="700002"] .discovery-play')!==null`),false,'unavailable songs must not advertise Play');
    console.log('PASS: public metadata check hides unavailable play controls without fetching audio.');
    const first=await c.run('document.querySelector(".discovery-song").dataset.songId');
    await realClick('#discovery-next');
    await wait('document.querySelector(".discovery-song")?.dataset.songId!=='+JSON.stringify(first),'Next batch did not change selection');
    const seenIDs=new Set(await c.run('[...document.querySelectorAll(".discovery-song")].map(x=>x.dataset.songId)'));
    for(let batch=0;batch<11;batch++){
      await wait('!document.getElementById("discovery-refresh").disabled','Refresh still pending');
      const previous=await c.run('document.querySelector(".discovery-song")?.dataset.songId');
      await realClick(batch%2?'#discovery-next':'#discovery-refresh');
      await wait('!document.getElementById("discovery-refresh").disabled && document.querySelector(".discovery-song")?.dataset.songId!=='+JSON.stringify(previous),'Refresh did not obtain different songs');
      const ids=await c.run('[...document.querySelectorAll(".discovery-song")].map(x=>x.dataset.songId)');
      assert.equal(ids.length,8);for(const id of ids){assert.ok(!seenIDs.has(id),'homepage repeated '+id);seenIDs.add(id);}
    }
    assert.equal(seenIDs.size,96);console.log('PASS: 12 batches / 96 unique songs through both actual refresh controls.');
    await realClick('.discovery-playlist');
    await wait('!document.getElementById("search-panel").hidden && document.querySelectorAll(".song-card").length==='+fixture.songCount,'Recommended playlist did not resolve past ten-track preview',200);
    console.log('PASS: playlist preview 10 resolves and renders all 237 songs in order.');
    await realClick('#home-discover-tab');
    // Online playback must start while the synthetic response is still unfinished.
    if(!(await c.run('musicBridge.floatingLyricsStatus()')).open)await realClick('#toggle-desktop-lyrics');
    await wait('(async()=>{const s=await musicBridge.floatingLyricsStatus();return s.open&&s.visible&&s.loaded;})()','Desktop lyrics did not become visible on explicit enable');
    await c.run('document.querySelector(".discovery-song").scrollIntoView({block:"center"})');
    await wait('!!document.querySelector(".discovery-play")','A verified playable control did not appear');
    const streamingClickAt=Date.now();
    await realClick('.discovery-play');
    await wait('document.getElementById("music-audio").currentSrc.startsWith("music-preview:") && !document.getElementById("music-audio").paused && document.getElementById("music-audio").currentTime>0','Online playback did not start',140);
    assert.equal(fixture.completed(),0,'must play before complete response arrives');
    console.log('STREAM START EVIDENCE',JSON.stringify({elapsedMs:Date.now()-streamingClickAt,completedResponses:fixture.completed(),currentTime:await c.run('document.getElementById("music-audio").currentTime')}));
    assert.equal(fs.readdirSync(downloadDir).length,0,'online play cannot save a music file');
    const cache=await c.run('musicBridge.cacheStats()');assert.equal(cache.count,0);assert.equal(cache.httpCacheBytes,0,'Chromium HTTP cache must stay disabled');
    assert.equal(fs.existsSync(path.join(userData,'lyric-cache')),false,'online lyrics stay in RAM');
    const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    const overlay=pages.find(p=>/floating-lyrics\.html/.test(p.url));assert.ok(overlay,'native lyric renderer missing');
    const lyricClient=await client(overlay.webSocketDebuggerUrl);
    try {
      await wait('document.getElementById("player-synced-line").textContent.includes("验收")','Lyric retrieval did not reach player');
      assert.ok((await lyricClient.run('document.getElementById("lyric").textContent')).includes('验收'));
      // Minimize the real Windows main window, not a mock element.
      const {setWindowState}=require('./native_test_window');
      const showMain=n=>setWindowState(processName,n);
      showMain(6);
      try{await wait('document.getElementById("music-audio").currentTime>4','Audio stopped when minimized');
        assert.ok((await lyricClient.run('document.getElementById("lyric").textContent')).includes('第二行'),'desktop lyric clock must continue when main is minimized');
        assert.ok((await lyricClient.run('document.getElementById("translate").textContent')).includes('验收二'));
        assert.equal((await c.run('musicBridge.floatingLyricsStatus()')).visible,true);
        const shot=await lyricClient.command('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(userData,'desktop-lyrics-minimized.png'),Buffer.from(shot.data,'base64'));
        console.log('DESKTOP LYRIC EVIDENCE',JSON.stringify(await c.run('musicBridge.floatingLyricsStatus()')));
      }finally{showMain(9);}
      const position=(await c.run('musicBridge.floatingLyricsStatus()')).position;
      await realClick('#toggle-desktop-lock');assert.equal((await c.run('musicBridge.floatingLyricsStatus()')).locked,true);
      assert.deepEqual((await c.run('musicBridge.floatingLyricsStatus()')).position,position);
      await realClick('#toggle-desktop-lock');
    } finally{lyricClient.close();}
    await realClick('#toggle-desktop-lyrics');
    const expectedQueueSize=await c.run('[...document.querySelectorAll(".discovery-song")].filter(e=>!e.querySelector("[data-availability=unavailable]")).length');
    await realClick('#toggle-queue');
    await wait('!document.getElementById("queue-panel").hidden && document.querySelectorAll(".queue-item").length>0','Online recommendation queue missing');
    assert.equal(await c.run('document.querySelectorAll(".queue-item").length'),expectedQueueSize);
    await realClick('#queue-close');
    await c.run('document.getElementById("music-audio").pause()');await c.run('musicBridge.stopOnlinePlayback()');
    console.log('PASS: streaming starts before complete body, zero audio files/HTTP cache, memory lyrics, native overlay visibility and minimized bilingual synchronization, lock preserves position.');
    // Download remains a separate, explicitly clicked action.
    await realClick('.discovery-download');
    await wait('!document.querySelector(".discovery-download").disabled','Explicit download did not finish',250);
    assert.ok(fs.readdirSync(downloadDir).some(x=>x.endsWith('.wav')),'explicit download must still work');
    console.log('PASS: explicit Download remains independent of online Play.');
    const beforeOffline=new Set(await c.run('[...document.querySelectorAll(".discovery-song")].map(e=>e.dataset.songId)'));
    fixture.offline();
    await realClick('#discovery-refresh');
    await wait('!document.getElementById("discovery-refresh").disabled && document.querySelectorAll(".discovery-song").length===8','Saved candidate pool should continue to supply songs while offline',200);
    const offlineIDs=await c.run('[...document.querySelectorAll(".discovery-song")].map(e=>e.dataset.songId)');
    for(const id of offlineIDs)assert.ok(!beforeOffline.has(id),'offline refresh must not repeat the previous page');
    const runtimeInfo=await c.run('musicBridge.appInfo()');
    assert.equal(runtimeInfo.version,require('../package.json').version);
    console.log('PASS: packaged offline refresh serves unseen saved candidates; build version',runtimeInfo.version);
    await c.run('document.getElementById("music-audio").pause()');
    // Reload the renderer after writes and verify persisted groups and disabled first-run preferences.
    await c.command('Page.reload',{});
    await wait('!!window.musicBridge && !!document.getElementById("playlist-create-category")','Renderer did not reload');
    await wait(initialized,'Renderer initialization did not finish after reload',150);
    await realClick('.nav-item[data-view=playlists]');
    await wait('document.getElementById("my-playlist-tracks").textContent.includes("打包验收已改名") && document.getElementById("my-playlist-tracks").textContent.includes("打包验收默认歌单")','Playlist names did not survive renderer reload');
    const prefs=await c.run('musicBridge.getSettings()');
    assert.equal(prefs.desktopLyricsEnabled,false);assert.equal(prefs.miniPlayerEnabled,false);
    console.log('PASS: persisted playlist names and first-run preferences survive renderer reload.');
    await realClick('#toggle-desktop-lyrics');
    await wait('(async()=>{const s=await musicBridge.floatingLyricsStatus();return s.open&&s.visible&&s.loaded;})()','Lyrics did not reopen for restart test');
    const restartPages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    const restartOverlay=restartPages.find(p=>/floating-lyrics\.html/.test(p.url));
    const positionClient=await client(restartOverlay.webSocketDebuggerUrl);
    try{await positionClient.run('floatingBridge.dragBegin();floatingBridge.dragEnd();true');}
    finally{positionClient.close();}
    await wait('(async()=>!!(await musicBridge.getSettings()).floatingLyricsPosition)()','Lyric drag-end did not save coordinates');
    if(!(await c.run('musicBridge.floatingLyricsStatus()')).locked)await realClick('#toggle-desktop-lock');
    const expected=await c.run('musicBridge.floatingLyricsStatus()');assert.equal(expected.locked,true);
    fs.writeFileSync(path.join(userData,'restart-expected.json'),JSON.stringify({position:expected.position}));
    console.log('RESTART EXPECTATION',JSON.stringify(expected));


  } finally {if(fixture)await fixture.close();c.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
