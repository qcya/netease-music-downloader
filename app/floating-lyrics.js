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
    const height=Math.ceil(content.scrollHeight+10);
    window.floatingBridge.resize(Math.max(88,height)).catch(()=>{});
  });
}
function paint(){
  const x=prefs||{};
  const root=document.documentElement.style;
  for(const [key,val] of Object.entries({
    '--original':x.originalColor||'#F6A8C8','--translated':x.translationColor||'#AFCFFF',
    '--outline':x.outlineColor||'#FFFFFF','--outline-width':`${x.outlineWidth??2}px`,
    '--shadow':`${x.shadow??2}px`,'--original-size':`${x.fontSize??30}px`,
    '--translated-size':`${x.translationSize??18}px`,'--lyric-line-height':String(x.lineHeight??1.36),
    '--text-align':x.align||'center','--panel-opacity':String((x.opacity??100)/100)
  }))root.setProperty(key,val);
  $('widget').dataset.background=x.background||'none';
  $('name').textContent=lastInfo.title||'桌面歌词';
  const lyric=lastInfo.line||'♪ 暂无同步歌词';
  $('lyric').textContent=lyric;
  $('translate').textContent=lastInfo.translation||'';
  const noLyrics=!lastInfo.line||lastInfo.line.includes('暂无同步歌词');
  $('lyric').hidden=x.showOriginal===false||(x.autoHideEmpty===true&&noLyrics);
  $('translate').hidden=x.showTranslation===false||!lastInfo.translation;
  measure();
}
$('close').onclick=()=>window.floatingBridge.close();
$('lock').onclick=()=>window.floatingBridge.lock(true);
window.floatingBridge.onText(info=>{lastInfo=info||lastInfo;paint()});
window.floatingBridge.onSettings(next=>{prefs=next;paint()});
window.floatingBridge.onLocked(locked=>{$('lock').textContent=locked?'已锁定':'锁定';$('widget').dataset.locked=String(locked);measure()});
window.addEventListener('resize',measure);
new ResizeObserver(measure).observe($('widget'));
window.floatingBridge.getSettings().then(next=>{prefs=next;paint()}).catch(()=>paint());
