'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {normalizePosition,resolvePosition}=require('../lyric_position.js');
const {createFloatingLyricsController}=require('../floating_window.js');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const screens=[
 {workArea:{x:0,y:0,width:1920,height:1080}},
 {workArea:{x:-1440,y:0,width:1440,height:900}}
];
const screen={
 getAllDisplays:()=>screens,
 getPrimaryDisplay:()=>screens[0],
 cursor:{x:0,y:0},
 getCursorScreenPoint(){return {...this.cursor}},
 getDisplayMatching:()=>screens[0]
};
test('validates saved coordinates; restores negative monitor coords; rescues off-screen settings',()=>{
 assert.deepEqual(normalizePosition({x:-800,y:58}),{x:-800,y:58});
 for(const v of [{x:'42',y:2},{x:NaN,y:1},{x:1.1,y:2},{x:100001,y:3},{x:0},null])assert.equal(normalizePosition(v),null);
 assert.deepEqual(resolvePosition({x:-800,y:58},screen,800,88),{x:-800,y:58});
 assert.deepEqual(resolvePosition({x:1810,y:1050},screen,800,88),{x:1120,y:992});
 assert.deepEqual(resolvePosition({x:7000,y:3000},screen,800,88),{x:560,y:80});
 assert.deepEqual(resolvePosition(null,screen,800,88),{x:560,y:80});
});
function mockController(initial){
 let saved=initial,latest;
 const events=[];
 class Window {
   constructor(opts){
     this.options=opts;this.bounds={x:opts.x??0,y:opts.y??0,width:opts.width,height:opts.height};this.closed=false;
     this.webContents={
       id:99,
       once:(_event,fn)=>{this.onLoad=fn},
       send:(...args)=>events.push(args),
       setWindowOpenHandler(){},on(){}};
     latest=this;
   }
   isDestroyed(){return this.closed}
   loadFile(){this.onLoad?.()}
   setMenuBarVisibility(){}
   setBackgroundColor(){}
   on(name,fn){if(name==='closed')this.onClosed=fn}
   getBounds(){return {...this.bounds}}
   setPosition(x,y){this.bounds.x=x;this.bounds.y=y}
   setBounds(v){this.bounds={...v}}
   setSize(w,h){this.bounds.width=w;this.bounds.height=h}
   setAlwaysOnTop(){}
   setIgnoreMouseEvents(){}
   hide(){}
   show(){}
   showInactive(){}
   close(){this.closed=true;this.onClosed?.()}
 }
 const ctrl=createFloatingLyricsController({
  BrowserWindow:Window,Menu:{},baseDir:root,screen,
  getMainWindow:()=>null,getSettings:()=>({width:800,mouseThrough:false,alwaysOnTop:true}),
  getSavedPosition:()=>saved,
  onBoundsChanged:position=>{saved=position}
 });
 return {ctrl,get saved(){return saved},get window(){return latest},events};
}
test('drag is persisted once at mouse up; lyric toggle or lock keeps exact location',()=>{
 const c=mockController(null);
 c.ctrl.open();
 assert.deepEqual(c.window.bounds,{x:560,y:80,width:800,height:88});
 screen.cursor={x:700,y:150};
 assert.equal(c.ctrl.dragBegin(),true);
 screen.cursor={x:960,y:255};
 c.ctrl.dragMove();
 assert.deepEqual(c.ctrl.position(),{x:820,y:185});
 assert.equal(c.saved,null,'do not save every mouse movement');
 c.ctrl.dragEnd();
 assert.deepEqual(c.saved,{x:820,y:185});
 c.ctrl.lock(true);c.ctrl.lock(false);
 c.ctrl.applySettings({width:800,mouseThrough:false,alwaysOnTop:true});
 assert.deepEqual(c.ctrl.position(),{x:820,y:185});
 c.ctrl.close();
 c.ctrl.open();
 assert.deepEqual(c.ctrl.position(),{x:820,y:185},'reopening caption must not reset saved position');
 c.ctrl.close();
});
test('explicit reset alone clears remembered position and relocates current window',()=>{
 const c=mockController({x:-900,y:180});
 c.ctrl.open();
 assert.deepEqual(c.ctrl.position(),{x:-900,y:180});
 c.ctrl.lock(true);
 const result=c.ctrl.resetPosition();
 assert.equal(result.reset,true);
 assert.equal(c.saved,null);
 assert.deepEqual(c.ctrl.position(),{x:560,y:80});
 c.ctrl.close();c.ctrl.open();
 assert.deepEqual(c.ctrl.position(),{x:560,y:80});
});
test('reset while hidden stores the default preference without enabling desktop lyrics',()=>{
 const c=mockController({x:115,y:80});
 const r=c.ctrl.resetPosition();
 assert.equal(r.reset,true);
 assert.equal(c.saved,null);
 assert.equal(c.ctrl.exists(),false);
});
test('reset button only exists in settings, is connected to dedicated IPC, and is separate from style reset',()=>{
 const html=read('app/index.html'),ui=read('app/renderer.js'),pre=read('preload.js'),main=read('main.js');
 assert.match(html,/id="lyr-reset-position"/);
 assert.match(ui,/bridge\.resetFloatingLyricsPosition\(\)/);
 assert.match(pre,/resetFloatingLyricsPosition:\(\)=>ipcRenderer\.invoke\('lyrics:reset-position'\)/);
 assert.match(main,/ipcMain\.handle\('lyrics:reset-position',\(\)=>floatingLyrics\.resetPosition\(\)\)/);
 assert.match(main,/floatingLyricsPosition:config\(\)\.floatingLyricsPosition/);
 const toggle=ui.split('async function toggleDesktopLyrics(next)')[1].split('function renderSettings()')[0];
 assert.doesNotMatch(toggle,/resetFloatingLyricsPosition|lyr-reset-position/);
 const appearance=ui.split("$('#lyr-reset').addEventListener")[1].split("$('#lyr-test')")[0];
 assert.doesNotMatch(appearance,/resetFloatingLyricsPosition|lyr-reset-position/);
});
