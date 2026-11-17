'use strict';
(()=>{
 const $=id=>document.getElementById(id),bridge=window.fullscreenBridge;
 let signature='',active=-2,followAfter=0,model={lyrics:[]},sceneVisible=false;
 const time=n=>{n=Math.max(0,Math.floor(n||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
 const control=(action,value)=>bridge.control({action,value});
 const fillVolume=()=>$('volume').style.setProperty('--volume-progress',Math.max(0,Math.min(100,Number($('volume').value)*100))+'%');$('volume').addEventListener('input',fillVolume);
 const background=window.MusicFullscreenBackground.create({video:$('background-video'),image:$('background-image'),status:$('background-status')});
 const wordClock=window.MusicWords.clock(paintWords);
 function paintWords(at){
  const line=model.lyrics?.[active],node=$('lyric-list').children[active];if(!line||!node)return;
  window.KaraokeLyrics.paint(node.querySelector('.original'),line,at);
  const translated=node.querySelector('small');if(translated)window.KaraokeLyrics.paintTranslation(translated,line,at);
 }
 function visibility(){const visible=sceneVisible&&!document.hidden;background.setVisible(visible);if(visible)wordClock.sample(model.time,model.playing);else wordClock.stop();}
 bridge.onVisibility?.(value=>{sceneVisible=!!value;visibility();});document.addEventListener('visibilitychange',visibility);
 bridge.preferences().then(({background:source,lyrics:s})=>{
  const style=document.documentElement.style;
  for(const [name,value] of Object.entries({'--lyric-color':s.originalColor,'--translation-color':s.translationColor,'--glow':s.glow+'px','--shadow':s.shadow,'--lyric-size':s.fontSize*1.25+'px','--translation-size':s.translationSize*1.25+'px','--lyric-line-height':s.lineHeight,'--lyric-align':s.align}))style.setProperty(name,String(value));
  document.body.classList.toggle('hide-original',!s.showOriginal);document.body.classList.toggle('hide-translation',!s.showTranslation);
  background.set(source);
 }).catch(()=>{$('background-status').hidden=false;$('background-status').textContent='背景设置读取失败，音乐播放不受影响。';});
 function follow(){const line=$('lyric-list').querySelector('.active');if(line&&Date.now()>=followAfter){$('lyrics').scrollTo({top:line.offsetTop-$('lyrics').offsetTop-$('lyrics').clientHeight/2+line.clientHeight/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}
 bridge.onState(s=>{
  model=s;document.body.classList.toggle('playing',s.playing);$('title').textContent=s.title||'让音乐降落';$('artist').textContent=s.artist||'选择一首喜欢的歌';
  if($('cover').getAttribute('src')!==s.cover)$('cover').src=s.cover||'../assets/avatar.png';
  $('state').textContent=s.error||s.alignmentNotice||(s.busy?'正在连接':s.playing?'正在播放':s.title?'已暂停':'等待播放');
  $('toggle-icon').setAttribute('d',s.playing?'M8 5h3v14H8ZM15 5h3v14h-3Z':'m9 5 11 7-11 7Z');
  $('toggle').title=s.playing?'暂停':'播放';$('toggle').setAttribute('aria-label',s.playing?'暂停':'播放');$('toggle').disabled=!!s.busy;$('seek').disabled=!s.duration;$('seek').max=String(s.duration||1);
  if(document.activeElement!==$('seek'))$('seek').value=s.time||0;if(document.activeElement!==$('volume'))$('volume').value=s.volume;
  $('elapsed').textContent=time(s.time);$('duration').textContent=time(s.duration);
  fillVolume();
  const next=JSON.stringify([s.key,(s.lyrics||[]).map(line=>[line.time,line.text,line.translation])]);
  if(next!==signature){signature=next;active=-2;followAfter=0;$('lyric-list').replaceChildren();
   for(const [i,line] of (s.lyrics||[]).entries()){const button=document.createElement('button');button.className='lyric';button.dataset.index=i;const original=document.createElement('span');original.className='original';original.textContent=line.text;button.append(original);if(line.translation){const small=document.createElement('small');small.textContent=line.translation;button.append(small);}button.onclick=()=>{if(Date.now()<suppressClick)return;followAfter=0;control('seek',line.time);};$('lyric-list').append(button);}
   if(!s.lyrics?.length){const p=document.createElement('p');p.className='empty';p.textContent=s.title?'这首歌暂时没有同步歌词，安心听音乐。':'选一首喜欢的歌，让音乐陪你。';$('lyric-list').append(p);$('lyrics').scrollTop=0;}
  }
  if(active!==s.index){
   if(active>=0){const old=$('lyric-list').children[active],line=s.lyrics?.[active];if(old&&line){window.KaraokeLyrics.clear(old.querySelector('.original'),line.text);if(old.querySelector('small'))window.KaraokeLyrics.clear(old.querySelector('small'),line.translation);}}
   active=s.index;for(const child of $('lyric-list').children){child.classList.toggle('active',Number(child.dataset.index)===active);child.classList.toggle('past',Number(child.dataset.index)<active);}follow();
  }
  wordClock.sample(s.time,sceneVisible&&!document.hidden&&s.playing);
 });
 $('cover').onerror=()=>{if(!$('cover').src.endsWith('/assets/avatar.png'))$('cover').src='../assets/avatar.png';};
 $('close').onclick=()=>control('close');$('toggle').onclick=()=>control('toggle');$('previous').onclick=()=>control('previous');$('next').onclick=()=>control('next');
 $('retry-lyrics').onclick=()=>control('retry-lyrics');
 $('seek').onchange=()=>{control('seek',Number($('seek').value));$('seek').blur();};$('volume').oninput=()=>control('volume',Number($('volume').value));
 let resume; $('lyrics').addEventListener('wheel',()=>{followAfter=Date.now()+3500;clearTimeout(resume);resume=setTimeout(follow,3600);},{passive:true});
 let drag=null,suppressClick=0;
 $('lyrics').addEventListener('pointerdown',e=>{if(e.button===0)drag={y:e.clientY,scroll:$('lyrics').scrollTop,moved:false};});
 $('lyrics').addEventListener('pointermove',e=>{if(!drag)return;const dy=e.clientY-drag.y;if(Math.abs(dy)>5){drag.moved=true;followAfter=Date.now()+3500;$('lyrics').setPointerCapture(e.pointerId);$('lyrics').scrollTop=drag.scroll-dy;}});
 const endDrag=()=>{if(drag?.moved){suppressClick=Date.now()+250;clearTimeout(resume);resume=setTimeout(follow,3600);}drag=null;};$('lyrics').addEventListener('pointerup',endDrag);$('lyrics').addEventListener('pointercancel',endDrag);
 window.addEventListener('resize',follow);
 document.addEventListener('dragstart',e=>e.preventDefault());
 document.addEventListener('keydown',e=>{if(e.key==='Escape')control('close');});
 window.addEventListener('beforeunload',()=>{wordClock.stop();background.dispose();clearTimeout(resume);});
})();
