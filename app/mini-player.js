'use strict';
const $=id=>document.getElementById(id);
for(const id of ['previous','toggle','next'])$(id).addEventListener('click',()=>window.miniBridge.control(id));
$('close').addEventListener('click',()=>window.miniBridge.close());
window.miniBridge.onState(data=>{
 $('name').textContent=data?.title||'还没有播放歌曲';
 $('artist').textContent=data?.artist||'';
 $('toggle').textContent=data?.playing?'❚❚':'▶';
});