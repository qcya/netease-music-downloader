'use strict';
// Entirely offscreen, never focused or topmost. Tests native client material,
// not personal desktop pixels, accounts or music. No input is generated.
const {app,BrowserWindow}=require('electron'),path=require('node:path'),assert=require('node:assert/strict'),fs=require('node:fs'),k=require('koffi');
const dir=path.join(__dirname,'../.validation/neutral-native-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
const d=k.load('dwmapi.dll'),u=k.load('user32.dll'),get=d.func('int __stdcall DwmGetWindowAttribute(uintptr_t,int,void *,int)'),style=u.func('int32 __stdcall GetWindowLongW(uintptr_t,int)'),send=u.func('intptr_t __stdcall SendMessageW(uintptr_t,uint32,uintptr_t,intptr_t)'),{applyGlass}=require('../native_glass');
app.whenReady().then(async()=>{
 const w=new BrowserWindow({x:-30000,y:-30000,width:220,height:180,show:false,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,focusable:false,skipTaskbar:true});
 await w.loadURL('data:text/html,<html style="background:transparent"><body style="margin:0;background:transparent;color:white">Unchanged foreground</body></html>');
 for(const blur of [false,true]){
  applyGlass(w,{enabled:true,blur});const h=w.getNativeWindowHandle().readBigUInt64LE(),value=Buffer.alloc(4);assert.equal(get(h,1,value,4),0);assert.equal(value.readInt32LE(),0,'DWM non-client material must not tint the transparent client');
  assert.equal(get(h,33,value,4),0);assert.equal(value.readInt32LE(),2,'preserve compositor round preference');
 }
 w.setSize(260,200);applyGlass(w,{enabled:true,blur:false});const value=Buffer.alloc(4);assert.equal(get(w.getNativeWindowHandle().readBigUInt64LE(),1,value,4),0);assert.equal(value.readInt32LE(),0);
 const image=await w.webContents.capturePage();const pixel=image.toBitmap(),offset=(100*image.getSize().width+100)*4;assert.equal(pixel[offset+3],0,'foreground empty area must have zero alpha');
 const hwnd=w.getNativeWindowHandle().readBigUInt64LE();assert.equal(style(hwnd,-20)&0x20,0,'foreground must not be mouse-through');assert.equal(style(hwnd,-20)&0x80000,0,'do not use alpha-based layered hit testing for the foreground');assert.equal(w.getOpacity(),1,'do not fade foreground controls');
 const bounds=w.getBounds(),point=((bounds.x+100)&65535)|(((bounds.y+100)&65535)<<16);assert.equal(Number(send(hwnd,0x84,0,point)),1,'zero-alpha center still has a native HTCLIENT hit target');
 w.destroy();console.log(JSON.stringify({ok:true,checks:['no native non-client tint','round preference preserved','resize retains neutral client','zero-alpha client content','opaque foreground controls','transparent area receives mouse hit'],offscreen:true}));app.quit();
}).catch(error=>{console.error(error.stack);app.exit(1)});
