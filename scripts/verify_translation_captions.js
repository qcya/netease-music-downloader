'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
process.on('uncaughtException',e=>{console.error(e.stack);app.exit(1);});process.on('unhandledRejection',e=>{console.error(e.stack||e);app.exit(1);});
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),dir=path.join(root,'.validation','translation-303-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
ipcMain.handle('lyrics:preferences',()=>require('../lyric_preferences').normalizeLyrics({mouseThrough:false}));ipcMain.handle('lyrics:resize',()=>true);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,x:-12000,y:-12000,width:900,height:160,frame:false,transparent:true,skipTaskbar:true,webPreferences:{preload:path.join(root,'floating-preload.js'),contextIsolation:true,sandbox:true,backgroundThrottling:false,offscreen:true}});
 await w.loadFile(path.join(root,'app/floating-lyrics.html'));const ui=s=>w.webContents.executeJavaScript(s,true);await ui('document.fonts.ready.then(()=>true)');
 const info={title:'字幕测试',line:'Let music guide us',translation:'让音乐陪伴每一步',words:[{text:'Let ',time:1,duration:1},{text:'music guide us',time:4,duration:1}],time:1.5,playing:false};
 async function sample(time){info.time=time;w.webContents.send('lyrics:text',info);await sleep(90);}
 const revealed=()=>ui("[...document.querySelectorAll('#translate .translation-unit')].filter(n=>n.style.opacity==='1').length");
 await sample(1.5);assert.equal(await revealed(),2);await sample(2);const rest=await revealed();await sample(3);assert.equal(await revealed(),rest);await sample(4.5);assert.equal(await revealed(),6);await sample(1.1);assert.equal(await revealed(),1);await sleep(120);assert.equal(await revealed(),1);
 info.line='日本語の歌詞';info.translation='这是一段较长翻译'.repeat(30);await sample(4.5);
 const geometry=await ui("['lyric','translate'].map(id=>{const n=document.getElementById(id),r=document.createRange();r.selectNodeContents(n);return {text:r.getBoundingClientRect().width,width:n.clientWidth,space:getComputedStyle(n).whiteSpace}})");assert.ok(geometry.every(n=>n.text<=n.width+1&&n.space==='pre'),JSON.stringify(geometry));
 delete info.words;info.translation='没有逐字时间时保持完整翻译';await sample(4.5);assert.equal(await ui("document.getElementById('translate').textContent"),info.translation);assert.equal(await ui("document.querySelectorAll('.translation-unit').length"),0);
 assert.equal(w.isVisible(),false);w.destroy();console.log(JSON.stringify({ok:true,checks:['desktop translation follows original vocals','rest/pause/backward seek','long translated captions remain one line','ordinary LRC fallback','no visible window']}));app.quit();
}).catch(e=>{console.error(e.stack);app.exit(1);});
