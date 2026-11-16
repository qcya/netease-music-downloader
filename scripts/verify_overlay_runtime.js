'use strict';
const {app,BrowserWindow,globalShortcut}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const cp=require('node:child_process'),nativeSpawn=cp.spawn,spawned=[];
cp.spawn=(...args)=>{const p=nativeSpawn(...args);spawned.push(p);return p;};
const directory=path.join(__dirname,'../.validation/overlay-runtime-'+Date.now());fs.mkdirSync(directory,{recursive:true});app.setPath('userData',directory);process.env.MUSIC_DOWNLOADER_TEST_USER_DATA=directory;
fs.writeFileSync(path.join(directory,'settings.json'),JSON.stringify({downloadDir:path.join(directory,'music'),desktopLyricsEnabled:false,disclaimerAcceptedVersion:1}));
const music=path.join(directory,'music');fs.mkdirSync(music,{recursive:true});const wav=Buffer.alloc(44+44100*2*12);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);fs.writeFileSync(path.join(music,'静音验证.wav'),wav);
const callbacks={};globalShortcut.register=(key,callback)=>{callbacks[key]=callback;return true;};
BrowserWindow.prototype.show=function(){};BrowserWindow.prototype.showInactive=function(){};BrowserWindow.prototype.focus=function(){};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label){for(let i=0;i<200;i++){try{if(await fn())return;}catch{}await pause(100);}throw Error(label);}
(async()=>{
 require('../main');await app.whenReady();await pause(500);assert.equal(BrowserWindow.getAllWindows().length,0,'silent startup created a window');assert.equal(spawned.length,0,'silent startup launched an API/backend process');
 app.getAppMetrics();await pause(5000);const metrics=app.getAppMetrics();const cpu=metrics.reduce((n,m)=>n+Math.max(0,m.cpu?.percentCPUUsage||0),0);
 assert.ok(!metrics.some(m=>m.type==='Tab'),'silent startup has a renderer');assert.equal(typeof callbacks.Insert,'function');
 callbacks.Insert();let panel;await wait(()=>{panel=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));return panel;},'INS did not create player');const ui=s=>panel.webContents.executeJavaScript(s,true);
 await wait(()=>ui("!!document.getElementById('account-entry')&&typeof document.getElementById('account-entry').onclick==='function'"),'account footer missing');
 assert.equal(await ui("document.getElementById('account-entry-label').textContent"),'未登录');
 const tint=await ui("getComputedStyle(document.querySelector('.panel')).backgroundColor");
 const rgba=tint.match(/[\d.]+/g).map(Number);assert.equal(rgba[3],0,'window background must have zero fill alpha: '+tint);
 assert.equal(BrowserWindow.getAllWindows().length,2,'expected one player and its bounded glass host');const glass=BrowserWindow.getAllWindows().find(w=>w!==panel);assert.deepEqual(glass.getBounds(),panel.getBounds(),'glass must exactly follow the player');assert.equal(glass.getOpacity(),.25);assert.ok(panel.getBounds().width<require('electron').screen.getDisplayMatching(panel.getBounds()).bounds.width,'blur surface extends beyond player window');
 await ui("(async()=>{const source=await musicBridge.playLocal('静音验证.wav');const a=document.getElementById('music-audio');a.muted=true;a.src=source.url;await a.play()})()");
 await pause(700);const before=await ui("document.getElementById('music-audio').currentTime");callbacks.Insert();assert.ok(!panel.isDestroyed(),'hiding playback killed audio renderer');assert.equal(BrowserWindow.getAllWindows().length,1,'hidden player acquired an extra window');
 await pause(1200);const after=await ui("document.getElementById('music-audio').currentTime");assert.ok(after>before+.5,'hidden audio stopped advancing');await ui("document.getElementById('music-audio').pause()");
 // Start an actual backend, then prove it is freed after idle grace time.
 await ui("musicBridge.neteaseRequest('hot')");assert.ok(spawned.length>0,'backend fixture never started');
 await ui("document.getElementById('lyrics-toggle').click()");await wait(async()=>(await ui('musicBridge.floatingLyricsStatus()')).open,'lyric idle fixture missing');
 await pause(32000);assert.ok(spawned.every(p=>p.killed||p.exitCode!==null),'idle API process was retained');
 assert.equal(await ui("document.body.classList.contains('power-idle')"),true);
 assert.equal((await ui('musicBridge.floatingLyricsStatus()')).open,false,'idle lyric renderer retained');
 assert.equal((await ui('musicBridge.getSettings()')).desktopLyricsEnabled,true,'idle release disabled lyric preference');
 await wait(()=>ui("document.getElementById('lyrics-toggle').getAttribute('aria-pressed')==='true'"),'idle release lost renderer lyric preference');
 console.log(JSON.stringify({ok:true,idleCpuPercent:cpu,checks:['zero startup windows','zero startup backend processes','INS lazy launch','transparent player','one native acrylic window','hidden audio continues advancing','idle backend released','hidden animations paused','unlogged account footer']}));app.quit();
})().catch(e=>{console.error(e.stack||e.message);app.exit(1)});
