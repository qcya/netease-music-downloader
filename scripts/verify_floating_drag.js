'use strict';
// Exercise the real Windows mouse and compositor, not DOM-synthesized pointer events.
const {app,BrowserWindow,screen}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFile}=require('node:child_process');
const root=path.join(__dirname,'..'),dir=path.join(root,'.validation','floating-drag-'+Date.now()),music=path.join(dir,'music');
fs.mkdirSync(music,{recursive:true});app.setPath('userData',dir);
fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({downloadDir:music,desktopLyricsEnabled:true,disclaimerAcceptedVersion:1}));
const wav=Buffer.alloc(44+44100*2*30);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
fs.writeFileSync(path.join(music,'drag-fixture.wav'),wav);fs.writeFileSync(path.join(music,'drag-fixture.lrc'),'[00:00]测试拖动桌面歌词测试拖动桌面歌词');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function wait(fn,label){for(let i=0;i<180;i++){try{if(await fn())return;}catch{}await sleep(100);}throw Error(label);}
async function nativeDrag(start,end){
 const a=screen.dipToScreenPoint(start),b=screen.dipToScreenPoint(end);
 const ps=`Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class MouseInput{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);}'\n[MouseInput]::SetCursorPos(${a.x},${a.y}) | Out-Null\nStart-Sleep -Milliseconds 180\n[MouseInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)\nStart-Sleep -Milliseconds 150\nfor ($i=1;$i -le 20;$i++){[MouseInput]::SetCursorPos((${a.x}+[int]((${b.x}-${a.x})*$i/20)),(${a.y}+[int]((${b.y}-${a.y})*$i/20))) | Out-Null;Start-Sleep -Milliseconds 25}\nStart-Sleep -Milliseconds 200\n[MouseInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`;
 await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{windowsHide:true},(e,_out,err)=>e?reject(Error(err||e.message)):resolve()));
}
require('../main');
(async()=>{
 await app.whenReady();let panel,charm,overlay;
 await wait(()=>{panel=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));charm=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/charm.html'));overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating-lyrics.html'));return panel&&charm&&overlay;},'windows missing');
 const ui=code=>panel.webContents.executeJavaScript(code,true),lyr=code=>overlay.webContents.executeJavaScript(code,true);
 await wait(()=>ui("document.querySelector('.playlist-heading')"),'playlist missing');await charm.webContents.executeJavaScript("charmBridge.action({type:'expand'})",true);await sleep(300);
 await ui("document.querySelector('.playlist-heading').click()");await wait(()=>ui("document.querySelector('.playlist-play')"),'fixture song missing');await ui("document.querySelector('.playlist-play').click()");
 await wait(()=>lyr("document.getElementById('lyric').textContent.includes('测试拖动')"),'lyrics missing');await wait(()=>overlay.isVisible(),'overlay not visible');
 const area=screen.getPrimaryDisplay().workArea;overlay.setPosition(area.x+100,area.y+Math.round(area.height*.55));
 async function setLock(value){await ui("document.getElementById('settings-button').click()");await wait(()=>ui("!document.getElementById('settings-view').hidden"),'settings missing');await ui(`if(document.getElementById('lock-lyrics').checked!==${value})document.getElementById('lock-lyrics').click()`);await wait(async()=>{const s=await ui('musicBridge.floatingLyricsStatus()'),prefs=await ui('musicBridge.getSettings()');return s.locked===value&&prefs.floatingLyrics.mouseThrough===value;},'lock toggle did not take effect immediately');await ui("document.querySelector('#settings-view .back-button').click()");await sleep(250);}
 async function drag(){const b=overlay.getBounds(),rect=await lyr("(()=>{const e=document.querySelector('#lyric');const r=document.createRange();r.selectNodeContents(e);const b=r.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};})()");const start={x:Math.round(b.x+rect.x+rect.width*.5),y:Math.round(b.y+rect.y+rect.height*.5)};await nativeDrag(start,{x:start.x+130,y:start.y+55});await sleep(350);return {before:b,after:overlay.getBounds(),start};}
 await setLock(false);const blankBefore=overlay.getBounds(),blank={x:blankBefore.x+10,y:blankBefore.y+blankBefore.height-5};await nativeDrag(blank,{x:blank.x+100,y:blank.y+30});await sleep(250);const blankAfter=overlay.getBounds();assert.ok(Math.abs(blankAfter.x-blankBefore.x)>50,'transparent blank area did not move lyrics: '+JSON.stringify({before:blankBefore,after:blankAfter}));
 const unlocked=await drag();assert.ok(Math.abs(unlocked.after.x-unlocked.before.x)>50&&Math.abs(unlocked.after.y-unlocked.before.y)>20,'unlocked native drag failed: '+JSON.stringify(unlocked));
 await setLock(true);const locked=await drag();assert.equal(locked.after.x,locked.before.x,'locked lyrics moved horizontally');assert.equal(locked.after.y,locked.before.y,'locked lyrics moved vertically');
 await setLock(false);const unlockedAgain=await drag();assert.ok(Math.abs(unlockedAgain.after.x-unlockedAgain.before.x)>50,'unlocking did not restore native drag: '+JSON.stringify(unlockedAgain));
 const expected=overlay.getBounds();await ui('musicBridge.closeFloatingLyrics()');await ui('musicBridge.showFloatingLyrics()');await ui("musicBridge.updateFloatingLyrics({title:'fixture',line:'测试拖动桌面歌词测试拖动桌面歌词'})");
 await wait(()=>{overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating-lyrics.html'));return overlay&&overlay.isVisible();},'lyrics did not reopen');
 const reopened=overlay.getBounds(),reopenedStatus=await ui('musicBridge.floatingLyricsStatus()');assert.equal(reopened.x,expected.x,'horizontal drag position was not restored');assert.equal(reopened.y,expected.y,'vertical drag position was not restored');assert.equal(reopenedStatus.locked,false,'unlock state was not restored');
 const afterReopen=await drag();assert.ok(Math.abs(afterReopen.after.x-afterReopen.before.x)>50,'reopened lyrics could not be dragged');
 console.log(JSON.stringify({ok:true,checks:['transparent blank and text drag','native drag blocked while locked','native drag after unlocking','immediate setting persistence','reopen preserves unlocked state and position']}));await ui("musicBridge.windowAction('quit')");
})().catch(e=>{console.error(e.stack);app.exit(1);});
