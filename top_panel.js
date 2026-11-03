'use strict';
const path=require('node:path');
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:min));
function panelBounds(area,{width=420,height=740,right=28}={}){
 const w=Math.min(width,area.width),max=Math.max(200,area.height-24),h=clamp(height,Math.min(420,max),max);
 return {x:Math.round(area.x+area.width-w-clamp(right,0,Math.max(0,area.width-w))),y:area.y,width:w,height:Math.round(h)};
}
function createTopPanel({BrowserWindow,screen,baseDir,getWindow,getSaved=()=>({}),save=()=>{}}){
 let charm=null,opened=false,gesture=null,animation=null,ready=false,closed=false;
 let prefs={height:740,right:28},area;
 const panel=()=>getWindow(),alive=w=>w&&!w.isDestroyed();
 function bounds(){return panelBounds(area||{x:0,y:0,width:1280,height:800},prefs);}
 function publish(){if(alive(panel()))panel().webContents.send('panel:state',{expanded:opened,height:bounds().height,maxHeight:(area?.height||800)-24});}
 function persist(){save({height:prefs.height,right:prefs.right,displayId:prefs.displayId});}
 function placeCharm(){if(!alive(charm))return;const b=bounds();charm.setBounds({x:b.x+Math.round(b.width/2)-38,y:b.y,width:76,height:160});}
 function refresh(){
  const displays=screen.getAllDisplays();const chosen=displays.find(d=>d.id===prefs.displayId)||screen.getPrimaryDisplay();
  area=chosen.workArea;prefs.displayId=chosen.id;
  if(alive(panel()))panel().setBounds(bounds());placeCharm();publish();
 }
 function stopAnimation(){clearInterval(animation);animation=null;}
 function unfold(animate=true){
  if(closed||!ready)return;stopAnimation();opened=true;charm?.hide();const target=bounds(),w=panel(),start=w.isVisible()?Math.min(w.getBounds().height,target.height):180;
  w.setBounds({...target,height:animate?start:target.height});w.show();if(!w.isVisible())w.showInactive();w.focus?.();publish();
  if(!animate)return;
  const begin=Date.now();animation=setInterval(()=>{if(!alive(w)){stopAnimation();return;}const t=Math.min(1,(Date.now()-begin)/260),ease=1-(1-t)**3;w.setBounds({...target,height:Math.round(start+(target.height-start)*ease)});if(t===1)stopAnimation();},16);
 }
 function collapse(){stopGesture(false);stopAnimation();opened=false;if(alive(panel()))panel().hide();placeCharm();if(alive(charm))charm.showInactive();publish();}
 function begin(kind,point){
  if(!['pull','resize','move'].includes(kind)||!ready)return false;
  stopGesture(false);stopAnimation();gesture={kind,start:point||screen.getCursorScreenPoint(),initial:bounds(),saved:{...prefs},moved:0,last:point||screen.getCursorScreenPoint()};return true;
 }
 function tick(point){
  if(!gesture||!alive(panel()))return;gesture.last=point;const dy=point.y-gesture.start.y,dx=point.x-gesture.start.x;
  gesture.moved=Math.max(gesture.moved,Math.abs(dy),Math.abs(dx));
  if(gesture.kind==='move'){
   const display=screen.getDisplayNearestPoint(point);area=display.workArea;prefs.displayId=display.id;
   prefs.right=clamp(area.x+area.width-(gesture.initial.x+dx)-gesture.initial.width,0,area.width-gesture.initial.width);
   panel().setBounds(bounds());placeCharm();
  }else if(gesture.kind==='resize'){
   prefs.height=panelBounds(area,{...prefs,height:gesture.initial.height+dy}).height;panel().setBounds(bounds());publish();
  }else if(dy>10){
   const b=bounds();panel().setBounds({...b,height:Math.round(clamp(dy+120,160,b.height))});panel().showInactive();
   charm.webContents.send('charm:pull',Math.min(dy,70));
  }
 }
 function stopGesture(commit=true){
  const old=gesture;gesture=null;if(!old)return;
  if(old.kind==='pull'){
   charm?.webContents.send('charm:pull',0);
   if(commit&&(old.last.y-old.start.y>45||old.moved<6))unfold();else{panel()?.hide();opened=false;charm?.showInactive();}
  }else if(commit){persist();publish();}else{prefs=old.saved;refresh();}
 }
 function init(){
  prefs={...prefs,...getSaved()};
  refresh();
  charm=new BrowserWindow({width:76,height:160,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,maximizable:false,minimizable:false,closable:false,fullscreenable:false,alwaysOnTop:true,skipTaskbar:true,show:false,hasShadow:false,
   webPreferences:{preload:path.join(baseDir,'charm-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  charm.webContents.setWindowOpenHandler(()=>({action:'deny'}));charm.webContents.on('will-navigate',e=>e.preventDefault());
  charm.webContents.once('did-finish-load',()=>{ready=true;placeCharm();charm.showInactive();});
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
   return begin(message.kind,point);
  }
  if(message.type==='move'&&point){tick(point);return true;}
  if(message.type==='end'){stopGesture();return true;}
  if(message.type==='cancel'){stopGesture(false);return true;}
  if(message.type==='height'&&Number.isFinite(message.value)){stopAnimation();prefs.height=panelBounds(area,{...prefs,height:message.value}).height;panel().setBounds(bounds());persist();publish();return true;}
  return false;
 }
 function close(){if(closed)return;closed=true;gesture=null;stopAnimation();for(const event of ['display-added','display-removed','display-metrics-changed'])screen.removeListener?.(event,refresh);if(alive(charm))charm.destroy();}
 return {init,action,unfold,collapse,close,owns,refresh,bounds};
}
module.exports={panelBounds,createTopPanel};
