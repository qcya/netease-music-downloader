'use strict';
(()=>{
 function create({video,image,status}){
  let revision=0,playRevision=0,visible=false,kind='black';
  function clear(){revision++;playRevision++;video.onerror=null;image.onerror=null;video.pause();video.hidden=true;image.hidden=true;video.removeAttribute('src');image.removeAttribute('src');kind='black';status.hidden=true;}
  function missing(){clear();status.textContent='自定义背景不可用，已恢复黑色背景；可在设置中重新选择。';status.hidden=false;}
  function play(){const token=revision,request=++playRevision;const failed=()=>{if(visible&&token===revision&&request===playRevision)missing();};try{Promise.resolve(video.play()).catch(failed);}catch{failed();}}
  function set(source){
   clear();if(!source||source.kind==='black')return;
   if(!source.url||!['image','video'].includes(source.kind)){missing();return;}
   kind=source.kind;const token=revision,media=kind==='video'?video:image;
   media.onerror=()=>{if(token===revision)missing();};media.src=source.url;media.hidden=false;
   if(kind==='video'){video.muted=true;if(visible)play();}
  }
  return {set,setVisible(value){visible=!!value;if(!visible){playRevision++;video.pause();}else if(kind==='video')play();},dispose:clear};
 }
 window.MusicFullscreenBackground=Object.freeze({create});
})();
