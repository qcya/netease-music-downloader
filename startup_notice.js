'use strict';
const path=require('node:path');
function createStartupNotice({BrowserWindow,screen,shell,baseDir=__dirname,setTimer=setTimeout,clearTimer=clearTimeout}){
 let window=null,timer=null,shown=false;
 function close(){if(timer)clearTimer(timer);timer=null;const old=window;window=null;if(old&&!old.isDestroyed())old.destroy();}
 function show(){
  if(shown)return;shown=true;
  const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,width=Math.min(408,area.width-24),height=112;
  const notice=new BrowserWindow({x:Math.round(area.x+(area.width-width)/2),y:area.y+12,width,height,show:false,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,movable:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false,backgroundThrottling:true}});
  window=notice;notice.setIgnoreMouseEvents?.(true);
  timer=setTimer(close,5000);timer.unref?.();
  notice.once('ready-to-show',()=>{
   if(window!==notice||notice.isDestroyed())return;
   notice.showInactive();try{shell.beep();}catch{}
   clearTimer(timer);timer=setTimer(close,3900);timer.unref?.();
  });
  notice.once('closed',()=>{if(window===notice){window=null;clearTimer(timer);timer=null;}});
  try{Promise.resolve(notice.loadFile(path.join(baseDir,'app/startup-notice.html'))).catch(close);}catch{close();}
 }
 return {show,close};
}
module.exports={createStartupNotice};
