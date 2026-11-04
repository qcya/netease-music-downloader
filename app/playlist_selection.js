'use strict';
(function(root){
 const kinds=['playlist','track'];
 function bind(container,{onChange=()=>{},onDropTracks=()=>{},onReorderTracks=()=>{},onReorderPlaylists=()=>{},onContextMenu=()=>{}}={}){
  const selected={playlist:new Set(),track:new Set()},anchor={playlist:null,track:null},handlers=[];let dragBox=null,dragged=null,box=null,scrollFrame=null;
  const document=container.ownerDocument;
  const view=document.defaultView;
  const requestFrame=fn=>view?.requestAnimationFrame?view.requestAnimationFrame(fn):setTimeout(fn,16);
  const cancelFrame=id=>view?.cancelAnimationFrame?view.cancelAnimationFrame(id):clearTimeout(id);
  const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);handlers.push(()=>target.removeEventListener(type,fn,options));};
  const elements=kind=>[...container.querySelectorAll('[data-select-kind="'+kind+'"][data-select-id]')];
  const find=target=>{const item=target?.closest?.('[data-select-kind][data-select-id]');return item&&container.contains(item)&&kinds.includes(item.dataset.selectKind)?item:null;};
  const getSelected=kind=>kinds.includes(kind)?[...selected[kind]]:[];
  function refresh(){for(const kind of kinds)for(const item of elements(kind)){const active=selected[kind].has(item.dataset.selectId);item.classList.toggle('selected',active);item.setAttribute('aria-selected',String(active));}}
  function notify(){refresh();onChange({playlists:getSelected('playlist'),tracks:getSelected('track')});}
  function clear(kind){for(const k of kinds)if(!kind||kind===k){selected[k].clear();anchor[k]=null;}notify();}
  function choose(item,event){
   const kind=item.dataset.selectKind,id=item.dataset.selectId,ctrl=event.ctrlKey||event.metaKey,shift=event.shiftKey,ordered=elements(kind).map(e=>e.dataset.selectId);
   if(!ctrl&&!shift){for(const k of kinds)selected[k].clear();selected[kind].add(id);}
   else if(shift&&anchor[kind]!==null&&ordered.includes(anchor[kind])){
    if(!ctrl)for(const k of kinds)selected[k].clear();const a=ordered.indexOf(anchor[kind]),b=ordered.indexOf(id);for(let n=Math.min(a,b);n<=Math.max(a,b);n++)selected[kind].add(ordered[n]);
   }else if(ctrl){if(selected[kind].has(id))selected[kind].delete(id);else selected[kind].add(id);}
   else{for(const k of kinds)selected[k].clear();selected[kind].add(id);}
   if(!shift)anchor[kind]=id;notify();
  }
  listen(container,'click',event=>{const item=find(event.target);if(!item||event.target.closest('button,input,select,textarea,a,[data-select-ignore]'))return;if(dragBox?.moved)return;choose(item,event);});
  listen(container,'contextmenu',event=>{const item=find(event.target);if(!item)return;event.preventDefault();const kind=item.dataset.selectKind,id=item.dataset.selectId;if(!selected[kind].has(id)){for(const k of kinds)selected[k].clear();selected[kind].add(id);anchor[kind]=id;notify();}onContextMenu({kind,id,selectedIds:getSelected(kind),x:event.clientX,y:event.clientY});});
  listen(container,'pointerdown',event=>{
   if(event.button!==0||find(event.target)||event.target.closest('button,input,select,textarea,a,[data-select-ignore]'))return;
   const initial={playlist:new Set(selected.playlist),track:new Set(selected.track)};
   const candidate=event.target.closest('[data-selection-scroll]');
   const scroller=candidate&&container.contains(candidate)?candidate:null;
   dragBox={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false,add:event.ctrlKey||event.metaKey,initial,scroller,startScroll:scroller?.scrollTop||0};
   container.setPointerCapture?.(event.pointerId);
  });
  function drawBox(){
   if(!dragBox?.moved)return;
   if(!box){box=document.createElement('div');box.className='selection-marquee';Object.assign(box.style,{position:'fixed',zIndex:'9999',pointerEvents:'none',border:'1px solid #75b5dc',background:'rgba(140,199,232,.2)',borderRadius:'3px'});document.body.append(box);}
   const {x,y,lastX,lastY,scroller,startScroll}=dragBox,scroll=scroller?.scrollTop||0;
   const left=Math.min(x,lastX),right=Math.max(x,lastX),top=Math.min(y,lastY),bottom=Math.max(y,lastY);
   // Compare rows in scroll-content coordinates, so rows that leave the viewport
   // stay selected and reversing direction correctly shrinks the selection.
   const contentTop=Math.min(y+startScroll,lastY+scroll),contentBottom=Math.max(y+startScroll,lastY+scroll);
   let shownTop=Math.min(y+startScroll-scroll,lastY),shownBottom=Math.max(y+startScroll-scroll,lastY);
   if(scroller){const bounds=scroller.getBoundingClientRect();shownTop=Math.max(shownTop,bounds.top);shownBottom=Math.min(shownBottom,bounds.bottom);}
   Object.assign(box.style,{left:left+'px',top:shownTop+'px',width:(right-left)+'px',height:Math.max(0,shownBottom-shownTop)+'px'});
   for(const kind of kinds){selected[kind]=dragBox.add?new Set(dragBox.initial[kind]):new Set();for(const item of elements(kind)){const r=item.getBoundingClientRect(),inside=scroller?.contains(item),itemTop=inside?r.top+scroll:r.top,itemBottom=inside?r.bottom+scroll:r.bottom,selectionTop=inside?contentTop:top,selectionBottom=inside?contentBottom:bottom;if(r.width>0&&r.height>0&&r.right>left&&r.left<right&&itemBottom>selectionTop&&itemTop<selectionBottom)selected[kind].add(item.dataset.selectId);}}
   notify();
  }
  function edgeSpeed(){
   const s=dragBox?.scroller;if(!s||!dragBox.moved)return 0;const r=s.getBoundingClientRect(),edge=Math.min(40,r.height/3),y=dragBox.lastY;
   if(y<r.top+edge)return -Math.ceil(Math.min(1,(r.top+edge-y)/edge)*22);
   if(y>r.bottom-edge)return Math.ceil(Math.min(1,(y-(r.bottom-edge))/edge)*22);
   return 0;
  }
  function autoScroll(){
   scrollFrame=null;if(!dragBox?.scroller)return;const speed=edgeSpeed();if(!speed)return;
   const before=dragBox.scroller.scrollTop;dragBox.scroller.scrollTop+=speed;
   if(dragBox.scroller.scrollTop!==before){drawBox();scrollFrame=requestFrame(autoScroll);}
  }
  listen(container,'pointermove',event=>{
   if(!dragBox||event.pointerId!==dragBox.id)return;
   dragBox.lastX=event.clientX;dragBox.lastY=event.clientY;
   const dx=event.clientX-dragBox.x,dy=event.clientY-dragBox.y;if(!dragBox.moved&&Math.hypot(dx,dy)<5)return;
   dragBox.moved=true;event.preventDefault();drawBox();
   if(edgeSpeed()&&!scrollFrame)scrollFrame=requestFrame(autoScroll);
  });
  function finishBox(event){if(!dragBox||event.pointerId!==dragBox.id)return;const moved=dragBox.moved;if(scrollFrame!==null)cancelFrame(scrollFrame);scrollFrame=null;if(box){box.remove();box=null;}if(!moved&&!dragBox.add)clear();dragBox=null;}
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(container,type,finishBox);
  listen(container,'dragstart',event=>{
   const item=find(event.target);if(!item)return;const kind=item.dataset.selectKind,id=item.dataset.selectId;
   if(!selected[kind].has(id)){for(const k of kinds)selected[k].clear();selected[kind].add(id);anchor[kind]=id;notify();}
   dragged={kind,ids:getSelected(kind)};
   if(event.dataTransfer){event.dataTransfer.effectAllowed='copyMove';event.dataTransfer.setData('application/x-music-'+kind+'-ids',JSON.stringify(dragged.ids));event.dataTransfer.setData('text/plain',dragged.ids.length+(kind==='track'?' 首歌曲':' 个歌单'));}
  });
  listen(container,'dragover',event=>{
   const item=find(event.target);if(!dragged?.ids.length||!item)return;
   const kind=item.dataset.selectKind,id=item.dataset.selectId;
   const valid=dragged.kind==='track'&&(kind==='playlist'||kind==='track'&&!dragged.ids.includes(id))||dragged.kind==='playlist'&&kind==='playlist'&&!dragged.ids.includes(id);
   if(valid){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';}
  });
  listen(container,'drop',event=>{
   const item=find(event.target);if(!dragged?.ids.length||!item)return;
   const kind=item.dataset.selectKind,id=item.dataset.selectId;
   if(dragged.kind==='playlist'&&kind!=='playlist'||dragged.kind===kind&&dragged.ids.includes(id))return;
   event.preventDefault();const source=dragged;dragged=null;
   const bounds=item.getBoundingClientRect(),position=event.clientY<bounds.top+bounds.height/2?'before':'after';
   if(source.kind==='track'&&kind==='playlist')onDropTracks({trackIds:source.ids,playlistId:id});
   else if(source.kind==='track'&&kind==='track')onReorderTracks({trackIds:source.ids,targetTrackId:id,position});
   else if(source.kind==='playlist'&&kind==='playlist')onReorderPlaylists({playlistIds:source.ids,targetPlaylistId:id,position});
  });
  listen(container,'dragend',()=>{dragged=null;});
  return {refresh,getSelected,clear,destroy(){for(const off of handlers)off();if(scrollFrame!==null)cancelFrame(scrollFrame);scrollFrame=null;if(box)box.remove();dragBox=null;dragged=null;}};
 }
 const api=Object.freeze({bind});if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PlaylistSelection=api;
})(typeof window==='undefined'?null:window);
