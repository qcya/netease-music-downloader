'use strict';
const $=id=>document.getElementById(id);
let prefs=null;
let lastInfo={title:'桌面歌词',line:'播放音乐后将在这里显示歌词',translation:''};
let measurePending=false;
function measure(){
  if(measurePending)return;
  measurePending=true;
  requestAnimationFrame(()=>{
    measurePending=false;
    // scrollHeight is the full wrapped text height, not the current clipped viewport height.
    const content=$('widget');
    const height=Math.ceil(content.getBoundingClientRect().height+12);
    window.floatingBridge.resize(Math.max(88,height)).catch(()=>{});
  });
}
function paint(){
  const x=prefs||{};
  const root=document.documentElement.style;
  for(const [key,val] of Object.entries({
    '--original':x.originalColor||'#FFFFFF','--translated':x.translationColor||'#FFFFFF',
    '--outline':x.outlineColor||'#FFFFFF','--outline-width':`${x.outlineWidth??2}px`,
    '--shadow':`${x.shadow??2}px`,'--glow':`${x.glow??16}px`,'--original-size':`${x.fontSize??30}px`,
    '--translated-size':`${x.translationSize??18}px`,'--lyric-line-height':String(x.lineHeight??1.36),
    '--text-align':x.align||'center','--panel-opacity':String((x.opacity??100)/100)
  }))root.setProperty(key,val);
  $('widget').dataset.background=x.background||'none';
  const lyric=lastInfo.line||'♪ 暂无同步歌词';
  $('lyric').textContent=lyric;
  $('translate').textContent=lastInfo.translation||'';
  $('widget').dataset.locked=String(locked);
  const noLyrics=!lastInfo.line||lastInfo.line.includes('暂无同步歌词');
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
window.floatingBridge.getSettings().then(next=>{prefs=next;locked=!!next?.mouseThrough;paint()}).catch(()=>paint());
