'use strict';
// Verifies native compositor configuration, not the visual appearance of pixels.
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),k=require('koffi'),{applyGlass}=require('../native_glass');
process.on('uncaughtException',e=>{console.error(e.stack);app.exit(1);});process.on('unhandledRejection',e=>{console.error(e.stack||e);app.exit(1);});
const u=k.load('user32.dll'),d=k.load('dwmapi.dll'),g=k.load('gdi32.dll'),get=u.func('int __stdcall GetWindowRgn(uintptr_t,void *)'),region=g.func('void * __stdcall CreateRectRgn(int,int,int,int)'),del=g.func('int __stdcall DeleteObject(void *)'),attr=d.func('int __stdcall DwmGetWindowAttribute(uintptr_t,int,void *,int)'),style=u.func('int32 __stdcall GetWindowLongW(uintptr_t,int)');
app.whenReady().then(async()=>{
 const w=new BrowserWindow({width:900,height:600,show:false,frame:false,transparent:true,resizable:false,thickFrame:true,roundedCorners:true,hasShadow:true});
 await w.loadURL('data:text/html,<body style="background:transparent">');
 const h=w.getNativeWindowHandle().readBigUInt64LE();
 for(const size of [[900,600],[1100,700]]){
  w.setSize(...size);assert.equal(w.isVisible(),false);assert.equal(applyGlass(w),true);assert.equal(w.isVisible(),false,'native material must not show a hidden window');const r=region(0,0,0,0),v=Buffer.alloc(4);
  try{assert.equal(get(h,r),0,'no GDI region may disable DWM rounding');assert.equal(attr(h,33,v,4),0);assert.equal(v.readInt32LE(),1);assert.equal(style(h,-16)&0x00c40000,0,'no extra system frame or caption');}finally{del(r);}
 }
 const host=new BrowserWindow({width:900,height:600,show:false,frame:false,transparent:true,resizable:false,focusable:false,hasShadow:false});
 await host.loadURL('data:text/html,<html style="background:transparent"></html>');
 applyGlass(host);const hostCorner=Buffer.alloc(4),hostHandle=host.getNativeWindowHandle().readBigUInt64LE();
 assert.equal(host.isVisible(),false,'glass host remains hidden until loaded');
 assert.equal(attr(hostHandle,33,hostCorner,4),0);assert.equal(hostCorner.readInt32LE(),1,'host must not add a second small arc');
 host.destroy();
 applyGlass(w,{enabled:false});w.destroy();console.log('PASS: custom alpha edge retained on resize, no system frame or GDI cutout');app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
