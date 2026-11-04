'use strict';
(function(root){
 const nav=typeof module==='object'&&module.exports?require('./playback_navigation'):root.MusicPlaybackNavigation;
 function createPlayer({audio,bridge,onState=()=>{},onTrack=()=>{}}){
  let serial=0,navigation=0,track=null,queue=nav.createQueue([]),catalog=new Map(),busy=false,error='',mode='sequence',playOptions={};
  const state=()=>({track,queue,rows:queue.tracks.map(k=>catalog.get(k)).filter(Boolean),busy,error,mode,playing:!audio.paused&&!audio.ended,time:audio.currentTime||0,duration:Number.isFinite(audio.duration)?audio.duration:0,volume:audio.volume});
  const emit=()=>onState(state());
  async function play(item,pool=null,options={}){
   if(!item)return false;if(options.navigationToken===undefined)navigation++;const token=++serial;playOptions=options;busy=true;error='';audio.pause();audio.removeAttribute('src');audio.load();track=item;catalog.set(item.key,item);
   if(pool){pool.forEach(s=>catalog.set(s.key,s));queue=nav.createQueue(pool.map(s=>s.key),Math.max(0,pool.findIndex(s=>s.key===item.key)),mode);}
   else if(!queue.tracks.includes(item.key))queue=nav.createQueue([item.key],0,mode);
   emit();
   try{
    await bridge.stopOnlinePlayback();if(token!==serial)return false;
    const source=item.local?await bridge.playLocal(item.file):await bridge.streamAudio(item.id,{allowTrial:options.allowTrial===true});
    if(token!==serial)return false;
    track={...item,...source,name:item.name,artists:item.artists,key:item.key,local:item.local,file:item.file};catalog.set(item.key,track);
    if(Number.isFinite(options.resumeTime)&&options.resumeTime>0)audio.addEventListener('loadedmetadata',()=>{if(token===serial&&Number.isFinite(audio.duration))audio.currentTime=Math.min(options.resumeTime,Math.max(0,audio.duration-.1));},{once:true});
    audio.src=source.url;audio.load();onTrack(track,token);if(!options.paused)await audio.play();
    if(token!==serial)return false;busy=false;emit();return true;
   }catch(e){if(token===serial){busy=false;error=e.message||String(e);emit();}return false;}
  }
  async function step(direction=1,reason='manual'){
   const token=++navigation,seen=new Set(),limit=queue.tracks.length;
   for(let attempt=0;attempt<limit;attempt++){
    const next=nav.step(queue,direction,Math.random,reason);if(!next||navigation!==token)return false;queue=next;
    const key=queue.tracks[queue.index];if(seen.has(key))return false;seen.add(key);
    if(await play(catalog.get(key),null,{allowTrial:true,navigationToken:token}))return true;
    if(navigation!==token)return false;
   }
   return false;
  }
  async function toggle(){if(busy)return;if(!audio.src||audio.error||error){if(track)return play(track,null,{allowTrial:true});return;}if(audio.paused){try{await audio.play();}catch(e){error=e.message;}}else audio.pause();emit();}
  function setMode(value){mode=nav.normalizeMode(value);queue=nav.createQueue(queue.tracks,queue.index,mode);emit();}
  function renameLocal(oldName,newName){
   const oldKey='local:'+oldName,newKey='local:'+newName,item=catalog.get(oldKey);if(!item)return;
   catalog.delete(oldKey);catalog.set(newKey,{...item,key:newKey,file:newName});queue.tracks=queue.tracks.map(k=>k===oldKey?newKey:k);
   if(track?.key===oldKey){track={...track,key:newKey,file:newName};if(busy)return play(track,null,{paused:playOptions.paused,resumeTime:playOptions.resumeTime});}emit();
  }
  return {state,play,step,toggle,setMode,renameLocal,emit,serial:()=>serial,stop(){serial++;navigation++;busy=false;error='';audio.pause();emit();void bridge.stopOnlinePlayback().catch(()=>{});}};
 }
 const api={createPlayer};if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.OrbitPlayer=api;
})(typeof window!=='undefined'?window:null);
