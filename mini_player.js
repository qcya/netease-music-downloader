'use strict';
const path=require('node:path');
function createMiniPlayerController({BrowserWindow,baseDir,getMainWindow}){
 let mini=null,last={title:'还没有播放歌曲',artist:'',playing:false},ready=false;
 const exists=()=>!!mini&&!mini.isDestroyed();
 function open(){
   if(exists()){mini.show();return {open:true}}
   mini=new BrowserWindow({width:390,height:92,minWidth:300,maxWidth:650,minHeight:76,maxHeight:110,
     frame:false,transparent:false,backgroundColor:'#FFF4FB',alwaysOnTop:true,skipTaskbar:true,resizable:true,
     webPreferences:{preload:path.join(baseDir,'mini-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
   ready=false;
   mini.webContents.once('did-finish-load',()=>{if(!exists())return;ready=true;mini.webContents.send('mini:state',last)});
   mini.loadFile(path.join(baseDir,'app','mini-player.html'));
   mini.on('closed',()=>{mini=null;ready=false;const main=getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('mini:status',{open:false})});
   mini.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   mini.webContents.on('will-navigate',e=>e.preventDefault());
   return {open:true};
 }
 function close(){if(exists())mini.close();return {open:false}}
 function update(state){
   last={title:String(state?.title||'还没有播放歌曲').slice(0,180),
      artist:String(state?.artist||'').slice(0,140),playing:state?.playing===true};
   if(exists()&&ready)mini.webContents.send('mini:state',last);
   return true;
 }
 function control(sender,action){
   if(!exists()||sender?.id!==mini.webContents.id)return false;
   if(!['previous','toggle','next'].includes(action))return false;
   const main=getMainWindow();
   if(!main||main.isDestroyed())return false;
   main.webContents.send('mini:control',action);
   return true;
 }
 return {open,close,update,control,exists};
}
module.exports={createMiniPlayerController};