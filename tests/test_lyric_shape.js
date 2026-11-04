'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {sanitizeLyricShape,createFloatingLyricsController}=require('../floating_window');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('long lyric lines shrink to fit; short lines keep their chosen size',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/floating-lyrics.js'),'utf8');
 const start=source.indexOf('function fitLyricSize('),end=source.indexOf('\nfunction fitLine(',start);assert.ok(start>=0&&end>start);
 const fit=vm.runInNewContext('('+source.slice(start,end)+')');
 assert.equal(fit(30,200,400),30);assert.ok(fit(30,800,400)<15);assert.ok(fit(18,1200,400)<6);assert.ok(fit(30,15000,390)<1);assert.equal(fit(30,0,400),30);
});
test('lyric hit regions are bounded, integer and never reset to a full rectangle',()=>{
 assert.deepEqual(sanitizeLyricShape([{x:-4,y:5,width:20,height:15},{x:90,y:90,width:20,height:20}],100,100),[{x:0,y:5,width:16,height:15},{x:90,y:90,width:10,height:10}]);
 assert.deepEqual(sanitizeLyricShape([],800,88),[{x:0,y:0,width:1,height:1}]);
 assert.deepEqual(sanitizeLyricShape([{x:NaN,y:0,width:2,height:2},{x:1000,y:1,width:5,height:5}],800,88),[{x:0,y:0,width:1,height:1}]);
 assert.equal(sanitizeLyricShape(Array(200).fill({x:1,y:1,width:2,height:2}),800,88).length,64);
});
test('while dragging old and new lyric shapes coexist until pointer release',()=>{
 if(process.platform!=='win32')return;
 let win;class Window{constructor(o){win=this;this.bounds={x:0,y:0,width:o.width,height:o.height};this.webContents={id:5,once:(_e,cb)=>{this.ready=cb},send(){},on(){},setWindowOpenHandler(){}};}isDestroyed(){return false}loadFile(){this.ready()}on(){}setMenuBarVisibility(){}setBackgroundColor(){}setIgnoreMouseEvents(){}getBounds(){return {...this.bounds}}setShape(s){this.shape=s}isVisible(){return false}hide(){}}
 const ctrl=createFloatingLyricsController({BrowserWindow:Window,Menu:{},baseDir:'.',getMainWindow:()=>null,getSettings:()=>({width:800}),screen:{getCursorScreenPoint:()=>({x:100,y:100})}});
 ctrl.open();const old=[{x:100,y:5,width:80,height:60}],next=[{x:200,y:10,width:90,height:60}];
 ctrl.setLyricShape(old);assert.deepEqual(win.shape,old);ctrl.dragBegin();ctrl.setLyricShape(next);assert.deepEqual(win.shape,[...old,...next]);ctrl.dragEnd();assert.deepEqual(win.shape,next);
});
