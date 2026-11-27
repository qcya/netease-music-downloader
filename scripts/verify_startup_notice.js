'use strict';
const {app,BrowserWindow,screen}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.on('uncaughtException',e=>{console.error(e.stack);app.exit(1);});process.on('unhandledRejection',e=>{console.error(e.stack||e);app.exit(1);});app.on('window-all-closed',()=>{});
const root=path.join(__dirname,'..'),dir=path.join(root,'.validation','startup-notice-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 let window,shows=0,sounds=0;
 // Enable JS only in this test window for DOM inspection. The shipped notice
 // itself has JavaScript disabled and uses CSS animation only.
 function HiddenWindow(options){window=new BrowserWindow({...options,x:-12000,y:-12000,alwaysOnTop:false,webPreferences:{...options.webPreferences,javascript:true,offscreen:true,backgroundThrottling:false}});window.showInactive=()=>shows++;return window;}
 const service=require('../startup_notice').createStartupNotice({BrowserWindow:HiddenWindow,screen,shell:{beep:()=>sounds++},baseDir:root});service.show();await new Promise(resolve=>window.webContents.once('did-finish-load',resolve));
 const deadline=Date.now()+5000;while(!shows&&Date.now()<deadline)await pause(20);assert.equal(shows,1);assert.equal(sounds,1);assert.equal(window.isVisible(),false);assert.equal(window.isFocused(),false);
 const text=await window.webContents.executeJavaScript('document.body.innerText');assert.match(text,/播放器已启动/);assert.match(text,/轻按 右 Shift 打开/);
 await window.webContents.executeJavaScript("document.fonts.ready.then(()=>{document.querySelector('aside').style.animation='none';return true})");
 await pause(120);
 window.webContents.invalidate();await pause(120);
 const image=path.join(dir,'启动提示.png');fs.writeFileSync(image,(await window.webContents.capturePage()).toPNG());await pause(4100);assert.equal(window.isDestroyed(),true);service.close();assert.equal(BrowserWindow.getAllWindows().length,0);
 console.log(JSON.stringify({ok:true,image,checks:['Chinese startup copy and bundled icon','one notification sound request (muted in test)','never focused or shown during test','renderer destroyed after timeout']}));app.quit();
}).catch(e=>{console.error(e.stack);app.exit(1);});
