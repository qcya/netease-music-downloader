'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),dir=path.join(root,'.validation/lyrics-transition-'+Date.now()),music=path.join(dir,'music');fs.mkdirSync(music,{recursive:true});app.setPath('userData',dir);
const wav=Buffer.alloc(44+44100*2*30);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
fs.writeFileSync(path.join(music,'甲曲 [111].wav'),wav);fs.writeFileSync(path.join(music,'乙曲 [222].wav'),wav);fs.writeFileSync(path.join(music,'甲曲 [111].lrc'),'[00:00]甲曲第一句');
const server=http.createServer((req,res)=>{setTimeout(()=>{if(!res.destroyed){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({code:200,lrc:{lyric:'[00:00]乙曲第一句'}}));}},2400);});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function wait(f,label){for(let i=0;i<150;i++){try{if(await f())return;}catch{}await sleep(100);}throw Error(label);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({downloadDir:music,desktopLyricsEnabled:true,disclaimerAcceptedVersion:1,apiBases:[base]}));require('../main');await app.whenReady();let panel,charm,overlay;
 await wait(()=>{panel=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));charm=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/charm.html'));overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating-lyrics.html'));return panel&&charm&&overlay;},'windows missing');
 const ui=code=>panel.webContents.executeJavaScript(code,true),lyr=code=>overlay.webContents.executeJavaScript(code,true);
 await wait(()=>ui("document.querySelectorAll('.playlist-heading').length>0"),'library missing');
 await charm.webContents.executeJavaScript("charmBridge.action({type:'expand'})",true);await sleep(300);
 await ui("document.querySelector('.playlist-heading').click()");await wait(()=>ui("document.querySelectorAll('.my-track').length===2"),'tracks not expanded');
 await ui("[...document.querySelectorAll('.my-track')].find(e=>e.dataset.key.includes('甲曲')).querySelector('.playlist-play').click()");
 await wait(()=>ui("document.getElementById('lyric-line').textContent==='甲曲第一句'"),'first lyrics missing');
 await wait(()=>lyr("document.getElementById('lyric').textContent==='甲曲第一句'"),'first desktop lyrics missing');
 await ui("[...document.querySelectorAll('.my-track')].find(e=>e.dataset.key.includes('乙曲')).querySelector('.playlist-play').click()");
 await wait(()=>ui("document.getElementById('track-title').textContent.includes('乙曲')"),'second track not selected');
 await wait(()=>lyr("document.getElementById('lyric').textContent==='正在获取歌词…'"),'desktop lyrics did not switch to loading');
 assert.notEqual(await ui("document.getElementById('lyric-line').textContent"),'甲曲第一句');
 await ui("[...document.querySelectorAll('.my-track')].find(e=>e.dataset.key.includes('甲曲')).querySelector('.playlist-play').click()");
 await wait(()=>ui("document.getElementById('lyric-line').textContent==='甲曲第一句'"),'first lyrics not restored');await sleep(3000);
 assert.equal(await ui("document.getElementById('lyric-line').textContent"),'甲曲第一句','late second response overwrote current lyrics');
 assert.equal(await lyr("document.getElementById('lyric').textContent"),'甲曲第一句');
 console.log(JSON.stringify({ok:true,checks:['desktop lyrics change while resolving','late lyrics ignored','desktop and panel remain synchronized']}));
 await ui("musicBridge.windowAction('quit')");server.close();
})().catch(e=>{console.error(e.stack);server.close();app.exit(1);});
