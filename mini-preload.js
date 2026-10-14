'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('miniBridge',Object.freeze({
  control:action=>ipcRenderer.send('mini:control',action),
  close:()=>ipcRenderer.invoke('mini:close'),
  onState:cb=>{const f=(_e,data)=>cb(data);ipcRenderer.on('mini:state',f);return()=>ipcRenderer.removeListener('mini:state',f)}
}));