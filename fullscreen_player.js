'use strict';
const path=require('node:path');
// The panel owns audio for its entire lifetime. This window only displays state.
function createFullscreenPlayer({BrowserWindow,screen,baseDir,getMainWindow,suspendPanel=()=>{},onHidden=()=>{},restorePanel}){
 let window=null,lastState=null,shuttingDown=false,requested=false,loaded=false;
 const alive=w=>w&&!w.isDestroyed();
 function notify(active){if(!active)onHidden();if(alive(window))window.webContents.send('fullscreen:visibility',active);const main=getMainWindow();if(alive(main))main.webContents.send('fullscreen:active',active);}
 function update(state){lastState=state;if(alive(window))window.webContents.send('fullscreen:state',state);}
 function open(state){
  lastState=state;
  if(alive(window)){update(state);show();return;}
  const main=getMainWindow();if(!alive(main))return;
  const bounds=screen.getDisplayMatching(main.getBounds()).bounds;
  const view=new BrowserWindow({...bounds,frame:false,fullscreen:true,show:false,skipTaskbar:true,backgroundColor:'#000000',
   title:'青春沿岸の音乐播放器 · 全屏歌词',icon:path.join(baseDir,'assets/app.ico'),autoHideMenuBar:true,
   webPreferences:{preload:path.join(baseDir,'fullscreen-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window=view;requested=true;loaded=false;
  view.on('minimize',hide);
  view.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  view.webContents.on('will-navigate',event=>event.preventDefault());
  view.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='Escape'){event.preventDefault();view.close();}});
  view.webContents.once('did-finish-load',()=>{if(window===view&&alive(view)){loaded=true;view.webContents.send('fullscreen:state',lastState);showRequested();}});
  view.once('closed',()=>{if(window===view)window=null;notify(false);if(!shuttingDown&&alive(main))restorePanel();});
  view.loadFile(path.join(baseDir,'app/fullscreen.html')).catch(()=>{if(alive(view))view.destroy();});
 }
 function showRequested(){
  if(!alive(window)||!requested||!loaded||(window.isVisible()&&!window.isMinimized?.()))return;
  suspendPanel();
  getMainWindow()?.hide();
  window.setSkipTaskbar?.(false);
  if(window.isMinimized?.())window.restore();
  window.show();
  window.focus();
  notify(true);
 }
 function show(){if(!alive(window))return false;requested=true;showRequested();return true;}
 function hide(){
  if(!alive(window))return;
  requested=false;
  window.hide();
  window.setSkipTaskbar?.(true);
  notify(false);
 }
 function owns(sender){return alive(window)&&window.webContents===sender;}
 function control(sender,message){
  if(!owns(sender)||!message)return;
  if(message.action==='close'){window.close();return;}
  if(!['toggle','previous','next','seek','volume','retry-lyrics','mode','quality','lyrics-toggle','lyrics-lock'].includes(message.action))return;
  if(message.action==='quality'&&!['standard','higher','exhigh','lossless','hires'].includes(message.value))return;
  if(['seek','volume'].includes(message.action)&&!Number.isFinite(message.value))return;
  const main=getMainWindow();if(alive(main))main.webContents.send('fullscreen:control',{action:message.action,value:message.value});
 }
 function close(){shuttingDown=true;if(alive(window))window.destroy();}
 function toggle(){if(!alive(window))return false;if(requested)hide();else show();return true;}
 return {open,update,control,close,owns,toggle,show,isOpen:()=>alive(window)};
}
module.exports={createFullscreenPlayer};
