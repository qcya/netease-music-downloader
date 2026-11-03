'use strict';
const $=id=>document.getElementById(id),bridge=window.miniBridge,send=(type,extra={})=>bridge.control({type,...extra});
let state={},hideTimer,rowsKey='',tab='queue',previousVolume=.75,playlistKey='';
const time=n=>{n=Math.max(0,Math.floor(n||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
for(const id of ['previous','toggle','next'])$(id).onclick=()=>bridge.control(id);
$('show-main').onclick=()=>send('show-main');$('quit').onclick=()=>bridge.quit();
$('pin').onclick=()=>send('pin');$('collapse').onclick=()=>{if(state.pinned)send('pin');send('collapse');};
$('handle').onclick=()=>send('expand');
let down=null;
$('handle').onpointerdown=e=>{down=e.screenX;$('handle').setPointerCapture(e.pointerId);};
$('handle').onpointermove=e=>{if(down!==null&&down-e.screenX>12){down=null;send('expand');}};
$('handle').onpointerup=$('handle').onpointercancel=()=>{down=null;};
document.addEventListener('pointerenter',()=>clearTimeout(hideTimer));
document.addEventListener('pointerleave',()=>{clearTimeout(hideTimer);if(state.expanded&&!state.pinned)hideTimer=setTimeout(()=>send('collapse'),1000);});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('collapse').click();if(e.code==='Space'&&!['INPUT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();bridge.control('toggle');}});
$('seek').onchange=()=>send('seek',{value:Number($('seek').value)});
$('volume').oninput=()=>{const value=Number($('volume').value);$('volume-label').textContent=Math.round(value*100)+'%';send('volume',{value});};
$('mute').onclick=()=>{if(state.volume>0){previousVolume=state.volume;send('volume',{value:0});}else send('volume',{value:previousVolume});};
$('mode').onclick=()=>{const modes=['sequence','shuffle','repeat-one'];send('mode',{value:modes[(modes.indexOf(state.mode)+1)%modes.length]});};
for(const name of ['queue','library'])$('tab-'+name).onclick=()=>{tab=name;$('playlist').hidden=name!=='library';for(const t of ['queue','library'])$('tab-'+t).classList.toggle('selected',t===name);rowsKey='';send(name,name==='library'?{playlist:$('playlist').value||'all'}:{});};
$('playlist').onchange=()=>send('library',{playlist:$('playlist').value});
function renderRows(){
 const query=$('filter').value.trim().toLowerCase(),rows=(state.queue||[]).filter(s=>(s.title+' '+s.artist).toLowerCase().includes(query));
 const key=JSON.stringify([tab,query,rows]);if(key===rowsKey)return;rowsKey=key;
 $('songs').replaceChildren();$('count').textContent=rows.length+' 首';
 rows.forEach((song,i)=>{const button=document.createElement('button');button.className='song'+(song.active?' active':'');button.title=song.title;
 const number=document.createElement('span');number.className='number';number.textContent=song.active?'♫':String(i+1).padStart(2,'0');
 const text=document.createElement('span');text.className='text';const title=document.createElement('strong');title.textContent=song.title;const artist=document.createElement('small');artist.textContent=song.artist;
 text.append(title,artist);button.append(number,text);button.onclick=()=>send('select',{key:song.key});$('songs').append(button);});
 if(!rows.length){const empty=document.createElement('p');empty.className='empty';empty.textContent=tab==='library'?'本地还没有音乐，去音乐库导入或下载。':'打开音乐库选一首歌，队列会在这里出现。';$('songs').append(empty);}
}
$('filter').oninput=renderRows;
bridge.onState(data=>{
 const wasExpanded=state.expanded;state=data||{};
 $('handle').hidden=!!state.expanded;$('drawer').hidden=!state.expanded;
 if(state.expanded&&!wasExpanded)clearTimeout(hideTimer);
 $('name').textContent=state.title||'音乐，随手可及';$('name').title=state.title||'';$('artist').textContent=state.artist||'';
 const lists=JSON.stringify(state.playlists||[]);if(lists!==playlistKey){playlistKey=lists;const selected=$('playlist').value;$('playlist').replaceChildren();for(const item of [{id:'all',name:'全部本地音乐'},...(state.playlists||[])]){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;$('playlist').append(option);}$('playlist').value=selected||'all';}
 const cover=state.cover||'../assets/avatar.png';if($('cover').getAttribute('src')!==cover)$('cover').src=cover;
 $('cover').onerror=()=>{$('cover').src='../assets/avatar.png';};
 $('toggle').textContent=state.playing?'Ⅱ':'▶';$('toggle').setAttribute('aria-label',state.playing?'暂停':'播放');
 $('playing-badge').textContent=state.playing?'NOW PLAYING':'TAKE A BREATH';$('lyric').textContent=state.lyric||'给此刻一点旋律';$('trial').hidden=!state.previewOnly;
 $('current').textContent=time(state.time);$('duration').textContent=time(state.duration);
 $('seek').max=String(state.duration||1);$('seek').disabled=!state.duration;if(document.activeElement!==$('seek'))$('seek').value=String(state.time||0);
 if(document.activeElement!==$('volume'))$('volume').value=String(state.volume??.75);$('volume-label').textContent=Math.round((state.volume??.75)*100)+'%';
 $('pin').setAttribute('aria-pressed',String(!!state.pinned));$('pin').textContent=state.pinned?'◆':'◇';
 $('mode').textContent=({sequence:'顺序',shuffle:'随机','repeat-one':'单曲',reverse:'倒序','stop-after':'播完停'})[state.mode]||'顺序';renderRows();
});
