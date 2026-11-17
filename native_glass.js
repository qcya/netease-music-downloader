'use strict';
// Renderer and Composition clip the foreground/backdrop to one custom radius.
// Disable system chrome: its smaller arc and frame would form a second border.
// Do not set a jagged GDI window region.
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
 const alpha=Buffer.alloc(4);alpha.writeInt32LE(1);
 // Windows 11 24H2 can honor premultiplied redirection alpha independently of
 // non-client glass. Without this, disabling NC rendering below paints every
 // zero-alpha client pixel opaque black despite a transparent Chromium surface.
 const independentAlpha=a.attribute(hwnd,39,alpha,4)>=0; // DWMWA_REDIRECTIONBITMAP_ALPHA
 {
  const style=a.getStyle(hwnd,-16),caption=0x00c00000,frame=0x00040000;
  // Neither WS_THICKFRAME nor WS_CAPTION belongs to the custom alpha surface.
  // The former adds an extra outline; the latter can paint a title strip
  // during cross-monitor DPI/frame updates.
  const target=style&~(caption|frame);
  const changed=style!==target;
  if(changed)a.setStyle(hwnd,-16,target);
  // Do not include SWP_SHOWWINDOW: configuring a not-yet-loaded glass host
  // must not make it visible or resurrect it after the user has hidden it.
  a.position(hwnd,0,0,0,0,0,changed?0x37:0x17);
 }
 // Chromium's translucent HWND extends its non-client frame into the whole
 // client. Restoring frame styles for DWM rounding otherwise reintroduces the
 // system's colorized glass (a white wash even with ACCENT_DISABLED). Keep that
 // material out of the client; blur below is a separate, untinted effect.
 // Older systems lack independent bitmap alpha. Keep Chromium's original
 // frameless full-client transparency there, with no tint/blur fallback fill.
 const ncPolicy=Buffer.alloc(4);ncPolicy.writeInt32LE(independentAlpha?1:0);
 if(a.attribute(hwnd,2,ncPolicy,4)<0)throw Error('Unable to disable client frame tint');
 const margins=Buffer.alloc(16,independentAlpha?0:255);
 if(a.extend(hwnd,margins)<0)throw Error('Unable to configure transparent client frame');
 const backdrop=Buffer.alloc(4);backdrop.writeInt32LE(1); // DWMSBT_NONE
 a.attribute(hwnd,38,backdrop,4);
 // No accent material: its built-in colorization changes even flat gray.
 // The separate Windows Composition brush supplies tint-free blur instead.
 const policy=Buffer.alloc(16);
 if(!a.accent(hwnd,{attribute:19,data:policy,size:16}))throw Error('Windows blur could not be applied');
 const corner=Buffer.alloc(4);corner.writeInt32LE(1); // DWMWCP_DONOTROUND: custom alpha clips own the edge.
 const result=a.attribute(hwnd,33,corner,4);
 if(result<0&&independentAlpha)throw Error('Windows compositor rounding unavailable: '+result);
 const border=Buffer.alloc(4);border.writeUInt32LE(0xfffffffe);
 a.attribute(hwnd,34,border,4);
 return true;
}
module.exports={applyGlass};
