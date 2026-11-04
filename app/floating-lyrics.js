'use strict';
const $=id=>document.getElementById(id);
let prefs=null;
let lastInfo={title:'桌面歌词',line:'',translation:''};
let measurePending=false,shapeRevision=0,lastShape='';
function fitLyricSize(size,measured,available){
  const base=Math.max(1,Number(size)||1);
  if(!Number.isFinite(measured)||!Number.isFinite(available)||measured<=0||available<=0||measured<=available)return base;
  return Math.max(.1,base*available/measured*.995);
}
function fitLine(el,size){
  if(el.hidden||!el.textContent)return;
  const base=Math.max(1,Number(size)||1);el.style.fontSize=base+'px';
  const range=document.createRange();range.selectNodeContents(el);
  el.style.fontSize=fitLyricSize(base,range.getBoundingClientRect().width,el.clientWidth)+'px';
}
function textShape(){
  const rects=[];
  for(const id of ['lyric','translate']){
    const el=$(id);if(el.hidden||!el.textContent.trim())continue;
    const range=document.createRange();range.selectNodeContents(el);
    for(const r of range.getClientRects()){
      if(!r.width||!r.height)continue;
      // Preserve the halo while limiting mouse capture to the words nearby.
      const pad=32;rects.push({x:Math.floor(r.left-pad),y:Math.floor(r.top-pad),width:Math.ceil(r.right+pad)-Math.floor(r.left-pad),height:Math.ceil(r.bottom+pad)-Math.floor(r.top-pad)});
    }
  }
  return rects.slice(0,64);
}
function measure(){
  if(measurePending)return;
  measurePending=true;
  requestAnimationFrame(()=>{
    measurePending=false;
    // scrollHeight is the full wrapped text height, not the current clipped viewport height.
    const content=$('widget');
    fitLine($('lyric'),prefs?.fontSize??30);fitLine($('translate'),prefs?.translationSize??18);
    const height=Math.ceil(content.getBoundingClientRect().height+12);
    const revision=++shapeRevision,rects=textShape();
    window.floatingBridge.resize(Math.max(88,height)).then(()=>{
      if(revision!==shapeRevision)return;
      const key=JSON.stringify(rects);if(key!==lastShape){lastShape=key;window.floatingBridge.setShape(rects);}
    }).catch(()=>{});
  });
}
function paint(){
  const x=prefs||{};
  const root=document.documentElement.style;
  for(const [key,val] of Object.entries({
    '--original':x.originalColor||'#FFFFFF','--translated':x.translationColor||'#FFFFFF',
    '--outline':x.outlineColor||'#FFFFFF','--outline-width':`${x.outlineWidth??0}px`,
    '--shadow':`${x.shadow??2}px`,'--lyric-shadow-scale':String(x.shadow??2),'--glow':`${x.glow??14}px`,
    '--lyric-primary-color':x.originalColor||'#FFFFFF','--lyric-secondary-color':x.translationColor||'#FFFFFF',
    '--lyric-glow-radius':`${x.glow??14}px`,'--original-size':`${x.fontSize??30}px`,
    '--translated-size':`${x.translationSize??18}px`,'--lyric-line-height':String(x.lineHeight??1.28),
    '--text-align':x.align||'center','--panel-opacity':String((x.opacity??100)/100)
  }))root.setProperty(key,val);
  $('widget').dataset.background=x.background||'none';
  const noLyrics=!(lastInfo.line||'').trim();
  const lyric=noLyrics&&x.autoHideEmpty!==true&&lastInfo.title!=='桌面歌词'?'♪ 暂无同步歌词':lastInfo.line||'';
  $('lyric').textContent=lyric.replace(/\s*\n\s*/g,' ');
  $('translate').textContent=(lastInfo.translation||'').replace(/\s*\n\s*/g,' ');
  $('widget').dataset.locked=String(locked);
  $('widget').hidden=noLyrics&&(x.autoHideEmpty===true||lastInfo.title==='桌面歌词');
  $('lyric').hidden=x.showOriginal===false||(x.autoHideEmpty===true&&noLyrics);
  $('translate').hidden=x.showTranslation===false||!lastInfo.translation;
  measure();
}
// Do not use -webkit-app-region:drag: Windows suppresses right-click in draggable areas.
// Cursor position is read by the main process, and the entire transparent overlay is draggable.
let dragging=false,locked=false;
function endDrag(){if(!dragging)return;dragging=false;window.floatingBridge.dragEnd();}
document.body.addEventListener('pointerdown',event=>{
  if(event.button!==0||locked)return;
  dragging=true;
  document.getSelection()?.removeAllRanges(); // Prevent selection highlight strips during overlay dragging.
  document.body.setPointerCapture?.(event.pointerId);
  window.floatingBridge.dragBegin();
});
document.body.addEventListener('pointermove',event=>{
  if(dragging&&event.buttons&1)window.floatingBridge.dragMove();
});
document.body.addEventListener('pointerup',endDrag);
document.body.addEventListener('pointercancel',endDrag);
window.addEventListener('blur',endDrag);
document.body.addEventListener('contextmenu',event=>{
  event.preventDefault();if(locked)return;endDrag();window.floatingBridge.showMenu();
});
window.floatingBridge.onText(info=>{lastInfo=info||lastInfo;paint()});
window.floatingBridge.onSettings(next=>{prefs=next;locked=!!next?.mouseThrough;paint()});
window.floatingBridge.onLocked(value=>{locked=!!value;$('widget').dataset.locked=String(locked)});
window.addEventListener('resize',measure);
new ResizeObserver(measure).observe($('widget'));
document.fonts?.ready.then(paint).catch(()=>{});
window.floatingBridge.getSettings().then(next=>{prefs=next;locked=!!next?.mouseThrough;paint()}).catch(()=>paint());
