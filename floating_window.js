'use strict';
const path=require('node:path');
/** Isolated floating lyrics BrowserWindow: no Node integration or untrusted navigation. */
function createFloatingLyricsController({BrowserWindow,baseDir,getMainWindow}){
  let floating=null;
  function exists(){return !!floating&&!floating.isDestroyed()}
  function open(){
    if(exists()){floating.show();return {open:true};}
    floating=new BrowserWindow({width:710,height:150,minWidth:400,minHeight:98,frame:false,
      transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:true,backgroundColor:'#00000000',show:false,
      webPreferences:{preload:path.join(baseDir,'floating-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    floating.loadFile(path.join(baseDir,'app','floating-lyrics.html'));
    floating.once('ready-to-show',()=>{if(exists())floating.show()});
    floating.on('closed',()=>{floating=null;const main=getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('lyrics:status',{open:false})});
    floating.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    floating.webContents.on('will-navigate',e=>e.preventDefault());
    return {open:true};
  }
  function close(){if(exists())floating.close();return {open:false}}
  function lock(locked){if(!exists())return {open:false};floating.setIgnoreMouseEvents(locked,{forward:true});floating.webContents.send('lyrics:locked',locked);return {open:true,locked}}
  function update(info){if(!exists()||!info||typeof info!=='object')return false;
    floating.webContents.send('lyrics:text',{title:String(info.title||'').slice(0,160),line:String(info.line||'').slice(0,500),translation:String(info.translation||'').slice(0,400)});return true;}
  return {open,close,lock,update,exists};
}
module.exports={createFloatingLyricsController};
