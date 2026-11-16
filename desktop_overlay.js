'use strict';
// The glass host is confined to the player bounds. No desktop-sized surface.
function fit(bounds,area){
 const width=Math.max(Math.min(760,area.width),Math.min(bounds.width||Math.round(area.width*.88),area.width));
 const height=Math.max(Math.min(420,area.height),Math.min(bounds.height||Math.round(area.height*.85),area.height));
 return {x:Math.round(Number.isFinite(bounds.x)?bounds.x:area.x+(area.width-width)/2),y:Math.round(Number.isFinite(bounds.y)?bounds.y:area.y+(area.height-height)/2),width:Math.round(width),height:Math.round(height)};
}
function recover(bounds,displays,area){
 const result=fit(bounds,area),visible=displays.some(d=>{const b=d.bounds||d.workArea;return result.x<b.x+b.width&&result.x+result.width>b.x&&result.y<b.y+b.height&&result.y+result.height>b.y;});
 return visible?result:fit({width:result.width,height:result.height},area);
}
function createDesktopOverlay({BrowserWindow,screen,getWindow,ensureWindow,getSaved=()=>({}),save=()=>{},onVisibility=()=>{},applyGlass=require('./native_glass').applyGlass}){
 let ready=false,requested=false,opened=false,closed=false,gesture=null,poll=null,listening=false,display=null,rect=null,glassHost=null;
 const alive=w=>w&&!w.isDestroyed();
 function bounds(){const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,saved=getSaved(),width=Math.round(area.width*.87);return recover(saved.layoutVersion===3?saved:{width,height:Math.min(Math.round(area.height*.92),Math.round(width*912/1670))},screen.getAllDisplays(),area);}
 function radius(){const unit=Math.max(.9,Math.min(2.3,rect.width/835));return Math.max(8*unit,Math.min(18*unit,rect.height*.028));}
 function place(w){if(alive(glassHost))glassHost.setBounds(rect);w.setBounds(rect);}
 function publish(){const w=getWindow();if(alive(w)&&rect&&display)w.webContents.send('panel:state',{expanded:opened,height:rect.height,maxHeight:display.workArea.height,rect:{x:0,y:0,width:rect.width,height:rect.height}});}
 function material(enabled){const w=getWindow();if(alive(w))applyGlass(w,{enabled,blur:false,radius:rect?radius():24});}
 function destroyGlass(){const host=glassHost;glassHost=null;if(alive(host))host.destroy();}
 function createGlass(){
  if(alive(glassHost))return;
  const host=new BrowserWindow({...rect,show:false,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,maximizable:false,minimizable:false,fullscreenable:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false,backgroundThrottling:true}});
  glassHost=host;host.setIgnoreMouseEvents(true);applyGlass(host,{enabled:true,radius:radius()});host.setOpacity(.25);
  // Display only after its empty renderer loads. A delayed load after hide must
  // never resurrect a stale background window over the desktop.
  Promise.resolve(host.loadURL('data:text/html,<html style="background:transparent"></html>')).then(()=>{
   if(closed||!opened||glassHost!==host||!alive(host))return;
   host.showInactive();host.setAlwaysOnTop(true,'normal');
   const w=getWindow();if(alive(w)){w.moveTop?.();w.setAlwaysOnTop?.(true,'pop-up-menu');}
  }).catch(()=>{if(glassHost===host)destroyGlass();});
 }
 function unfold(){
  if(closed)return;ensureListeners();requested=true;
  if(!alive(getWindow())){ready=false;ensureWindow();return;}if(!ready)return;
  const w=getWindow();if(!opened){display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());rect=bounds();place(w);opened=true;}
  createGlass();publish();w.show();material(true);w.moveTop?.();w.focus();
  // Electron's constructor option alone can leave WS_EX_TOPMOST unset after
  // showing a transparent, frameless window on Windows. Reassert it after all
  // operations that can change the native stacking order.
  w.setAlwaysOnTop?.(true,'pop-up-menu');onVisibility(true);
 }
 function cancelGesture(){clearInterval(poll);poll=null;gesture=null;}
 function collapse(){requested=false;opened=false;cancelGesture();destroyGlass();const w=getWindow();if(alive(w))w.hide();material(false);onVisibility(false);publish();}
 function init(){ready=true;if(requested)unfold();}
 function tick(){if(!gesture||!rect||!display)return;const cursor=screen.getCursorScreenPoint();if(cursor.x===gesture.last.x&&cursor.y===gesture.last.y)return;gesture.last=cursor;const dx=cursor.x-gesture.start.x,dy=cursor.y-gesture.start.y;display=screen.getDisplayNearestPoint(cursor);rect=fit(gesture.kind==='move'?{...gesture.initial,x:gesture.initial.x+dx,y:gesture.initial.y+dy}:{...gesture.initial,width:gesture.initial.width+dx,height:gesture.initial.height+dy},display.workArea);const w=getWindow();if(alive(w))place(w);publish();}
 function action(sender,message){const w=getWindow();if(!alive(w)||sender!==w.webContents||!message)return false;
  if(message.type==='expand'){unfold();return true;}if(message.type==='collapse'){collapse();return true;}
  if(!opened||!rect)return false;
  if(message.type==='begin'&&['move','resize'].includes(message.kind)){cancelGesture();const cursor=screen.getCursorScreenPoint(),start=Number.isFinite(message.x)&&Number.isFinite(message.y)?{x:message.x,y:message.y}:cursor;gesture={kind:message.kind,start,last:start,initial:{...rect}};tick();poll=setInterval(tick,8);poll.unref?.();return true;}
  if(message.type==='move'){tick();return true;}
  if(['end','cancel'].includes(message.type)){tick();cancelGesture();save({...rect,layoutVersion:3});return true;}
  if(message.type==='height'&&Number.isFinite(message.value)){rect=fit({...rect,height:message.value},display.workArea);place(w);save({...rect,layoutVersion:3});publish();return true;}
  if(message.type==='size'&&Number.isFinite(message.width)&&Number.isFinite(message.height)){rect=fit({...rect,width:message.width,height:message.height},display.workArea);place(w);save({...rect,layoutVersion:3});publish();return true;}
  return false;
 }
 function refresh(){if(!opened)return;const w=getWindow();if(alive(w)){display=screen.getDisplayMatching(w.getBounds());rect=recover(rect,screen.getAllDisplays(),display.workArea);place(w);publish();}}
 function ensureListeners(){if(listening)return;listening=true;for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on(event,refresh);}
 return {init,unfold,collapse,toggle(){if(opened||requested)collapse();else unfold();},action,bounds,refresh,owns:s=>alive(getWindow())&&getWindow().webContents===s,isVisible:()=>opened,close(){closed=true;collapse();if(listening)for(const event of ['display-added','display-removed','display-metrics-changed'])screen.removeListener?.(event,refresh);}};
}
module.exports={createDesktopOverlay,fit,recover};
