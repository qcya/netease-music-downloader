'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('fullscreenBridge',Object.freeze({
 control:message=>ipcRenderer.send('fullscreen:control',message),
 onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('fullscreen:state',listener);return()=>ipcRenderer.removeListener('fullscreen:state',listener);}
}));
