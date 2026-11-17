'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('fullscreenBridge',Object.freeze({
 preferences:()=>ipcRenderer.invoke('fullscreen:preferences'),
 control:message=>ipcRenderer.send('fullscreen:control',message),
 onVisibility:callback=>{const listener=(_event,visible)=>callback(visible===true);ipcRenderer.on('fullscreen:visibility',listener);return()=>ipcRenderer.removeListener('fullscreen:visibility',listener);},
 onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('fullscreen:state',listener);return()=>ipcRenderer.removeListener('fullscreen:state',listener);}
}));
