'use strict';
// Entirely offscreen, never focused or topmost. Tests native client material,
// not personal desktop pixels, accounts or music. No input is generated.
// This checks native configuration; actual composition requires the separate
// opaque-patch / transparent-foreground comparison, not capturePage alone.
const {app,BrowserWindow,screen}=require('electron'),path=require('node:path'),assert=require('node:assert/strict'),fs=require('node:fs'),k=require('koffi');
process.on('uncaughtException',e=>{console.error(e.stack);app.exit(1);});process.on('unhandledRejection',e=>{console.error(e.stack||e);app.exit(1);});
const dir=path.join(__dirname,'../.validation/neutral-native-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
const d=k.load('dwmapi.dll'),u=k.load('user32.dll'),get=d.func('int __stdcall DwmGetWindowAttribute(uintptr_t,int,void *,int)'),style=u.func('int32 __stdcall GetWindowLongW(uintptr_t,int)'),send=u.func('intptr_t __stdcall SendMessageW(uintptr_t,uint32,uintptr_t,intptr_t)'),{applyGlass}=require('../native_glass');
app.whenReady().then(async()=>{
 const w=new BrowserWindow({x:-30000,y:-30000,width:220,height:180,show:false,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,focusable:false,skipTaskbar:true});
 await w.loadURL('data:text/html,<html style="background:transparent"><body style="margin:0;background:transparent;color:white">Unchanged foreground</body></html>');
 for(const blur of [false,true]){
  applyGlass(w,{enabled:true,blur});const h=w.getNativeWindowHandle().readBigUInt64LE(),value=Buffer.alloc(4);assert.equal(get(h,1,value,4),0);assert.equal(value.readInt32LE(),0,'DWM non-client material must not tint the transparent client');
  assert.equal(get(h,33,value,4),0);assert.equal(value.readInt32LE(),1,'disable the extra small system arc');
 }
 w.setSize(260,200);applyGlass(w,{enabled:true,blur:false});const value=Buffer.alloc(4);assert.equal(get(w.getNativeWindowHandle().readBigUInt64LE(),1,value,4),0);assert.equal(value.readInt32LE(),0);
 const image=await w.webContents.capturePage();const pixel=image.toBitmap(),offset=(100*image.getSize().width+100)*4;assert.equal(pixel[offset+3],0,'foreground empty area must have zero alpha');
 const hwnd=w.getNativeWindowHandle().readBigUInt64LE();assert.equal(style(hwnd,-20)&0x20,0,'foreground must not be mouse-through');assert.equal(style(hwnd,-20)&0x80000,0,'do not use alpha-based layered hit testing for the foreground');assert.equal(w.getOpacity(),1,'do not fade foreground controls');
 const bounds=w.getBounds(),point=((bounds.x+100)&65535)|(((bounds.y+100)&65535)<<16);assert.equal(Number(send(hwnd,0x84,0,point)),1,'zero-alpha center still has a native HTCLIENT hit target');
 const windowRect=u.func('int __stdcall GetWindowRect(uintptr_t,void *)'),clientRect=u.func('int __stdcall GetClientRect(uintptr_t,void *)'),position=u.func('int __stdcall SetWindowPos(uintptr_t,uintptr_t,int,int,int,int,uint32)'),dpiForWindow=u.func('uint32 __stdcall GetDpiForWindow(uintptr_t)'),sendPointer=u.func('intptr_t __stdcall SendMessageW(uintptr_t,uint32,uintptr_t,void *)');
 function assertNoCaption(){
  assert.equal(w.isVisible(),false,'native verification never shows a window');
  assert.equal(style(hwnd,-16)&0x00c40000,0,'system frame and caption must stay absent after DPI/frame updates');
  const outer=Buffer.alloc(16),inner=Buffer.alloc(16);windowRect(hwnd,outer);clientRect(hwnd,inner);
  assert.equal(inner.readInt32LE(8),outer.readInt32LE(8)-outer.readInt32LE(0),'no native side border in client layout');
  assert.equal(inner.readInt32LE(12),outer.readInt32LE(12)-outer.readInt32LE(4),'no native titlebar consuming client height');
 }
 const transitions=[];
 // Moving hidden test HWNDs exercises actual monitor DPI transitions without
 // putting a test window over the user's applications or moving their cursor.
 for(let cycle=0;cycle<3;cycle++)for(const display of screen.getAllDisplays()){
  w.setBounds({x:display.bounds.x+24,y:display.bounds.y+24,width:360,height:240});
  await new Promise(resolve=>setTimeout(resolve,30));
  position(hwnd,0,0,0,0,0,0x37);assertNoCaption();
  transitions.push({scale:display.scaleFactor,dpi:dpiForWindow(hwnd)});
 }
 for(const dpi of [96,120,144,192,144,96]){
  const proposed=Buffer.alloc(16);windowRect(hwnd,proposed);
  sendPointer(hwnd,0x2e0,dpi|(dpi<<16),proposed); // WM_DPICHANGED
  send(hwnd,0x31a,0,0);send(hwnd,0x320,0,0);send(hwnd,0x86,1,0);
  position(hwnd,0,0,0,0,0,0x37);assertNoCaption();
 }
 w.setBounds({x:-12000,y:-12000,width:260,height:200});
 const {attachNeutralBlur}=require('../native_blur');
 const library=k.load(path.join(__dirname,'../backend/neutral_composition.dll'));
 const count=library.func('int __stdcall PlayerBlurCount()');
 assert.equal(count(),0);
 for(let i=0;i<3;i++){
  const release=attachNeutralBlur(w,{theme:['transparent','blurred','dark'][i]});assert.equal(count(),1,'one native brush per open host');
  w.setSize(260+i*10,200+i*10);release();release();
  assert.equal(count(),0,'release is idempotent and stops the native brush');
 }
 w.destroy();console.log(JSON.stringify({ok:true,checks:['no native non-client tint','custom alpha edge has no system arc','resize retains neutral client','zero-alpha client content','opaque foreground controls','transparent area receives mouse hit','no caption/client inset after hidden monitor transitions and DPI/frame messages'],transitions,hidden:true}));app.quit();
}).catch(error=>{console.error(error.stack);app.exit(1)});
