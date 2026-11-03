'use strict';
const path=require('node:path');
function createMiniPlayerController({BrowserWindow,baseDir,getMainWindow,screen}){
 let mini=null,last={title:'音乐，随手可及',artist:'从歌单选一首开始',playing:false},ready=false,expanded=false,pinned=false,screenReady=false;
 const exists=()=>!!mini&&!mini.isDestroyed();
 const owns=sender=>exists()&&sender?.id===mini.webContents.id;
 function send(){if(exists()&&ready)mini.webContents.send('mini:state',{...last,expanded,pinned});}
 function place(){
  if(!exists())return;
  const display=screen?.getDisplayMatching?.(mini.getBounds())||screen?.getPrimaryDisplay?.();
  const area=display?.workArea||{x:0,y:0,width:1280,height:800};
  const width=expanded?Math.min(384,area.width):40,height=expanded?Math.min(680,area.height-24):132;
  mini.setBounds({x:Math.round(area.x+area.width-width),y:Math.round(area.y+Math.min(64,Math.max(0,area.height-height))),width,height});
 }
 function expand(value){expanded=!!value;place();send();}
 function open(){
  if(!screenReady){for(const event of ['display-metrics-changed','display-removed','display-added'])screen?.on?.(event,place);screenReady=true;}
  if(exists()){mini.show();return {open:true};}
  expanded=false;ready=false;
  mini=new BrowserWindow({width:40,height:132,frame:false,transparent:true,backgroundColor:'#00000000',alwaysOnTop:true,skipTaskbar:true,resizable:false,hasShadow:false,show:false,
   webPreferences:{preload:path.join(baseDir,'mini-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const area=screen?.getPrimaryDisplay?.()?.workArea;if(area)mini.setBounds({x:area.x+area.width-40,y:area.y+64,width:40,height:132});
  place();
  mini.webContents.once('did-finish-load',()=>{if(!exists())return;ready=true;send();mini.showInactive();getMainWindow()?.webContents.send('mini:control',{type:'sync'});});
  mini.loadFile(path.join(baseDir,'app','mini-player.html'));
  mini.on('closed',()=>{mini=null;ready=false;const main=getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('mini:status',{open:false});});
  mini.webContents.setWindowOpenHandler(()=>({action:'deny'}));mini.webContents.on('will-navigate',e=>e.preventDefault());
  return {open:true};
 }
 function close(){if(exists())mini.close();return {open:false};}
 function update(state){
  const text=(v,n=180)=>String(v||'').slice(0,n),num=v=>Number.isFinite(v)?Math.max(0,v):0;
  let cover='';try{const u=new URL(state?.cover);if(u.protocol==='https:'&&/(^|\.)music\.(126|163)\.net$/.test(u.hostname))cover=u.href;}catch{}
  last={title:text(state?.title)||'音乐，随手可及',artist:text(state?.artist),playing:state?.playing===true,cover,
   time:num(state?.time),duration:num(state?.duration),volume:Math.min(1,num(state?.volume)),mode:text(state?.mode,20),previewOnly:state?.previewOnly===true,
   queue:Array.isArray(state?.queue)?state.queue.map(s=>({key:text(s.key,400),title:text(s.title),artist:text(s.artist),active:!!s.active})):[],
   playlists:Array.isArray(state?.playlists)?state.playlists.slice(0,100).map(p=>({id:text(p.id,40),name:text(p.name,32)})):[],lyric:text(state?.lyric,300)};send();return true;
 }
 function control(sender,action){
  if(!owns(sender))return false;
  if(['previous','toggle','next'].includes(action)){getMainWindow()?.webContents.send('mini:control',action);return true;}
  if(!action||typeof action!=='object')return false;
  if(action.type==='expand'){expand(true);return true;}
  if(action.type==='collapse'){if(!pinned)expand(false);return true;}
  if(action.type==='pin'){pinned=!pinned;send();return true;}
  if(action.type==='show-main'){const main=getMainWindow();main?.restore?.();main?.show();main?.focus?.();return true;}
  const valid=['sync','queue'].includes(action.type)||(action.type==='library'&&(action.playlist===undefined||typeof action.playlist==='string'&&action.playlist.length<=40))||(action.type==='seek'&&Number.isFinite(action.value)&&action.value>=0)||(action.type==='volume'&&Number.isFinite(action.value)&&action.value>=0&&action.value<=1)||(action.type==='select'&&typeof action.key==='string'&&action.key.length<=400)||(action.type==='mode'&&['sequence','shuffle','repeat-one'].includes(action.value));
  if(!valid)return false;getMainWindow()?.webContents.send('mini:control',action);return true;
 }
 return {open,close,update,control,exists,owns,expand};
}
module.exports={createMiniPlayerController};
