'use strict';
// Real transparent BrowserWindow on the scaled monitor, with a controlled cursor.
// Unlike the full native-mouse test this does not move the user's real pointer.
const {app,BrowserWindow,Menu,screen,ipcMain}=require('electron'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');
let create;
if(process.env.DRIFT_TEST_OLD==='1'){
 const Module=require('node:module'),{execFileSync}=require('node:child_process');
 const source=execFileSync('git',['show','814513690b2c714ad6e635ea89ceeadfe8dcc678:floating_window.js'],{cwd:root,encoding:'utf8'}),mod=new Module(path.join(root,'old-drift-floating.js'),module);
 mod.filename=path.join(root,'old-drift-floating.js');mod.paths=module.paths;mod._compile(source,mod.filename);create=mod.exports.createFloatingLyricsController;
}else create=require('../floating_window').createFloatingLyricsController;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label){for(let i=0;i<150;i++){if(await fn())return;await sleep(100);}throw Error(label);}
(async()=>{
 await app.whenReady();
 const displays=screen.getAllDisplays(),display=displays.find(d=>d.scaleFactor!==1&&d.id!==screen.getPrimaryDisplay().id);
 if(!display)throw Error('A non-primary scaled Windows monitor is required for this test');
 const area=display.workArea,cursor={x:area.x+700,y:area.y+120};
 const proxy={getCursorScreenPoint:()=>({...cursor}),getAllDisplays:()=>displays,getPrimaryDisplay:()=>screen.getPrimaryDisplay(),getDisplayMatching:b=>screen.getDisplayMatching(b)};
 let controller;const settings=require('../lyric_preferences').normalizeLyrics({mouseThrough:false,width:800,fontSize:64,translationSize:42});
 ipcMain.handle('lyrics:preferences',()=>settings);
 ipcMain.handle('lyrics:resize',(_event,h)=>controller.resizeTo(h));
 ipcMain.on('lyrics:shape',(_event,rects)=>controller.setLyricShape?.(rects));
 controller=create({BrowserWindow,Menu,baseDir:root,screen:proxy,getMainWindow:()=>null,getSettings:()=>settings,getSavedPosition:()=>({x:area.x+300,y:area.y+50})});
 controller.open();controller.update({title:'fixture',line:'固定鼠标测试歌词'});
 await wait(()=>controller.status().visible,'overlay missing');await sleep(400);
 const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating-lyrics.html'));assert.ok(win);
 const start=win.getBounds();assert.equal(controller.dragBegin(),true);const samples=[];
 for(let i=0;i<120;i++){
  if(i%20===0)controller.update({title:'fixture',line:i%40?'短歌词':'较长歌词'.repeat(80),translation:i%40?'':'很长的翻译'.repeat(50)});
  controller.dragMove();await sleep(50);samples.push(win.getBounds());
  if(process.env.DRIFT_TEST_OLD!=='1'&&i===10){
   const fits=await win.webContents.executeJavaScript(`['lyric','translate'].map(id=>{const e=document.getElementById(id),r=document.createRange();r.selectNodeContents(e);return {actual:r.getBoundingClientRect().width,available:e.clientWidth,whiteSpace:getComputedStyle(e).whiteSpace};})`);
   assert.ok(fits.every(f=>f.whiteSpace==='pre'&&f.actual<=f.available+1),'long lyrics do not fit in one line: '+JSON.stringify(fits));
  }
  if(process.env.DRIFT_TEST_OLD!=='1'&&i===30){const size=await win.webContents.executeJavaScript("parseFloat(getComputedStyle(document.getElementById('lyric')).fontSize)");assert.equal(size,settings.fontSize,'short lyric did not restore font size');}
 }
 controller.dragEnd();const final=win.getBounds();
 assert.ok(new Set(samples.map(b=>b.height)).size>1,'lyric wrapping did not change height');
 assert.ok(samples.every(b=>b.x===start.x&&b.y===start.y&&b.width===start.width),'stationary cursor drift: '+JSON.stringify({start,final,samples:samples.filter((_,i)=>i%20===19)}));
 console.log(JSON.stringify({ok:true,monitor:display.id,scale:display.scaleFactor,start,final,checks:['six seconds stationary cursor','lyric text and height changes','real scaled-monitor window geometry']}));controller.close();app.quit();
})().catch(e=>{console.error(e.stack);app.exit(1)});
