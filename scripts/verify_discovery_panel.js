'use strict';
// Actual Electron renderer, preload, IPC, discovery and backend against deterministic fixtures.
const {app,BrowserWindow,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),dir=path.join(root,'.validation/discovery-'+Date.now()),music=path.join(dir,'music');fs.mkdirSync(music,{recursive:true});app.setPath('userData',dir);
const songs=Array.from({length:16},(_,i)=>({id:88000001+i,name:'测试歌曲'+String(i+1).padStart(2,'0'),ar:[{name:'测试歌手'}],al:{name:'测试专辑'},dt:60000}));
const unavailable=id=>[1,5].includes((Number(id)-88000001)%8);
const wav=Buffer.alloc(44+44100*2*20);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
let base;const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),json=data=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 if(u.pathname==='/search'){const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||8);return json({code:200,result:{songs:songs.slice(offset,offset+limit),songCount:songs.length}});}
 if(u.pathname==='/playlist/track/all'){const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||500);return json({code:200,total:songs.length,songs:songs.slice(offset,offset+limit)});}
 if(u.pathname==='/song/url/v1'){const ids=(u.searchParams.get('id')||'').split(',');return json({code:200,data:ids.map(id=>({id:Number(id),url:unavailable(id)?null:base+'/audio.wav',level:'standard',br:128000}))});}
 if(u.pathname==='/lyric/new'||u.pathname==='/lyric')return json({code:200,lrc:{lyric:'[00:00]测试歌词'}});
 if(u.pathname==='/audio.wav'){const m=/bytes=(\d+)-(\d*)/.exec(req.headers.range||''),start=m?Number(m[1]):0,end=m&&m[2]?Math.min(Number(m[2]),wav.length-1):wav.length-1;res.writeHead(m?206:200,{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':end-start+1,...(m?{'Content-Range':`bytes ${start}-${end}/${wav.length}`}:{})});res.end(wav.subarray(start,end+1));return;}
 res.writeHead(404);res.end();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function wait(fn,label){for(let n=0;n<200;n++){try{if(await fn())return;}catch{}await sleep(100);}throw Error(label);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({downloadDir:music,apiBases:[base],disclaimerAcceptedVersion:1,desktopLyricsEnabled:false}));
 const realFetch=net.fetch.bind(net);net.fetch=(input,options)=>{const u=new URL(typeof input==='string'?input:input.url);
  if(u.hostname!=='music.163.com')return realFetch(input,options);
  let body;
  if(u.pathname==='/api/playlist/list'){const offset=Number(u.searchParams.get('offset')||0);body={code:200,total:200,more:true,playlists:Array.from({length:8},(_,i)=>({id:99000001+offset+i,name:'热门歌单'+(offset+i+1),trackCount:16,creator:{nickname:'测试用户'}}))};}
  else if(u.pathname==='/api/playlist/detail')body={code:200,playlist:{id:Number(u.searchParams.get('id')),name:'热门歌单',trackCount:16,trackIds:songs.map(s=>({id:s.id})),tracks:songs}};
  else if(u.pathname==='/api/song/enhance/player/url'){const ids=JSON.parse(u.searchParams.get('ids')||'[]');body={code:200,data:ids.map(id=>({id:Number(id),url:unavailable(id)?null:base+'/audio.wav'}))};}
  else return Promise.resolve(new Response('{}',{status:404,headers:{'content-type':'application/json'}}));
  return Promise.resolve(new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}}));
 };
 const errors=[];app.on('web-contents-created',(_e,w)=>w.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);}));require('../main');await app.whenReady();let panel,charm;
 await wait(()=>{panel=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));charm=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/charm.html'));return panel&&charm;},'windows missing');
 const run=(w,code)=>w.webContents.executeJavaScript(code,true),ui=code=>run(panel,code);await wait(()=>ui("typeof document.querySelector('[data-tab=recent]')?.onclick==='function'"),'renderer not ready');
 await run(charm,"charmBridge.action({type:'expand'})");await ui("document.querySelector('[data-tab=recent]').click()");
 await wait(()=>ui("document.querySelectorAll('.discovery-card').length===8"),'popular playlists missing');assert.equal(await ui("document.querySelector('.discovery-card strong').textContent"),'热门歌单1');
 await ui("document.getElementById('refresh').click()");await wait(()=>ui("document.querySelector('.discovery-card strong')?.textContent==='热门歌单41'"),'refresh did not load another batch');
 await ui("document.querySelector('.discovery-card').click()");
 async function verifyPage(start){
  await wait(()=>ui("document.querySelectorAll('.track-row').length===8&&Array.from(document.querySelectorAll('.row-state')).filter(e=>e.textContent==='在线未就绪').length===2"),'availability not applied');
  const keys=await ui("Array.from(document.querySelectorAll('.track-row')).map(e=>Number(e.dataset.key.replace('online:','')))");
  const expected=Array.from({length:8},(_,i)=>start+i).filter(id=>!unavailable(id)).concat(Array.from({length:8},(_,i)=>start+i).filter(unavailable));assert.deepEqual(keys,expected);
 }
 await verifyPage(88000001);
 await ui("document.querySelector('[data-key=\"online:88000008\"] .row-play').click()");await wait(()=>ui("document.getElementById('track-title').textContent==='测试歌曲08'&&!document.getElementById('music-audio').paused"),'page-one track did not play');
 await sleep(300);await ui("document.getElementById('next').click()");await wait(()=>ui("document.getElementById('track-title').textContent==='测试歌曲09'&&!document.getElementById('music-audio').paused"),'playlist did not continue across page boundary');
 await ui("document.getElementById('page-next').click()");await wait(()=>ui("document.getElementById('page-label').textContent==='第 2 页'"),'playlist second page missing');await verifyPage(88000009);
 await ui("document.querySelector('.row-play').click()");await wait(()=>ui("!document.getElementById('music-audio').paused&&document.getElementById('music-audio').currentTime>.1"),'playlist song did not play');
 await ui("document.getElementById('back-discovery').click()");await wait(()=>ui("document.querySelectorAll('.discovery-card').length===8"),'return to discovery failed');
 await ui("document.querySelector('[data-tab=search]').click()");await ui("document.getElementById('query').value='测试';document.getElementById('search-form').requestSubmit()");await verifyPage(88000001);
 await ui("document.getElementById('page-next').click()");await wait(()=>ui("document.getElementById('page-label').textContent==='第 2 页'"),'search second page missing');await verifyPage(88000009);
 // Manual playlists must retain the configured API and existing URL/ID parsing.
 async function openManual(input){
  await ui("document.getElementById('load-online-playlist').click()");await wait(()=>ui("document.getElementById('dialog').open"),'manual playlist prompt missing');
  await ui("document.getElementById('dialog-input').value="+JSON.stringify(input)+";document.getElementById('dialog-confirm').click()");
  try{await wait(()=>ui("document.getElementById('list-title').textContent==='网易云歌单'&&document.getElementById('page-label').textContent==='第 1 页'"),'manual playlist did not open');}catch(e){console.error('manual state',await ui("({status:document.getElementById('status').textContent,title:document.getElementById('list-title').textContent,page:document.getElementById('page-label').textContent})"));throw e;}
  await verifyPage(88000001);
 }
 await openManual('https://music.163.com/#/playlist?id=99000001');
 await ui("document.querySelector('[data-key=\"online:88000008\"] .row-play').click()");await wait(()=>ui("document.getElementById('track-title').textContent==='测试歌曲08'&&!document.getElementById('music-audio').paused"),'manual playlist track did not play');
 await sleep(300);await ui("document.getElementById('next').click()");await wait(()=>ui("document.getElementById('track-title').textContent==='测试歌曲09'&&!document.getElementById('music-audio').paused"),'manual playlist did not continue across page boundary');
 await ui("document.getElementById('page-next').click()");await wait(()=>ui("document.getElementById('page-label').textContent==='第 2 页'"),'manual playlist second page missing');await verifyPage(88000009);
 await openManual('99000001');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['popular playlists','refresh changes batch','open playlist','play playlist audio','playlist playback crosses page boundary','each page availability order','search pagination and availability order','manual playlist URL and ID with custom API','manual playlist pagination and cross-page playback'],rendererErrors:errors}));
 await ui("musicBridge.windowAction('quit')");server.close();
})().catch(e=>{console.error(e.stack);server.close();app.exit(1);});
