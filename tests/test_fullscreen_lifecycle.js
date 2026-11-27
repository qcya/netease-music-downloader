'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createFullscreenPlayer}=require('../fullscreen_player');
test('full-screen suspends the panel blur as well as its foreground, and right Shift hides and restores the active view',()=>{
 let view,paused=0,restored=0;const events=[];
 class Window extends EventEmitter{constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};this.dead=false;this.visible=false;view=this;}isDestroyed(){return this.dead}loadFile(){return Promise.resolve()}show(){this.visible=true}hide(){this.visible=false}setSkipTaskbar(value){this.skipTaskbar=value}focus(){}isVisible(){return this.visible}isMinimized(){return !!this.minimized}minimize(){this.minimized=true;this.visible=false}restore(){this.minimized=false}close(){this.dead=true;this.emit('closed')}destroy(){this.close()}}
 const main={isDestroyed:()=>false,getBounds:()=>({x:0,y:0,width:900,height:600}),hide:()=>events.push('main-hidden'),webContents:{send:()=>{}}};
 const controller=createFullscreenPlayer({BrowserWindow:Window,screen:{getDisplayMatching:()=>({bounds:{x:0,y:0,width:1920,height:1080}})},baseDir:'.',getMainWindow:()=>main,suspendPanel:()=>{paused++;events.push('all-panel-surfaces-suspended')},restorePanel:()=>restored++});
 controller.open({});view.webContents.emit('did-finish-load');assert.equal(paused,1);assert.notEqual(view.options.alwaysOnTop,true);assert.equal(controller.toggle(),true);assert.equal(view.visible,false);assert.equal(view.skipTaskbar,true);assert.equal(controller.toggle(),true);assert.equal(view.visible,true);assert.equal(view.skipTaskbar,false);view.close();assert.equal(restored,1);assert.equal(controller.toggle(),false);controller.close();
});
