'use strict';
// DWM rounds the composed glass and content together. Do not set a GDI region.
let api;
function windowsApi(){
 if(api)return api;
 const k=require('koffi'),u=k.load('user32.dll'),d=k.load('dwmapi.dll');
 k.struct('PlayerCompositionData',{attribute:'int',data:'void *',size:'size_t'});
 api={accent:u.func('int __stdcall SetWindowCompositionAttribute(uintptr_t,PlayerCompositionData *)'),attribute:d.func('int __stdcall DwmSetWindowAttribute(uintptr_t,int,void *,int)'),extend:d.func('int __stdcall DwmExtendFrameIntoClientArea(uintptr_t,void *)'),getStyle:u.func('int32 __stdcall GetWindowLongW(uintptr_t,int)'),setStyle:u.func('int32 __stdcall SetWindowLongW(uintptr_t,int,int32)'),position:u.func('int __stdcall SetWindowPos(uintptr_t,uintptr_t,int,int,int,int,uint32)')};
 return api;
}
function applyGlass(window,{enabled=true,blur=true}={}){
 if(process.platform!=='win32'||!window.getNativeWindowHandle)return false;
 const a=windowsApi(),handle=window.getNativeWindowHandle(),hwnd=handle.length===8?handle.readBigUInt64LE():handle.readUInt32LE();
 if(enabled){
  const style=a.getStyle(hwnd,-16),required=0x00c40000;
  // Electron's resizable:false removes WS_THICKFRAME. Restore the non-client
  // styles DWM needs; Electron's frameless handler still suppresses the titlebar.
  const changed=(style&required)!==required;
  if(changed)a.setStyle(hwnd,-16,style|required);
  // Do not include SWP_SHOWWINDOW: configuring a not-yet-loaded glass host
  // must not make it visible or resurrect it after the user has hidden it.
  a.position(hwnd,0,0,0,0,0,changed?0x37:0x17);
 }
 // Chromium's translucent HWND extends its non-client frame into the whole
 // client. Restoring frame styles for DWM rounding otherwise reintroduces the
 // system's colorized glass (a white wash even with ACCENT_DISABLED). Keep that
 // material out of the client; blur below is a separate, untinted effect.
 const ncPolicy=Buffer.alloc(4);ncPolicy.writeInt32LE(1); // DWMNCRP_DISABLED
 if(a.attribute(hwnd,2,ncPolicy,4)<0)throw Error('Unable to disable client frame tint');
 if(a.extend(hwnd,Buffer.alloc(16))<0)throw Error('Unable to clear client frame extension');
 const backdrop=Buffer.alloc(4);backdrop.writeInt32LE(1); // DWMSBT_NONE
 a.attribute(hwnd,38,backdrop,4);
 const policy=Buffer.alloc(16);policy.writeInt32LE(enabled&&blur?3:0,0);
 if(!a.accent(hwnd,{attribute:19,data:policy,size:16}))throw Error('Windows blur could not be applied');
 const corner=Buffer.alloc(4);corner.writeInt32LE(2);
 const result=a.attribute(hwnd,33,corner,4);
 if(result<0)throw Error('Windows compositor rounding unavailable: '+result);
 const border=Buffer.alloc(4);border.writeUInt32LE(0xfffffffe);
 a.attribute(hwnd,34,border,4);
 return true;
}
module.exports={applyGlass};
