'use strict';
const $=id=>document.getElementById(id);
$('close').onclick=()=>window.floatingBridge.close();
$('lock').onclick=()=>window.floatingBridge.lock(true);
window.floatingBridge.onText(info=>{
 $('name').textContent=info.title||'桌面歌词';
 $('lyric').textContent=info.line||'♪ 暂无同步歌词';
 $('translate').textContent=info.translation||'';
});
window.floatingBridge.onLocked(locked=>{$('lock').textContent=locked?'已锁定':'锁定'});
