'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createMiniPlayerController}=require('../mini_player');
test('controller construction does not touch Electron screen before ready',()=>{
 const screen=new Proxy({},{get(){throw Error('screen before ready');}});
 assert.doesNotThrow(()=>createMiniPlayerController({BrowserWindow:class {},baseDir:__dirname,getMainWindow:()=>null,screen}));
});
class Window extends EventEmitter{
 constructor(options){super();this.options=options;this.bounds={x:0,y:0,width:options.width,height:options.height};this.webContents=new EventEmitter();this.webContents.id=10;this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};Window.last=this;}
 isDestroyed(){return false;}loadFile(){}show(){}showInactive(){}setBounds(b){this.bounds=b;}getBounds(){return this.bounds;}close(){this.emit('closed');}
}
test('drawer is bounded to work area and only accepts controls from its own renderer',()=>{
 const screen=new EventEmitter();screen.getPrimaryDisplay=()=>({workArea:{x:-1280,y:0,width:1280,height:720}});screen.getDisplayMatching=screen.getPrimaryDisplay;
 const commands=[],main={isDestroyed:()=>false,webContents:{send:(...a)=>commands.push(a)}};
 const c=createMiniPlayerController({BrowserWindow:Window,screen,baseDir:__dirname,getMainWindow:()=>main});c.open();
 assert.equal(typeof c.expand,'function');assert.equal(Window.last.options.transparent,true);
 assert.equal(Window.last.bounds.x+Window.last.bounds.width,0);
 c.expand(true);assert.ok(Window.last.bounds.height<=720);assert.equal(Window.last.bounds.x+Window.last.bounds.width,0);
 assert.equal(c.control({id:123},{type:'seek',value:20}),false);
 assert.equal(c.control({id:10},{type:'volume',value:2}),false);
 assert.equal(c.control({id:10},{type:'volume',value:0.5}),true);assert.equal(commands.at(-1)[1].value,0.5);
 c.expand(false);assert.ok(Window.last.bounds.width<=48);c.close();
});
test('main close can hide for continued playback while quit still tears children down',()=>{
 const {wireMainWindow}=require('../app_lifecycle');const w=new EventEmitter();w.webContents=new EventEmitter();w.isDestroyed=()=>false;w.show=()=>{};let hidden=0,closed=0,quitting=false;w.hide=()=>hidden++;
 wireMainWindow({window:w,app:{quit(){}},shouldHide:()=>!quitting,onHide:()=>{},closeChildren:()=>closed++});w.emit('ready-to-show');
 let prevented=0;w.emit('close',{preventDefault:()=>prevented++});assert.equal(prevented,1);assert.equal(hidden,1);assert.equal(closed,0);
 quitting=true;w.emit('close',{preventDefault(){}});assert.equal(closed,1);
});
test('drawer library uses the same custom order and category membership as the main library',()=>{
 const {libraryFiles}=require('../app/playlist_queue');assert.equal(typeof libraryFiles,'function');
 const files=[{name:'A'},{name:'B'},{name:'C'}],lists=[{tracks:['A','B','C']}],meta={order:['C','A','B'],assignments:{C:'rock',A:'rock'}};
 assert.deepEqual(libraryFiles(files,lists,meta,'rock').map(f=>f.name),['C','A']);
 assert.deepEqual(libraryFiles(files,lists,meta,'default').map(f=>f.name),['B']);
});
