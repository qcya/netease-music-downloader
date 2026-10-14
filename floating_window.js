'use strict';
const path=require('node:path');
/** Floating BrowserWindow stays isolated; only height measurement crosses IPC. */
function createFloatingLyricsController({BrowserWindow,Menu,baseDir,getMainWindow,getSettings,onBoundsChanged,screen}){
 let floating=null,locked=false,currentHeight=110,dragStart=null;
 const exists=()=>!!floating&&!floating.isDestroyed();
 const safeSettings=()=>getSettings?.()||{};
 function open(){
  if(exists()){floating.show();return {open:true};}
  const s=safeSettings();
  floating=new BrowserWindow({width:s.width||800,height:currentHeight,minWidth:420,maxWidth:1400,minHeight:88,maxHeight:560,
    frame:false,transparent:true,hasShadow:false,thickFrame:false,roundedCorners:false,alwaysOnTop:s.alwaysOnTop!==false,skipTaskbar:true,resizable:true,
    backgroundColor:'#00000000',show:false,webPreferences:{preload:path.join(baseDir,'floating-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  floating.loadFile(path.join(baseDir,'app','floating-lyrics.html'));
  floating.once('ready-to-show',()=>{if(exists()){floating.show();floating.webContents.send('lyrics:settings',safeSettings());lock(!!safeSettings().mouseThrough);}});
  floating.on('closed',()=>{dragStart=null;floating=null;const main=getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('lyrics:status',{open:false})});
  floating.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  floating.webContents.on('will-navigate',e=>e.preventDefault());
  return {open:true};
 }
 function close(){if(exists())floating.close();return {open:false}}
 function lock(value){locked=!!value;if(!exists())return {open:false};floating.setIgnoreMouseEvents(locked,{forward:true});floating.webContents.send('lyrics:locked',locked);return {open:true,locked}}
 function update(info){if(!exists()||!info||typeof info!=='object')return false;
  floating.webContents.send('lyrics:text',{title:String(info.title||'').slice(0,160),line:String(info.line||'').slice(0,500),translation:String(info.translation||'').slice(0,500)});return true;}
 function applySettings(s){if(!exists())return;
  floating.setAlwaysOnTop(s.alwaysOnTop!==false);
  const b=floating.getBounds(),work=screen?.getDisplayMatching?.(b)?.workArea;
  const width=work?Math.min(s.width,work.width-24):s.width;
  if(b.width!==width)floating.setSize(width,b.height);
  floating.webContents.send('lyrics:settings',s);
  lock(!!s.mouseThrough);
 }
 function resizeTo(height){if(!exists())return false;
  const h=Math.max(88,Math.min(560,Math.ceil(Number(height)||150)));
  const b=floating.getBounds();if(Math.abs(h-b.height)<2)return true;
  const work=screen?.getDisplayMatching?.(b)?.workArea;
  const maxH=work?Math.max(88,work.height-24):560;
  const next=Math.min(h,maxH);
  const y=work?Math.min(Math.max(b.y,work.y),work.y+work.height-next):b.y;
  floating.setBounds({...b,y,height:next});currentHeight=next;return true;
 }
 function dragBegin(){if(!exists()||locked)return false;dragStart={cursor:screen.getCursorScreenPoint(),bounds:floating.getBounds()};return true;}
 function dragMove(){if(!exists()||locked||!dragStart)return false;
   const cursor=screen.getCursorScreenPoint(),b=dragStart.bounds;
   const nextX=Math.round(b.x+cursor.x-dragStart.cursor.x),nextY=Math.round(b.y+cursor.y-dragStart.cursor.y);
   floating.setPosition(nextX,nextY,false);return true;
 }
 function dragEnd(){dragStart=null;return true;}
 function showMenu(){if(!exists()||locked)return false;
   const menu=Menu.buildFromTemplate([
     {label:'锁定位置 / 鼠标穿透',click:()=>lockAndSave(true)},
     {label:'打开歌词设置',click:()=>{const main=getMainWindow();if(main&&!main.isDestroyed()){main.show();main.focus();main.webContents.send('lyrics:open-settings');}}},
     {type:'separator'},
     {label:'关闭桌面歌词',click:()=>close()}
   ]);
   menu.popup({window:floating});return true;
 }
 let onLockChange=null;
 function setLockChange(callback){onLockChange=callback;}
 function lockAndSave(value){const result=lock(value);if(onLockChange)onLockChange(locked);return result;}
 function owns(webContents){return exists()&&webContents?.id===floating.webContents.id;}
 return {open,close,lock,lockAndSave,setLockChange,update,applySettings,resizeTo,dragBegin,dragMove,dragEnd,showMenu,exists,owns};
}
module.exports={createFloatingLyricsController};
