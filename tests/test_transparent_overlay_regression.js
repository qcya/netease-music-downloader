'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createFloatingLyricsController}=require('../floating_window.js');
const root=path.resolve(__dirname,'..');
test('Electron runtime includes upstream Windows frameless transparent-titlebar fix',()=>{
  const pkg=require('../package.json');
  const [major,minor,patch]=pkg.devDependencies.electron.split('.').map(Number);
  assert.equal(major,37,'Keep the targeted Electron major until compatibility is re-evaluated');
  assert.ok(minor>3||(minor===3&&patch>=1),
    'Electron 37.2.0 has the Windows titlebar-on-blur bug electron/electron#46882; use 37.3.1 or newer');
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/windows-build.yml'),'utf8');
  assert.match(workflow,/Smoke-test installed portable executable and main-window exit/);
});
test('desktop overlay disables native titlebar, resizability and maximize controls on Windows',()=>{
 let created,shown=0,hidden=0;
 class Window{
  constructor(opts){this.options=opts;this.dead=false;created=this;this.webContents={
   id:5,once:(_event,cb)=>{this.loaded=cb},send(){},setWindowOpenHandler(){},on(){}
  }}
  isDestroyed(){return this.dead}
  loadFile(){this.loaded?.()}
  setMenuBarVisibility(){}
  setBackgroundColor(){}
  setIgnoreMouseEvents(){}
  on(){}
  showInactive(){shown++}
  show(){shown++}
  hide(){hidden++}
  close(){this.dead=true}
 }
 const ctrl=createFloatingLyricsController({BrowserWindow:Window,Menu:{},
  baseDir:root,getMainWindow:()=>null,getSettings:()=>({width:800,alwaysOnTop:true,mouseThrough:false})});
 ctrl.open();
 assert.equal(created.options.frame,false);
 assert.equal(created.options.transparent,true);
 assert.equal(created.options.resizable,false);
 assert.equal(created.options.maximizable,false);
 assert.equal(created.options.minimizable,false);
 assert.equal(created.options.fullscreenable,false);
 assert.equal(created.options.title,'');
 assert.equal(created.options.backgroundColor,'#00000000');
 assert.notEqual(created.options.titleBarOverlay,true);
 assert.equal(shown,0);
 ctrl.update({line:'透明悬浮歌词',translation:'transparent lyrics'});
 ctrl.setMainFocused(false);
 assert.ok(shown>0);
 ctrl.setMainFocused(true);
 assert.ok(hidden>0);
});
