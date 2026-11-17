'use strict';
const {app,BrowserWindow,screen}=require('electron');
process.on('uncaughtException',e=>{console.error(e.stack);app.exit(1);});process.on('unhandledRejection',e=>{console.error(e.stack||e);app.exit(1);});
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
const root=path.join(__dirname,'..'),directory=path.join(root,'.validation','drag-'+Date.now());fs.mkdirSync(directory,{recursive:true});app.setPath('userData',directory);
app.on('window-all-closed',()=>{});
for(const key of ['show','showInactive','focus'])BrowserWindow.prototype[key]=function(){};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function oldFactory(file){const m=new Module(path.join(root,'baseline-overlay.js'),module);m.filename=path.join(root,'baseline-overlay.js');m.paths=module.paths;m._compile(fs.readFileSync(file,'utf8'),m.filename);return m.exports.createDesktopOverlay;}
app.whenReady().then(async()=>{
 const results=[];
 for(const [name,create] of [...(process.argv[2]?[['before',oldFactory(process.argv[2])]]:[]),['after',require('../desktop_overlay').createDesktopOverlay]]){
  const w=new BrowserWindow({x:-15000,y:-15000,width:760,height:500,show:false,frame:false,transparent:true,roundedCorners:false,hasShadow:false,thickFrame:false});await w.loadURL('data:text/html,<html style="background:transparent"></html>');
  let cursor={x:400,y:400},layouts=0,fullBounds=0,batches=0;const native=require('../window_stack').moveTogether,send=w.webContents.send.bind(w.webContents);w.webContents.send=(...args)=>{if(args[0]==='panel:state')layouts++;return send(...args);};
  const proxy={getCursorScreenPoint:()=>cursor,getAllDisplays:()=>screen.getAllDisplays(),getDisplayNearestPoint:p=>screen.getDisplayNearestPoint(p),getDisplayMatching:r=>screen.getDisplayMatching(r),dipToScreenPoint:p=>screen.dipToScreenPoint(p),on(){},removeListener(){}};
  const overlay=create({BrowserWindow,screen:proxy,getWindow:()=>w,ensureWindow(){},getSaved:()=>({layoutVersion:3,x:80,y:80,width:760,height:500}),moveWindows:(...args)=>{const result=native(...args);if(result)batches++;return result;}});
  overlay.init();overlay.unfold();await sleep(80);const windows=BrowserWindow.getAllWindows();for(const win of windows){assert.equal(win.isVisible(),false);const set=win.setBounds.bind(win);win.setBounds=(...args)=>{fullBounds++;return set(...args);};}
  overlay.action(w.webContents,{type:'begin',kind:'move',native:true});const layoutBefore=layouts;
  const start=performance.now();for(let i=1;i<=240;i++){cursor={x:400+i,y:400+Math.round(i*.3)};overlay.action(w.webContents,{type:'move'});}const elapsed=performance.now()-start;overlay.action(w.webContents,{type:'end'});
  const glass=BrowserWindow.getAllWindows().find(win=>win!==w);assert.deepEqual(glass.getBounds(),w.getBounds(),'foreground and backdrop must stay aligned');assert.ok(BrowserWindow.getAllWindows().every(win=>!win.isVisible()&&!win.isAlwaysOnTop()));
  results.push({name,moves:240,milliseconds:Math.round(elapsed*100)/100,layoutMessages:layouts-layoutBefore,fullBounds,batches});
  if(name==='after'){assert.equal(layouts-layoutBefore,0);assert.equal(fullBounds,0);assert.equal(batches,240,'must use the real native batch, not a silent fallback');}
  overlay.close();w.destroy();await sleep(60);
 }
 console.log(JSON.stringify({ok:true,results,scope:'Hidden native call cost; not a visible refresh-rate or mixed-DPI acceptance test'}));fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(results,null,2));app.quit();
}).catch(e=>{console.error(e.stack);app.exit(1);});
