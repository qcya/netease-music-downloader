'use strict';
// Actual packaged renderer + embedded Python against a local, generated audio fixture.
const {connect,pages}=require('./cdp_client'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const port=Number(process.argv[2]||19273),dir=path.resolve(process.argv[3]||'.validation/packaged-panel'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label){for(let i=0;i<200;i++){try{const value=await fn();if(value)return value;}catch{}await sleep(100);}throw Error(label);}
const wav=Buffer.alloc(44+44100*2*30);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
let base,client,charm,trial=true;const requests=[];
const song={id:99000001,name:'轨道测试音频',ar:[{name:'本地验证'}],al:{name:'Orbit Test'},dt:30000};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost'),json=data=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 requests.push(u.pathname);
 if(u.pathname==='/search')return json({code:200,result:{songs:[song],songCount:1}});
 if(u.pathname==='/song/detail')return json({code:200,songs:[song]});
 if(u.pathname==='/playlist/track/all')return json({code:200,total:1,songs:Number(u.searchParams.get('offset')||0)===0?[song]:[]});
 if(u.pathname==='/song/url/v1'||u.pathname==='/song/url')return json({code:200,data:[{id:song.id,url:base+'/test.wav',level:'standard',br:128000,freeTrialInfo:trial?{start:0,end:30}:null}]});
 if(u.pathname==='/lyric/new'||u.pathname==='/lyric')return json({code:200,lrc:{lyric:'[00:00]测试音乐\n[00:05]继续航行'}});
 if(u.pathname==='/test.wav'){
  const m=/bytes=(\d+)-(\d*)/.exec(req.headers.range||''),start=m?Number(m[1]):0,end=m&&m[2]?Math.min(Number(m[2]),wav.length-1):wav.length-1;
  res.writeHead(m?206:200,{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':end-start+1,...(m?{'Content-Range':`bytes ${start}-${end}/${wav.length}`}:{})});res.end(wav.subarray(start,end+1));return;
 }
 res.writeHead(404);res.end();
});
(async()=>{
 fs.mkdirSync(dir,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 client=await connect(await wait(async()=>(await pages(port)).find(p=>p.url.endsWith('/panel.html')),'packaged panel unavailable'));
 charm=await connect(await wait(async()=>(await pages(port)).find(p=>p.url.endsWith('/charm.html')),'pendant unavailable'));
 const run=client.run;await wait(()=>run('typeof musicBridge!=="undefined"'),'preload unavailable');
 const info=await run('musicBridge.appInfo()');assert.equal(info.version,require('../package.json').version);
 const backend=await run('musicBridge.checkPython()');assert.equal(backend.ok,true);assert.match(backend.version,/内置/);
 const music=path.join(dir,'fixture-music');fs.mkdirSync(music,{recursive:true});fs.writeFileSync(path.join(music,'本地轨道.wav'),wav);fs.writeFileSync(path.join(music,'本地轨道.lrc'),'[00:00]本地测试歌词\n[00:05]第二句');
 await run(`musicBridge.getSettings().then(s=>musicBridge.saveSettings({...s,downloadDir:${JSON.stringify(music)},apiBases:[${JSON.stringify(base)}],desktopLyricsEnabled:false,disclaimerAcceptedVersion:1}))`);
 await run("document.getElementById('welcome').close()");await charm.run("charmBridge.action({type:'expand'})");await sleep(400);
 await run("document.querySelector('[data-tab=local]').click()");await wait(()=>run("!!document.querySelector('[data-select-id=default]')"),'default playlist missing');
 await run("document.querySelector('[data-select-id=default]').click()");await wait(()=>run("Array.from(document.querySelectorAll('.my-track')).some(r=>r.textContent.includes('本地轨道'))"),'fixture library missing');
 await run("Array.from(document.querySelectorAll('.my-track')).find(r=>r.textContent.includes('本地轨道')).querySelector('.playlist-play').click()");await wait(()=>run("!document.getElementById('music-audio').paused"),'local audio failed');
 await wait(()=>run("document.getElementById('lyric-line').textContent==='本地测试歌词'"),'local lyric missing');
 await run("document.getElementById('lyrics-toggle').click()");
 const overlay=await connect(await wait(async()=>(await pages(port)).find(p=>p.url.endsWith('/floating-lyrics.html')),'desktop lyrics missing'));
 try{
  await wait(()=>overlay.run("document.getElementById('lyric').textContent==='本地测试歌词'"),'desktop lyrics did not receive current lyric');
  await run("document.getElementById('settings-button').click()");await wait(()=>run("!document.getElementById('settings-view').hidden"),'settings did not open');
  for(const locked of [true,false]){
   await run(`if(document.getElementById('lock-lyrics').checked!==${locked})document.getElementById('lock-lyrics').click()`);
   await wait(async()=>{const state=await run('musicBridge.floatingLyricsStatus()'),settings=await run('musicBridge.getSettings()'),visual=await overlay.run("document.getElementById('widget').dataset.locked");return state.locked===locked&&settings.floatingLyrics.mouseThrough===locked&&visual===String(locked);},'desktop lyrics lock did not apply and persist immediately');
  }
  await run("document.querySelector('#settings-view .back-button').click()");
 }finally{overlay.close();}
 await run("document.getElementById('lyrics-toggle').click()");await wait(async()=>!(await pages(port)).some(p=>p.url.endsWith('/floating-lyrics.html')),'desktop lyrics did not close');
 await run("document.getElementById('collapse').click()");const before=await run("document.getElementById('music-audio').currentTime");await sleep(500);assert.ok(await run(`document.getElementById('music-audio').currentTime>${before}`));
 await charm.run("charmBridge.action({type:'expand'})");await sleep(400);
 await run("document.querySelector('[data-tab=search]').click()");await sleep(200);await run("document.getElementById('query').value='测试';document.getElementById('search-form').requestSubmit()");
 await wait(()=>run("document.querySelector('.row-info strong')?.textContent==='轨道测试音频'"),'Python search results not rendered');
 await run("document.querySelector('.row-play').click()");await wait(()=>run("document.getElementById('music-audio').src.startsWith('music-preview:')&&!document.getElementById('music-audio').paused"),'online stream failed');
 await run("document.getElementById('open-fullscreen').click()");
 const fullscreen=await connect(await wait(async()=>(await pages(port)).find(p=>p.url.endsWith('/fullscreen.html')),'packaged fullscreen unavailable'));
 try{
  await wait(()=>fullscreen.run("document.getElementById('background-video').readyState>=2&&!document.getElementById('background-video').paused"),'packaged original background unavailable');
  await fullscreen.run('document.fonts.ready');assert.ok(await fullscreen.run("document.fonts.check('16px Starry')"));
  await wait(()=>fullscreen.run("document.getElementById('title').textContent==='轨道测试音频'&&document.querySelectorAll('.lyric').length===2"),'packaged fullscreen lyrics missing');
  assert.ok(await fullscreen.run("document.getElementById('state').textContent.includes('试听片段')"),'fullscreen must label trial audio');
  await fullscreen.run("document.querySelectorAll('.lyric')[1].click()");await wait(()=>run("document.getElementById('music-audio').currentTime>=5"),'packaged fullscreen seek failed');
  await wait(()=>fullscreen.run("document.querySelector('.lyric.active')?.textContent==='继续航行'"),'packaged lyric sync failed');
  await sleep(300);const shot=await fullscreen.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'fullscreen.png'),Buffer.from(shot.data,'base64'));
  const before=await run("({src:document.getElementById('music-audio').src,time:document.getElementById('music-audio').currentTime})");
  await fullscreen.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await wait(async()=>!(await pages(port)).some(p=>p.url.endsWith('/fullscreen.html')),'packaged Escape failed');
  await sleep(200);assert.ok(await run(`!document.getElementById('music-audio').paused&&document.getElementById('music-audio').src===${JSON.stringify(before.src)}&&document.getElementById('music-audio').currentTime>${before.time}`));
 }finally{fullscreen.close();}
 trial=false;
 assert.equal(await run("getComputedStyle(document.querySelector('footer')).userSelect"),'none');assert.equal(await run("getComputedStyle(document.getElementById('query')).userSelect"),'text');
 await run("document.querySelector('.row-action').click()");await wait(()=>run("document.getElementById('status').textContent.startsWith('下载完成')"),'download failed');
 await run("document.getElementById('tasks-button').click()");await wait(()=>run("document.querySelector('#task-list strong')?.textContent==='轨道测试音频'"),'task must show song name, not ID');
 await run("document.querySelector('#tasks-view .back-button').click()");
 assert.ok(fs.readdirSync(music).some(n=>n.includes('99000001')),'embedded backend did not write downloaded fixture');
 await run("document.querySelector('.row-play').click()");await wait(()=>run("document.getElementById('music-audio').src.startsWith('file:')&&!document.getElementById('music-audio').paused"),'downloaded song was not reused for playback');
 await run("document.getElementById('load-online-playlist').click()");await wait(()=>run("document.getElementById('dialog').open"),'playlist prompt missing');
 await run("document.getElementById('dialog-input').value='https://music.163.com/#/playlist?id=99000001';document.getElementById('dialog-confirm').click()");await wait(()=>run("document.getElementById('list-title').textContent==='网易云歌单'&&!document.getElementById('pagination').hidden&&document.querySelectorAll('.track-row').length===1"),'online playlist failed');
 await run("document.getElementById('play').click();musicBridge.panelAction({type:'height',value:620})");await sleep(300);assert.equal(await run('innerHeight'),620);
 async function drag(target,x,y,dx){
  const bridge=target===charm?'charmBridge.action':'musicBridge.panelAction';
  const start=await target.run('({x:screenX,y:screenY})');
  const send=m=>target.run(bridge+'('+JSON.stringify(m)+')');
  await send({type:'begin',kind:target===charm?'pull':'move',x:start.x+x,y:start.y+y});
  for(let i=1;i<=8;i++)await send({type:'move',x:start.x+x+dx*i/8,y:start.y+y});
  await send({type:'end'});await sleep(100);
 }
 let oldX=await run('screenX');await drag(client,150,25,-60);assert.equal(await run('screenX'),oldX-60);
 await run("musicBridge.panelAction({type:'collapse'})");await sleep(200);oldX=await charm.run('screenX');await drag(charm,38,105,-100);assert.equal(await charm.run('screenX'),oldX-100);
 await charm.run("charmBridge.action({type:'expand'})");await sleep(400);
 const result={ok:true,version:info.version,backend:backend.version,checks:['packaged startup','embedded Python','expand default playlist','local playback','desktop lyrics toggle','desktop lyrics lock applies immediately and persists','collapsed playback','renderer search','online stream','fullscreen lyrics and seek','Escape preserves stream','nonselectable labels and editable input','download button','reuse downloaded audio','online playlist URL','resize','expanded and collapsed multi-step drag geometry','original video background','custom font','named download task']};fs.writeFileSync(path.join(dir,'packaged-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(process.env.ORBIT_KEEP_OPEN!=='1')await run("musicBridge.windowAction('quit')").catch(()=>{});
})().catch(async e=>{console.error(e.stack);console.error('Requests',requests);if(client)console.error(await client.run('document.body.innerText').catch(()=>''));process.exitCode=1;}).finally(()=>{client?.close();charm?.close();server.close();});
