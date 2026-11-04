'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('top panel geometry anchors to monitor top and clamps user-selected height',()=>{
 const file=path.join(__dirname,'../top_panel.js');assert.ok(fs.existsSync(file),'top panel controller required');
 const {panelBounds}=require(file),area={x:-1920,y:0,width:1920,height:1040};
 assert.deepEqual(panelBounds(area,{width:420,height:750,right:28}),{x:-448,y:0,width:420,height:750});
 assert.equal(panelBounds(area,{height:9999}).height,1016);
 assert.equal(panelBounds(area,{height:-20}).height,420);
 assert.ok(panelBounds({x:0,y:40,width:320,height:400},{height:900}).height<=376);
 assert.equal(panelBounds(area,{anchorX:400}).x,-1730,'panel follows saved pendant center, not default right');
});

test('cord pull, cancellation, resize, monitor movement and sender boundaries',()=>{
 const {createTopPanel}=require('../top_panel');let charm,saved;
 class Window{
  constructor(){this.visible=false;this.messages=[];this.bounds={x:0,y:0,width:420,height:740};this.webContents={once:(_e,f)=>this.loaded=f,on(){},send:(channel,data)=>this.messages.push({channel,data}),setWindowOpenHandler(){}};charm=this;}
  isDestroyed(){return !!this.dead} setBounds(b){this.bounds=b} getBounds(){return this.bounds} isVisible(){return this.visible} show(){this.visible=true} showInactive(){this.visible=true} hide(){this.visible=false} focus(){} loadFile(){this.loaded?.()} destroy(){this.dead=true}
 }
 const panel=new Window(),primary={id:1,workArea:{x:0,y:0,width:1920,height:1040}},second={id:2,workArea:{x:-1280,y:0,width:1280,height:1000}};
 const screen={getAllDisplays:()=>[primary,second],getPrimaryDisplay:()=>primary,getDisplayNearestPoint:p=>p.x<0?second:primary,getCursorScreenPoint:()=>({x:1680,y:100}),on(){},removeListener(){}};
 const ctrl=createTopPanel({BrowserWindow:Window,screen,baseDir:'.',getWindow:()=>panel,save:p=>saved=p});ctrl.init();const send=(w,m)=>ctrl.action(w.webContents,m);
 assert.equal(charm.visible,true);assert.equal(panel.visible,false);assert.equal(ctrl.action({}, {type:'expand'}),false);
 const before=charm.bounds.x;
 send(charm,{type:'begin',kind:'pull',x:1680,y:100});send(charm,{type:'move',x:1480,y:104});send(charm,{type:'end'});
 assert.equal(charm.bounds.x,before-200,'collapsed pendant moves horizontally');assert.equal(panel.visible,false,'sideways drag must not expand');assert.equal(saved.right,228);
 send(charm,{type:'begin',kind:'pull',x:1480,y:100});send(charm,{type:'move',x:1680,y:104});send(charm,{type:'end'});
 assert.equal(send(charm,{type:'begin',kind:'resize'}),false);
 const center=charm.bounds.x+38;
 send(charm,{type:'begin',kind:'pull',x:center,y:100});send(charm,{type:'move',x:1915,y:100});send(charm,{type:'cancel'});
 assert.equal(charm.bounds.x,1844,'pendant can reach right edge independent of panel width');
 assert.equal(saved.anchorX,1882,'capture loss must not undo horizontal drag');
 ctrl.unfold(false);assert.equal(panel.bounds.x,1500);ctrl.collapse();assert.equal(charm.bounds.x,1844);
 send(charm,{type:'begin',kind:'pull',x:1882,y:100});send(charm,{type:'move',x:center,y:100});send(charm,{type:'end'});
 send(charm,{type:'begin',kind:'pull',x:1680,y:100});send(charm,{type:'move',x:1680,y:300});assert.equal(panel.bounds.y,0);assert.equal(panel.bounds.height,740,'pull never squeezes or reflows content');
 send(charm,{type:'move',x:1680,y:100});assert.equal(panel.messages.filter(m=>m.channel==='panel:reveal').at(-1).data.progress,0,'reverse pull must follow pointer back to fully hidden');
 send(charm,{type:'cancel'});assert.equal(panel.visible,false);assert.equal(charm.visible,true);
 ctrl.unfold(false);send(panel,{type:'begin',kind:'resize',x:1700,y:730});send(panel,{type:'move',x:1700,y:530});send(panel,{type:'end'});assert.equal(panel.bounds.height,540);assert.equal(saved.height,540);
 send(panel,{type:'begin',kind:'resize',x:1700,y:530});send(panel,{type:'move',x:1700,y:10000});assert.equal(panel.bounds.height,1016);send(panel,{type:'cancel'});assert.equal(panel.bounds.height,540);
 send(panel,{type:'begin',kind:'move',x:1500,y:20});send(panel,{type:'move',x:-600,y:20});send(panel,{type:'end'});assert.equal(saved.displayId,2);assert.ok(panel.bounds.x>=-1280&&panel.bounds.x+420<=0);
 ctrl.collapse();assert.equal(panel.visible,false);assert.equal(charm.visible,true);
 let cursor={x:charm.bounds.x+38,y:105};screen.getCursorScreenPoint=()=>cursor;
 const nativeX=charm.bounds.x;send(charm,{type:'begin',kind:'pull',native:true,x:9999,y:9999});cursor={x:cursor.x+25,y:105};send(charm,{type:'move',x:-9999,y:-9999});send(charm,{type:'end'});
 assert.equal(charm.bounds.x,nativeX+25,'native dragging uses stable OS cursor, never renderer coordinates');
 ctrl.close();assert.equal(charm.dead,true);
});
