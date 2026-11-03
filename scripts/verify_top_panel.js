'use strict';
// Run with Electron. No network or user library needed.
const {app,BrowserWindow,screen}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),dir=path.join(root,'.validation/top-panel-'+Date.now()),music=path.join(dir,'music');
fs.mkdirSync(music,{recursive:true});app.setPath('userData',dir);
fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({downloadDir:music,disclaimerAcceptedVersion:1,desktopLyricsEnabled:false}));
const wav=Buffer.alloc(44+44100*2*60);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
for(const name of ['晨间练习.wav','夜航练习.wav'])fs.writeFileSync(path.join(music,name),wav);
fs.writeFileSync(path.join(music,'晨间练习.lrc'),'[00:00]第一束光\n[00:05]沿着轨道出发');
const errors=[];app.on('web-contents-created',(_e,w)=>w.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);}));
require('../main');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(check,label){for(let n=0;n<150;n++){if(await check())return;await sleep(100);}throw Error(label);}
(async()=>{
 await app.whenReady();let panel,charm;
 await wait(()=>{panel=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));charm=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/charm.html'));return panel&&charm;},'windows missing');
 const run=(w,code)=>w.webContents.executeJavaScript(code,true),ui=code=>run(panel,code);
 await wait(()=>ui('document.querySelectorAll(".track-row").length===2'),'local library not ready');
 await wait(()=>charm.isVisible(),'charm not visible');assert.equal(panel.isVisible(),false);
 const originalX=charm.getBounds().x;charm.focus();await sleep(100);
 charm.webContents.sendInputEvent({type:'mouseMove',x:38,y:105});
 charm.webContents.sendInputEvent({type:'mouseDown',x:38,y:105,button:'left',clickCount:1});await sleep(60);
 charm.webContents.sendInputEvent({type:'mouseMove',x:-82,y:105,modifiers:['leftButtonDown']});await sleep(100);
 charm.webContents.sendInputEvent({type:'mouseUp',x:38,y:105,button:'left',clickCount:1});await sleep(100);
 assert.equal(charm.getBounds().x,originalX-120,'collapsed pendant must move left');assert.equal(panel.isVisible(),false);
 charm.focus();await sleep(150);charm.webContents.sendInputEvent({type:'mouseMove',x:38,y:105});await sleep(100);
 charm.webContents.sendInputEvent({type:'mouseDown',x:38,y:105,button:'left',clickCount:1});await sleep(80);
 charm.webContents.sendInputEvent({type:'mouseMove',x:38,y:150,button:'left',modifiers:['leftButtonDown']});await sleep(80);
 charm.webContents.sendInputEvent({type:'mouseMove',x:38,y:240,button:'left',modifiers:['leftButtonDown']});await sleep(100);
 assert.ok(panel.isVisible(),'pointer pull must reveal the panel before release');
 charm.webContents.sendInputEvent({type:'mouseUp',x:38,y:240,button:'left',clickCount:1});await sleep(500);
 assert.equal(panel.isVisible(),true);assert.equal(charm.isVisible(),false);assert.equal(panel.getBounds().y,screen.getPrimaryDisplay().workArea.y);
 const expandedX=panel.getBounds().x;panel.focus();panel.webContents.sendInputEvent({type:'mouseMove',x:150,y:25});
 panel.webContents.sendInputEvent({type:'mouseDown',x:150,y:25,button:'left',clickCount:1});await sleep(60);
 panel.webContents.sendInputEvent({type:'mouseMove',x:100,y:25,modifiers:['leftButtonDown']});await sleep(100);
 panel.webContents.sendInputEvent({type:'mouseUp',x:150,y:25,button:'left',clickCount:1});await sleep(80);
 assert.equal(panel.getBounds().x,expandedX-50,'expanded panel must move horizontally');
 await ui("document.querySelector('.row-play').click()");await wait(()=>ui("!document.getElementById('music-audio').paused && document.getElementById('music-audio').currentTime>.1"),'playback missing');
 await ui("document.getElementById('collapse').click()");await sleep(500);assert.equal(panel.isVisible(),false);assert.equal(charm.isVisible(),true);
 assert.ok(await ui("document.getElementById('music-audio').currentTime>.4"),'collapse interrupted audio');
 await run(charm,"charmBridge.action({type:'expand'})");await sleep(400);
 await ui("document.getElementById('volume').value=.25;document.getElementById('volume').dispatchEvent(new Event('input'));document.getElementById('seek').value=5;document.getElementById('seek').dispatchEvent(new Event('change'))");
 await wait(()=>ui("document.getElementById('music-audio').volume===.25 && document.getElementById('music-audio').currentTime>=5"),'seek/volume failed');
 await ui("document.getElementById('play').click()");await wait(()=>ui("document.getElementById('music-audio').paused"),'pause failed');
 await ui("document.getElementById('query').value='夜航';document.getElementById('query').dispatchEvent(new Event('input'))");assert.equal(await ui("document.querySelectorAll('.track-row').length"),1);
 await ui("document.getElementById('query').value='';document.getElementById('query').dispatchEvent(new Event('input'))");
 // Drive the real dialogs and playlist IPC, including filename migration.
 await ui("document.getElementById('new-playlist').click()");await wait(()=>ui("document.getElementById('dialog').open"),'create dialog');
 await ui("document.getElementById('dialog-input').value='夜间轨道';document.getElementById('dialog-confirm').click()");await wait(()=>ui("document.getElementById('playlist').options.length===3"),'category creation');
 await ui("document.querySelector('.row-action').click()");await wait(()=>ui("document.getElementById('dialog').open"),'track dialog');await ui("document.getElementById('dialog-confirm').click()");await wait(()=>ui("document.getElementById('dialog-title').textContent==='加入哪个歌单？'"),'target dialog');
 await ui("document.getElementById('dialog-select').selectedIndex=1;document.getElementById('dialog-confirm').click()");
 await wait(()=>ui("document.getElementById('status').textContent==='歌单已更新'"),'add song failed');
 await ui("document.getElementById('playlist').selectedIndex=2;document.getElementById('playlist').dispatchEvent(new Event('change'))");assert.equal(await ui("document.querySelectorAll('.track-row').length"),1);
 await ui("document.querySelector('.row-play').click()");await wait(()=>ui("!document.getElementById('music-audio').paused"),'renamed song cannot play');
 await ui("document.getElementById('play').click()");
 panel.focus();panel.webContents.sendInputEvent({type:'mouseMove',x:210,y:725});await sleep(80);panel.webContents.sendInputEvent({type:'mouseDown',x:210,y:725,button:'left',clickCount:1});await sleep(50);
 panel.webContents.sendInputEvent({type:'mouseMove',x:210,y:605,button:'left',modifiers:['leftButtonDown']});await sleep(100);
 panel.webContents.sendInputEvent({type:'mouseUp',x:210,y:605,button:'left',clickCount:1});await sleep(100);assert.equal(panel.getBounds().height,620,'pointer resize must shorten panel');
 for(const height of [520,740]){await ui(`musicBridge.panelAction({type:'height',value:${height}})`);await sleep(200);assert.equal(panel.getBounds().height,height);assert.ok(await ui("document.getElementById('resize-grip').getBoundingClientRect().bottom<=innerHeight+1"),'grip clipped');fs.writeFileSync(path.join(root,`.validation/panel-${height}.png`),(await panel.webContents.capturePage()).toPNG());}
 panel.close();await sleep(200);assert.equal(panel.isDestroyed(),false);assert.equal(panel.isVisible(),false);
 if(errors.length)throw Error(errors.join('\n'));
 const result={ok:true,checks:['original icon pendant','collapsed horizontal drag','expanded horizontal drag','pointer cord expansion','pointer height resize','top anchored expansion','local playback','collapsed playback','seek','volume','pause','filter','create playlist','assign and rename file','play renamed file','height presets','close collapses'],rendererErrors:errors};fs.writeFileSync(path.join(root,'.validation/panel-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(process.env.ORBIT_KEEP_OPEN==='1'){await run(charm,"charmBridge.action({type:'expand'})");return;}
 await ui("musicBridge.windowAction('quit')");
})().catch(e=>{console.error(e.stack);app.exit(1);});

