'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('floatingBridge',Object.freeze({
  close:()=>ipcRenderer.invoke('lyrics:close'),
  lock:locked=>ipcRenderer.invoke('lyrics:lock',!!locked),
  resize:height=>ipcRenderer.invoke('lyrics:resize',height),
  dragBegin:()=>ipcRenderer.send('lyrics:drag-begin'),
  dragMove:()=>ipcRenderer.send('lyrics:drag-move'),
  dragEnd:()=>ipcRenderer.send('lyrics:drag-end'),
  showMenu:()=>ipcRenderer.send('lyrics:context-menu'),
  getSettings:()=>ipcRenderer.invoke('lyrics:preferences'),
  onText:callback=>ipcRenderer.on('lyrics:text',(_e,data)=>callback(data)),
  onLocked:callback=>ipcRenderer.on('lyrics:locked',(_e,val)=>callback(val)),
  onSettings:callback=>ipcRenderer.on('lyrics:settings',(_e,val)=>callback(val))
}));
