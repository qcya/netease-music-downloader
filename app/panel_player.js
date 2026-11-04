'use strict';
(function(root){
 const nav=typeof module==='object'&&module.exports?require('./playback_navigation'):root.MusicPlaybackNavigation;
 function createPlayer({audio,bridge,onState=()=>{},onTrack=()=>{}}){
  let serial=0,navigation=0,track=null,queue=nav.createQueue([]),catalog=new Map(),busy=false,error='',mode='sequence',playOptions={},queueExtender=null;
  const state=()=>({track,queue,rows:queue.tracks.map(k=>catalog.get(k)).filter(Boolean),busy,error,mode,playing:!audio.paused&&!audio.ended,time:audio.currentTime||0,duration:Number.isFinite(audio.duration)?audio.duration:0,volume:audio.volume});
  const emit=()=>onState(state());
  async function play(item,pool=null,options={}){
   if(!item)return false;if(options.navigationToken===undefined)navigation++;const token=++serial;playOptions=options;busy=true;error='';audio.pause();audio.removeAttribute('src');audio.load();track=item;catalog.set(item.key,item);
   if(pool){queueExtender=typeof options.extendQueue==='function'?options.extendQueue:null;pool.forEach(s=>catalog.set(s.key,s));queue=nav.createQueue(pool.map(s=>s.key),Math.max(0,pool.findIndex(s=>s.key===item.key)),mode);}
   else if(!queue.tracks.includes(item.key)){queue=nav.createQueue([item.key],0,mode);if(options.navigationToken===undefined)queueExtender=null;}
   emit();
   try{
    await bridge.stopOnlinePlayback();if(token!==serial)return false;
    const source=item.local?await bridge.playLocal(item.file):await bridge.streamAudio(item.id,{allowTrial:options.allowTrial===true});
    if(token!==serial)return false;
    const latest=catalog.get(item.key)||item;
    track={...latest,...source,id:source.id||latest.id||item.id,name:latest.name,artists:latest.artists,key:item.key,local:item.local,file:item.file};
    if(item.local&&latest.cover_url)track.cover_url=latest.cover_url;
    catalog.set(item.key,track);
    if(Number.isFinite(options.resumeTime)&&options.resumeTime>0)audio.addEventListener('loadedmetadata',()=>{if(token===serial&&Number.isFinite(audio.duration))audio.currentTime=Math.min(options.resumeTime,Math.max(0,audio.duration-.1));},{once:true});
    audio.src=source.url;audio.load();onTrack(track,token);if(!options.paused)await audio.play();
    if(token!==serial)return false;busy=false;emit();return true;
   }catch(e){if(token===serial){busy=false;error=e.message||String(e);emit();}return false;}
  }
  async function step(direction=1,reason='manual'){
   const token=++navigation,seen=new Set(),extended=new Set();
   while(queue.tracks.length){
    const delta=(queue.mode==='reverse'?-1:1)*(direction<0?-1:1),currentKey=track?.key;
    const endedWithoutNavigation=reason==='ended'&&['repeat-one','stop-after'].includes(queue.mode);
    const boundary=queue.mode==='shuffle'?direction>=0&&!queue.unplayed.length&&!queue.ahead.length:(delta>0?queue.index===queue.tracks.length-1:queue.index===0);
    const marker=currentKey+'\0'+delta;
    if(queueExtender&&boundary&&!endedWithoutNavigation&&!extended.has(marker)){
     extended.add(marker);
     const isCurrent=()=>navigation===token&&track?.key===currentKey;
     const context={direction:delta,reason,trackKey:currentKey,isCurrent,updateQueue:pool=>isCurrent()&&Array.isArray(pool)&&pool.some(item=>item?.key===currentKey)&&updateQueue(mergeExtension(pool),currentKey,{preserveShuffle:true})};
     let result;try{result=await queueExtender(context);}catch{return false;}
     if(!isCurrent()||result===false)return false;
     if(Array.isArray(result)&&!context.updateQueue(result))return false;
    }
    const next=nav.step(queue,direction,Math.random,reason);if(!next||navigation!==token)return false;queue=next;
    const key=queue.tracks[queue.index];if(seen.has(key)){if(queue.mode==='shuffle'&&seen.size<queue.tracks.length&&queue.unplayed.length)continue;return false;}seen.add(key);
    if(await play(catalog.get(key),null,{allowTrial:true,navigationToken:token}))return true;
    if(navigation!==token)return false;
   }
   return false;
  }
  async function toggle(){if(busy)return;if(!audio.src||audio.error||error){if(track)return play(track,null,{allowTrial:true});return;}if(audio.paused){try{await audio.play();}catch(e){error=e.message;}}else audio.pause();emit();}
  function setMode(value){navigation++;mode=nav.normalizeMode(value);queue=nav.createQueue(queue.tracks,queue.index,mode);emit();}
  function renameLocal(oldName,newName){
   const oldKey='local:'+oldName,newKey='local:'+newName,item=catalog.get(oldKey);if(!item)return;
   catalog.delete(oldKey);catalog.set(newKey,{...item,key:newKey,file:newName});queue.tracks=queue.tracks.map(k=>k===oldKey?newKey:k);
   if(track?.key===oldKey){track={...track,key:newKey,file:newName};if(busy)return play(track,null,{paused:playOptions.paused,resumeTime:playOptions.resumeTime});}emit();
  }
  function mergeExtension(pool){
   if(!Array.isArray(pool))return pool;
   const incoming=[],byKey=new Map();for(const item of pool){if(item?.key&&!byKey.has(item.key)){incoming.push(item);byKey.set(item.key,item);}}
   const existing=queue.tracks,known=new Set(existing),first=incoming.findIndex(item=>known.has(item.key));if(first<0)return pool;
   let last=-1;for(let i=incoming.length-1;i>=0;i--)if(known.has(incoming[i].key)){last=i;break;}
   const prefix=[],suffix=[],after=new Map();let preceding=null;
   for(let i=0;i<incoming.length;i++){const item=incoming[i];if(known.has(item.key)){preceding=item.key;continue;}
    if(i<first)prefix.push(item);else if(i>last)suffix.push(item);else if(preceding){if(!after.has(preceding))after.set(preceding,[]);after.get(preceding).push(item);}
   }
   const result=[...prefix];for(const key of existing){const item=byKey.get(key)||catalog.get(key);if(item)result.push(item);if(after.has(key))result.push(...after.get(key));}return [...result,...suffix];
  }
  function updateQueue(pool,expectedKey,{preserveShuffle=false}={}){
   if(!Array.isArray(pool)||track?.key!==expectedKey||!pool.some(s=>s.key===expectedKey))return false;
   const unique=[],seenKeys=new Set();for(const item of pool){if(!item?.key||seenKeys.has(item.key))continue;seenKeys.add(item.key);unique.push(item);catalog.set(item.key,item.key===expectedKey?track:item);}
   const previous=queue,next=nav.createQueue(unique.map(s=>s.key),unique.findIndex(s=>s.key===expectedKey),mode);
   if(preserveShuffle&&mode==='shuffle'&&previous.mode==='shuffle'){
    const index=new Map(next.tracks.map((key,i)=>[key,i]));
    const remap=list=>(list||[]).map(i=>index.get(previous.tracks[i])).filter(i=>Number.isInteger(i));
    next.past=remap(previous.past);next.ahead=remap(previous.ahead);next.unplayed=remap(previous.unplayed);
    const old=new Set(previous.tracks),added=next.tracks.map((key,i)=>old.has(key)?-1:i).filter(i=>i>=0&&i!==next.index);
    for(let i=added.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[added[i],added[j]]=[added[j],added[i]];}
    next.unplayed.push(...added);
   }
   queue=next;emit();return true;
  }
  function updateLocalArtwork(file,cover,id){
   const key='local:'+file,item=catalog.get(key);if(!item)return;
   const updated={...item,cover_url:cover||item.cover_url||'',id:item.id||id||null};catalog.set(key,updated);if(track?.key===key){track=updated;emit();}
  }
  function removeLocal(file){
   const key='local:'+file,wasCurrent=track?.key===key||track?.fromLocal&&track.localFile===file;catalog.delete(key);
   for(const [entryKey,item] of catalog)if(item?.fromLocal&&item.localFile===file)catalog.set(entryKey,{...item,fromLocal:false,localFile:null,url:null});
   if(wasCurrent){serial++;navigation++;busy=false;error='';audio.pause();audio.removeAttribute('src');audio.load();track=null;}
   const remaining=queue.tracks.filter(k=>k!==key);queue=nav.createQueue(remaining,Math.max(0,remaining.indexOf(track?.key)),mode);emit();
  }
  return {state,play,step,toggle,setMode,renameLocal,updateQueue,updateLocalArtwork,removeLocal,emit,serial:()=>serial,stop(){serial++;navigation++;busy=false;error='';audio.pause();emit();void bridge.stopOnlinePlayback().catch(()=>{});}};
 }
 const api={createPlayer};if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.OrbitPlayer=api;
})(typeof window!=='undefined'?window:null);
