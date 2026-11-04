'use strict';
const path=require('node:path');
const {normalizePosition,resolvePosition}=require('./lyric_position.js');
function sanitizeLyricShape(rects,width,height){
 const out=[];if(Array.isArray(rects))for(const r of rects.slice(0,64)){
  if(!r||![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)continue;
  const x=Math.max(0,Math.floor(r.x)),y=Math.max(0,Math.floor(r.y));
  const right=Math.min(width,Math.ceil(r.x+r.width)),bottom=Math.min(height,Math.ceil(r.y+r.height));
  if(right>x&&bottom>y)out.push({x,y,width:right-x,height:bottom-y});
 }
 return out.length?out:[{x:0,y:0,width:1,height:1}];
}
/** Floating BrowserWindow stays isolated; only height measurement crosses IPC. */
function createFloatingLyricsController({BrowserWindow,Menu,baseDir,getMainWindow,getSettings,getSavedPosition,onBoundsChanged,onCloseRequest,onOpenSettings,screen}){
 let floating=null,locked=false,currentHeight=88,currentWidth=800,dragStart=null,loaded=false,lastText=null;
 let lyricShape=null,pendingShape=null,dragShape=null;
 const exists=()=>!!floating&&!floating.isDestroyed();
 const safeSettings=()=>getSettings?.()||{};
 function reconcileVisibility(){
  if(!exists())return;
  if(!loaded||!lastText?.line?.trim()){floating.hide?.();return;}
  // Do not hide just because the main player has focus. Showing repeatedly
  // can also cause Windows compositor flashes, so only show when needed.
  if(floating.isVisible?.())return;
  if(typeof floating.showInactive==='function')floating.showInactive();else floating.show();
 }
 function setMainFocused(_value){reconcileVisibility()}
 function status(){return {open:exists(),visible:exists()&&!!floating.isVisible?.(),loaded,locked,position:position()};}
 function fail(reason){
  const main=getMainWindow();if(exists())floating.close();
  if(main&&!main.isDestroyed())main.webContents.send('lyrics:status',{open:false,error:String(reason).slice(0,240)});
 }
 function open(){
  if(exists()){reconcileVisibility();return {open:true};}
  const s=safeSettings();
  const width=Math.round(Number(s.width)||800);
  currentWidth=width;
  const saved=getSavedPosition?.();
  const location=resolvePosition(saved,screen,width,currentHeight);
  floating=new BrowserWindow({...(location||{}),width,height:currentHeight,minWidth:420,maxWidth:1400,minHeight:56,maxHeight:560,
    frame:false,title:'',titleBarStyle:'hidden',autoHideMenuBar:true,transparent:true,hasShadow:false,thickFrame:false,roundedCorners:false,alwaysOnTop:s.alwaysOnTop!==false,skipTaskbar:true,resizable:false,maximizable:false,minimizable:false,fullscreenable:false, // Prevent Windows DWM from creating phantom chrome on transparent frameless overlays.
    
    backgroundColor:'#00000000',show:false,webPreferences:{preload:path.join(baseDir,'floating-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  // Chromium's ready-to-show is inconsistent for fully transparent windows.
  // Wait for the actual page to load and for real lyric text before showing.
  // The player may have already resolved lyrics before the overlay opens.
  // Retain the most recent payload so the first visible frame is current.
  loaded=false;
  floating.webContents.once('did-finish-load',()=>{
    if(!exists())return;
    loaded=true;
    floating.webContents.send('lyrics:settings',safeSettings());
    lock(!!safeSettings().mouseThrough);
    if(lastText)floating.webContents.send('lyrics:text',lastText);
    reconcileVisibility();
  });
  floating.setMenuBarVisibility?.(false);
  floating.webContents.on('did-fail-load',(_event,code,description)=>{if(code!==-3)fail('歌词页面加载失败：'+description);});
  floating.webContents.on('render-process-gone',(_event,details)=>fail('歌词页面进程退出：'+details.reason));
  const loading=floating.loadFile(path.join(baseDir,'app','floating-lyrics.html'));
  loading?.catch?.(e=>fail(e.message));
  floating.setBackgroundColor?.('#00000000');
  floating.on('closed',()=>{dragStart=null;floating=null;loaded=false;lastText=null;lyricShape=pendingShape=dragShape=null;const main=getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('lyrics:status',{open:false})});
  floating.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  floating.webContents.on('will-navigate',e=>e.preventDefault());
  return {open:true};
 }
 function position(){
   if(!exists()||typeof floating.getBounds!=='function')return null;
   const {x,y}=floating.getBounds();
   return normalizePosition({x,y});
 }
 function rememberPosition(){
   const point=position();
   if(point)onBoundsChanged?.(point);
   return point;
 }
 function close(){
   if(exists()){dragEnd();floating.close()}
   return {open:false};
 }
 function resetPosition(){
   // This is the only operation that deliberately discards saved coordinates.
   dragStart=null;
   const old=getSavedPosition?.();
   if(!exists()){
     onBoundsChanged?.(null);
     return {reset:true,previous:normalizePosition(old)};
   }
   const b=floating.getBounds();
   const target=resolvePosition(null,screen,b.width,b.height);
   if(target)floating.setPosition(target.x,target.y,false);
   onBoundsChanged?.(null);
   return {reset:true,position:target};
 }
 function lock(value){if(dragStart)dragEnd();locked=!!value;if(!exists())return {open:false};
  // A true lock must pass BOTH mouse buttons to the underlying desktop window.
  floating.setIgnoreMouseEvents(locked,{forward:true});
  dragStart=null;
  floating.webContents.send('lyrics:locked',locked);return {open:true,locked}}

 function update(info){
  if(!info||typeof info!=='object')return false;
  lastText={title:String(info.title||'').slice(0,160),line:String(info.line||'').slice(0,500),translation:String(info.translation||'').slice(0,500)};
  if(!exists())return true;
  if(!loaded)return true;
  floating.webContents.send('lyrics:text',lastText);
  reconcileVisibility();
  return true;
 }
 function applySettings(s){if(!exists())return;
  floating.setAlwaysOnTop(s.alwaysOnTop!==false);
  const b=floating.getBounds(),work=screen?.getDisplayMatching?.(b)?.workArea;
  const width=Math.round(work?Math.min(s.width,work.width-24):s.width);
  if(currentWidth!==width){
    currentWidth=width;
    floating.setBounds({...b,width:currentWidth,height:currentHeight});
    const location=resolvePosition(position(),screen,width,b.height);
    const actual=floating.getBounds();
    if(location&&(actual.x!==location.x||actual.y!==location.y))floating.setBounds({x:location.x,y:location.y,width:currentWidth,height:currentHeight},false);
  }
  floating.webContents.send('lyrics:settings',s);
  lock(!!s.mouseThrough);
  reconcileVisibility();
 }
 function resizeTo(height){if(!exists())return false;
  const h=Math.max(56,Math.min(560,Math.ceil(Number(height)||150)));
  const b=floating.getBounds();if(Math.abs(h-b.height)<2)return true;
  const work=screen?.getDisplayMatching?.(b)?.workArea;
  const maxH=work?Math.max(56,work.height-24):560;
  const next=Math.min(h,maxH);
  const y=work?Math.min(Math.max(b.y,work.y),work.y+work.height-next):b.y;
  currentHeight=next;floating.setBounds({...b,y,width:currentWidth,height:currentHeight});floating.setBackgroundColor?.('#00000000');return true;
 }
 function setLyricShape(rects){
  if(!exists()||process.platform!=='win32'||typeof floating.setShape!=='function')return false;
  const b=floating.getBounds(),next=sanitizeLyricShape(rects,b.width,b.height);
  if(dragStart){if(!dragShape)dragShape=lyricShape||next;pendingShape=next;floating.setShape([...dragShape,...next]);}
  else{lyricShape=next;pendingShape=dragShape=null;floating.setShape(next);}
  return true;
 }
 function applyPendingShape(){if(exists()&&pendingShape&&typeof floating.setShape==='function'){lyricShape=pendingShape;floating.setShape(lyricShape);}pendingShape=dragShape=null;}
 function dragBegin(){if(!exists()||locked)return false;const cursor=screen.getCursorScreenPoint();dragStart={cursor,bounds:floating.getBounds(),lastCursor:cursor};return true;}
 function dragMove(){if(!exists()||locked||!dragStart)return false;
   const cursor=screen.getCursorScreenPoint(),b=dragStart.bounds;
   if(cursor.x===dragStart.lastCursor.x&&cursor.y===dragStart.lastCursor.y)return true;
   dragStart.lastCursor=cursor;
   const nextX=Math.round(b.x+cursor.x-dragStart.cursor.x),nextY=Math.round(b.y+cursor.y-dragStart.cursor.y);
   floating.setBounds({x:nextX,y:nextY,width:currentWidth,height:currentHeight},false);return true;
 }
 function dragEnd(){const wasDragging=!!dragStart;dragStart=null;applyPendingShape();if(wasDragging)rememberPosition();return true;}
 function showMenu(){if(!exists()||locked)return false;
   const menu=Menu.buildFromTemplate([
     {label:'锁定位置（解锁请返回软件设置）',click:()=>lockAndSave(true)},
     {label:'打开歌词设置',click:()=>{if(onOpenSettings){onOpenSettings();return;}const main=getMainWindow();if(main&&!main.isDestroyed()){main.show();main.focus();main.webContents.send('lyrics:open-settings');}}},
     {type:'separator'},
     {label:'关闭桌面歌词',click:()=>{
       try{onCloseRequest?.();}catch(error){const main=getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('lyrics:status',{open:true,error:'保存桌面歌词开关失败：'+String(error.message||error)});return;}
       close();
     }}
   ]);
   menu.popup({window:floating});return true;
 }
 let onLockChange=null;
 function setLockChange(callback){onLockChange=callback;}
 function lockAndSave(value){const result=lock(value);if(onLockChange)onLockChange(locked);return result;}
 function owns(webContents){return exists()&&webContents?.id===floating.webContents.id;}
 return {open,close,status,lock,lockAndSave,setLockChange,update,applySettings,resizeTo,setLyricShape,dragBegin,dragMove,dragEnd,resetPosition,position,showMenu,exists,owns,setMainFocused};
}
module.exports={createFloatingLyricsController,sanitizeLyricShape};
