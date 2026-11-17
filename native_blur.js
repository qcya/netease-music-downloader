'use strict';
const path=require('node:path');
let api;
function attachNeutralBlur(window,{theme='transparent'}={}){
 if(process.platform!=='win32'||!window.getNativeWindowHandle)return ()=>{};
 if(!api){
  const k=require('koffi'),dll=k.load(path.join(process.resourcesPath&&require('electron').app.isPackaged?process.resourcesPath:__dirname,'backend','neutral_composition.dll'));
  api={attach:dll.func('int __stdcall PlayerBlurAttach(uintptr_t,int,int,float,float,float)'),resize:dll.func('void __stdcall PlayerBlurResize(uintptr_t)'),detach:dll.func('void __stdcall PlayerBlurDetach(uintptr_t)')};
 }
 const handle=window.getNativeWindowHandle(),hwnd=handle.length===8?handle.readBigUInt64LE():handle.readUInt32LE(),b=window.getBounds();
 // Use the lightly blurred backdrop itself, rather than mixing 75% of the
 // sharp desktop back over it. This adds no color/tint and never fades the UI.
 const result=api.attach(hwnd,b.width,b.height,require('./app/window-shape').radius,require('./player_theme').blurAmount(theme),1);
 if(result<0)throw Error('Native neutral blur unavailable: '+result);
 let disposed=false;
 const resize=()=>{if(!disposed)api.resize(hwnd);};
 const dispose=()=>{if(disposed)return;disposed=true;window.removeListener?.('resize',resize);window.removeListener?.('closed',dispose);api.detach(hwnd);};
 window.on('resize',resize);window.on('closed',dispose);
 return dispose;
}
module.exports={attachNeutralBlur};
