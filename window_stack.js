'use strict';
// Keep the non-activating blur host directly behind its ordinary player HWND.
// Neither window receives HWND_TOPMOST; other applications can cover both.
let position,batch;
function placeBehind(window,front){
 if(process.platform!=='win32'||!window?.getNativeWindowHandle||!front?.getNativeWindowHandle)return false;
 if(!position)position=require('koffi').load('user32.dll').func('int __stdcall SetWindowPos(uintptr_t,uintptr_t,int,int,int,int,uint32_t)');
 const handle=w=>{const b=w.getNativeWindowHandle();return b.length===8?b.readBigUInt64LE():b.readUInt32LE();};
 return position(handle(window),handle(front),0,0,0,0,0x0013|0x0200|0x0400);
}
function moveTogether(front,back,point,screen){
 if(process.platform!=='win32'||!front?.getNativeWindowHandle||!back?.getNativeWindowHandle||!screen.dipToScreenPoint)return false;
 try{
  if(!batch){const u=require('koffi').load('user32.dll');batch={begin:u.func('uintptr_t __stdcall BeginDeferWindowPos(int)'),defer:u.func('uintptr_t __stdcall DeferWindowPos(uintptr_t,uintptr_t,uintptr_t,int,int,int,int,uint32_t)'),end:u.func('int __stdcall EndDeferWindowPos(uintptr_t)')};}
  const handle=w=>{const b=w.getNativeWindowHandle();return b.length===8?b.readBigUInt64LE():b.readUInt32LE();},p=screen.dipToScreenPoint(point);
  let update=batch.begin(2);if(!update)return false;
  // Move both surfaces in one transaction: no resize, focus or Z-order churn.
  for(const w of [front,back]){update=batch.defer(update,handle(w),0,p.x,p.y,0,0,0x215);if(!update)return false;}
  return !!batch.end(update);
 }catch{return false;}
}
module.exports={placeBehind,moveTogether};
