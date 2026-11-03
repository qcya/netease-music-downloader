'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('top panel geometry anchors to monitor top and clamps user-selected height',()=>{
 const file=path.join(__dirname,'../top_panel.js');assert.ok(fs.existsSync(file),'top panel controller required');
 const {panelBounds}=require(file),area={x:-1920,y:0,width:1920,height:1040};
 assert.deepEqual(panelBounds(area,{width:420,height:750,right:28}),{x:-448,y:0,width:420,height:750});
 assert.equal(panelBounds(area,{height:9999}).height,1016);
 assert.equal(panelBounds(area,{height:-20}).height,420);
 assert.ok(panelBounds({x:0,y:40,width:320,height:400},{height:900}).height<=376);
});

test('cord pull, cancellation, resize, monitor movement and sender boundaries',()=>{
 const {createTopPanel}=require('../top_panel');let charm,saved;
 class Window{
  constructor(){this.visible=false;this.bounds={x:0,y:0,width:420,height:740};this.webContents={once:(_e,f)=>this.loaded=f,on(){},send(){},setWindowOpenHandler(){}};charm=this;}
  isDestroyed(){return !!this.dead} setBounds(b){this.bounds=b} getBounds(){return this.bounds} isVisible(){return this.visible} show(){this.visible=true} showInactive(){this.visible=true} hide(){this.visible=false} focus(){} loadFile(){this.loaded?.()} destroy(){this.dead=true}
 }
 const panel=new Window(),primary={id:1,workArea:{x:0,y:0,width:1920,height:1040}},second={id:2,workArea:{x:-1280,y:0,width:1280,height:1000}};
 const screen={getAllDisplays:()=>[primary,second],getPrimaryDisplay:()=>primary,getDisplayNearestPoint:p=>p.x<0?second:primary,getCursorScreenPoint:()=>({x:1680,y:100}),on(){},removeListener(){}};
 const ctrl=createTopPanel({BrowserWindow:Window,screen,baseDir:'.',getWindow:()=>panel,save:p=>saved=p});ctrl.init();const send=(w,m)=>ctrl.action(w.webContents,m);
 assert.equal(charm.visible,true);assert.equal(panel.visible,false);assert.equal(ctrl.action({}, {type:'expand'}),false);
 assert.equal(send(charm,{type:'begin',kind:'resize'}),false);
 send(charm,{type:'begin',kind:'pull',x:1680,y:100});send(charm,{type:'move',x:1680,y:300});assert.equal(panel.bounds.y,0);assert.equal(panel.bounds.height,320);
 send(charm,{type:'cancel'});assert.equal(panel.visible,false);assert.equal(charm.visible,true);
 ctrl.unfold(false);send(panel,{type:'begin',kind:'resize',x:1700,y:730});send(panel,{type:'move',x:1700,y:530});send(panel,{type:'end'});assert.equal(panel.bounds.height,540);assert.equal(saved.height,540);
 send(panel,{type:'begin',kind:'resize',x:1700,y:530});send(panel,{type:'move',x:1700,y:10000});assert.equal(panel.bounds.height,1016);send(panel,{type:'cancel'});assert.equal(panel.bounds.height,540);
 send(panel,{type:'begin',kind:'move',x:1500,y:20});send(panel,{type:'move',x:-600,y:20});send(panel,{type:'end'});assert.equal(saved.displayId,2);assert.ok(panel.bounds.x>=-1280&&panel.bounds.x+420<=0);
 ctrl.collapse();assert.equal(panel.visible,false);assert.equal(charm.visible,true);ctrl.close();assert.equal(charm.dead,true);
});
