'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('charmBridge',Object.freeze({
 action:message=>ipcRenderer.send('panel:action',message),
 onPull:cb=>ipcRenderer.on('charm:pull',(_e,value)=>cb(value))
}));
