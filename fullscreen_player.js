'use strict';
const path=require('node:path');
// The panel owns audio for its entire lifetime. This window only displays state.
function createFullscreenPlayer({BrowserWindow,screen,baseDir,getMainWindow,suspendPanel=()=>{},onHidden=()=>{},restorePanel}){
 let window=null,lastState=null,shuttingDown=false;
 const alive=w=>w&&!w.isDestroyed();
 function notify(active){if(!active)onHidden();if(alive(window))window.webContents.send('fullscreen:visibility',active);const main=getMainWindow();if(alive(main))main.webContents.send('fullscreen:active',active);}
 function update(state){lastState=state;if(alive(window))window.webContents.send('fullscreen:state',state);}
 function open(state){
  lastState=state;
  if(alive(window)){update(state);window.show();window.focus();return;}
  const main=getMainWindow();if(!alive(main))return;
  const bounds=screen.getDisplayMatching(main.getBounds()).bounds;
  const view=new BrowserWindow({...bounds,frame:false,fullscreen:true,show:false,backgroundColor:'#000000',
   title:'青春沿岸の音乐播放器 · 全屏歌词',icon:path.join(baseDir,'assets/app.ico'),autoHideMenuBar:true,
   webPreferences:{preload:path.join(baseDir,'fullscreen-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window=view;
  view.on('minimize',()=>notify(false));view.on('restore',()=>notify(true));
  view.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  view.webContents.on('will-navigate',event=>event.preventDefault());
  view.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='Escape'){event.preventDefault();view.close();}});
  let shown=false;const show=()=>{if(shown||!alive(view))return;shown=true;suspendPanel();main.hide();view.show();view.focus();notify(true);};
  view.webContents.once('did-finish-load',()=>{if(alive(view)){view.webContents.send('fullscreen:state',lastState);show();}});
  view.once('ready-to-show',show);
  view.once('closed',()=>{if(window===view)window=null;notify(false);if(!shuttingDown&&alive(main))restorePanel();});
  view.loadFile(path.join(baseDir,'app/fullscreen.html')).catch(()=>{if(alive(view))view.destroy();});
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
 function toggle(){if(!alive(window))return false;if(window.isVisible()&&!window.isMinimized())window.minimize();else{if(window.isMinimized())window.restore();window.show();window.focus();}return true;}
 return {open,update,control,close,owns,toggle,isOpen:()=>alive(window)};
}
module.exports={createFullscreenPlayer};
