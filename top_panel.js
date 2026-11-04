'use strict';
const path=require('node:path');
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:min));
function panelBounds(area,{width=420,height=740,right=28,anchorX}={}){
 const w=Math.min(width,area.width),max=Math.max(200,area.height-24),h=clamp(height,Math.min(420,max),max);
 const x=Number.isFinite(anchorX)?area.x+anchorX-w/2:area.x+area.width-w-right;
 return {x:Math.round(clamp(x,area.x,area.x+area.width-w)),y:area.y,width:w,height:Math.round(h)};
}
function createTopPanel({BrowserWindow,screen,baseDir,getWindow,getSaved=()=>({}),save=()=>{}}){
 let charm=null,opened=false,gesture=null,ready=false,closed=false,cursorTimer=null;
 let prefs={height:740,right:28},area;
 const panel=()=>getWindow(),alive=w=>w&&!w.isDestroyed();
 const bounds=()=>panelBounds(area||{x:0,y:0,width:1280,height:800},prefs);
 function publish(){if(alive(panel()))panel().webContents.send('panel:state',{expanded:opened,height:bounds().height,maxHeight:(area?.height||800)-24});}
 function reveal(progress,animate=false){if(alive(panel()))panel().webContents.send('panel:reveal',{progress,animate});}
 function persist(){prefs.right=area.x+area.width-bounds().x-bounds().width;save({...prefs});}
 function placeCharm(){if(alive(charm))charm.setBounds({x:Math.round(area.x+prefs.anchorX-38),y:area.y,width:76,height:160});}
 function refresh(){
  const displays=screen.getAllDisplays(),chosen=displays.find(d=>d.id===prefs.displayId)||screen.getPrimaryDisplay();
  area=chosen.workArea;prefs.displayId=chosen.id;
  if(!Number.isFinite(prefs.anchorX)){const b=bounds();prefs.anchorX=b.x-area.x+b.width/2;}
  prefs.anchorX=clamp(prefs.anchorX,38,area.width-38);
  if(alive(panel()))panel().setBounds(bounds());placeCharm();publish();
 }
 function unfold(animate=true){
  if(closed||!ready)return;opened=true;const w=panel();w.setBounds(bounds());
  if(!w.isVisible())reveal(0);w.show();w.focus?.();charm?.hide();reveal(1,animate);publish();
 }
 function collapse(){stopGesture(false);opened=false;if(alive(panel())){reveal(0);panel().hide();}placeCharm();if(alive(charm))charm.showInactive();publish();}
 function begin(kind,point,native=false){
  if(!['pull','resize','move'].includes(kind)||!ready)return false;
  // Down-event coordinates are captured before the window moves. Sampling the OS
  // here loses fast drags whose end arrived while the IPC message was in flight.
  stopGesture(false);const start=point||screen.getCursorScreenPoint();
  gesture={kind,start,initial:bounds(),anchor:area.x+prefs.anchorX,saved:{...prefs},moved:0,last:start,native};
  // Native cursor coordinates stay stable while the captured window itself moves.
  if(native){cursorTimer=setInterval(()=>tick(screen.getCursorScreenPoint()),8);cursorTimer.unref?.();}
  return true;
 }
 function tick(point){
  if(!gesture||!alive(panel()))return;
  if(point.x===gesture.last.x&&point.y===gesture.last.y)return;
  gesture.last=point;const dy=point.y-gesture.start.y,dx=point.x-gesture.start.x;
  gesture.moved=Math.max(gesture.moved,Math.abs(dy),Math.abs(dx));
  if(gesture.kind==='pull'&&!gesture.axis&&Math.max(Math.abs(dx),Math.abs(dy))>4){gesture.axis=Math.abs(dx)>Math.abs(dy)*1.1?'horizontal':'vertical';if(gesture.axis==='horizontal')gesture.kind='charm-move';}
  if(gesture.kind==='move'||gesture.kind==='charm-move'){
   const display=screen.getDisplayNearestPoint(point);area=display.workArea;prefs.displayId=display.id;
   prefs.anchorX=clamp(gesture.anchor+dx-area.x,38,area.width-38);
   panel().setBounds(bounds());placeCharm();
  }else if(gesture.kind==='resize'){
   prefs.height=panelBounds(area,{...prefs,height:gesture.initial.height+dy}).height;panel().setBounds(bounds());publish();
  }else if(gesture.axis==='vertical'){
   if(dy>3&&!panel().isVisible()){panel().setBounds(bounds());reveal(0);panel().showInactive();charm.moveTop?.();}
   // A short pull reveals a large, unchanged sheet; the GPU performs the slide.
   reveal(clamp(dy*5/bounds().height,0,1));
   charm.webContents.send('charm:pull',clamp(dy,0,70));
  }
 }
 function stopGesture(commit=true){
  clearInterval(cursorTimer);cursorTimer=null;
  const old=gesture;gesture=null;if(!old)return;
  if(old.kind==='pull'){
   charm?.webContents.send('charm:pull',0);
   if(commit&&(old.last.y-old.start.y>12||old.moved<6))unfold();else{reveal(0);panel()?.hide();opened=false;charm?.showInactive();}
  }else if(commit||old.kind==='charm-move'||old.kind==='move'){persist();publish();}
  else{prefs=old.saved;refresh();}
 }
 function init(){
  if(charm)return;prefs={...prefs,...getSaved()};refresh();
  charm=new BrowserWindow({width:76,height:160,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,maximizable:false,minimizable:false,closable:false,fullscreenable:false,alwaysOnTop:true,skipTaskbar:true,show:false,hasShadow:false,
   webPreferences:{preload:path.join(baseDir,'charm-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  charm.webContents.setWindowOpenHandler(()=>({action:'deny'}));charm.webContents.on('will-navigate',e=>e.preventDefault());
  charm.webContents.once('did-finish-load',()=>{ready=true;placeCharm();charm.showInactive();reveal(0);});
  charm.loadFile(path.join(baseDir,'app/charm.html'));
  for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on(event,refresh);
 }
 function owns(sender){return alive(charm)&&sender===charm.webContents||alive(panel())&&sender===panel().webContents;}
 function action(sender,message){
  if(closed||!owns(sender)||!message||typeof message!=='object')return false;
  if(message.type==='expand'){unfold();return true;}
  if(message.type==='collapse'){collapse();return true;}
  const point=Number.isFinite(message.x)&&Number.isFinite(message.y)?{x:message.x,y:message.y}:null;
  if(message.type==='begin'){
   if(message.kind==='pull'?sender!==charm?.webContents:sender!==panel()?.webContents)return false;
   return begin(message.kind,point,message.native===true);
  }
  if(message.type==='move'){if(gesture?.native)tick(screen.getCursorScreenPoint());else if(point)tick(point);return true;}
  if(message.type==='end'){if(gesture?.native)tick(screen.getCursorScreenPoint());stopGesture();return true;}
  if(message.type==='cancel'){stopGesture(false);return true;}
  if(message.type==='height'&&Number.isFinite(message.value)){prefs.height=panelBounds(area,{...prefs,height:message.value}).height;panel().setBounds(bounds());persist();publish();return true;}
  return false;
 }
 function close(){if(closed)return;closed=true;gesture=null;clearInterval(cursorTimer);for(const event of ['display-added','display-removed','display-metrics-changed'])screen.removeListener?.(event,refresh);if(alive(charm))charm.destroy();}
 return {init,action,unfold,collapse,close,owns,refresh,bounds};
}
module.exports={panelBounds,createTopPanel};
