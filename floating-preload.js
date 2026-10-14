'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('floatingBridge',Object.freeze({
  close:()=>ipcRenderer.invoke('lyrics:close'),
  lock:locked=>ipcRenderer.invoke('lyrics:lock',!!locked),
  onText:callback=>ipcRenderer.on('lyrics:text',(_e,data)=>callback(data)),
  onLocked:callback=>ipcRenderer.on('lyrics:locked',(_e,val)=>callback(val))
}));
