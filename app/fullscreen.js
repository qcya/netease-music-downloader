'use strict';
(()=>{
 const $=id=>document.getElementById(id),bridge=window.fullscreenBridge;
 let signature='',active=-2,followAfter=0;
 const time=n=>{n=Math.max(0,Math.floor(n||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
 const control=(action,value)=>bridge.control({action,value});
 function follow(){const line=$('lyric-list').querySelector('.active');if(line&&Date.now()>=followAfter){$('lyrics').scrollTo({top:line.offsetTop-$('lyrics').offsetTop-$('lyrics').clientHeight/2+line.clientHeight/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}
 bridge.onState(s=>{
  document.body.classList.toggle('playing',s.playing);$('title').textContent=s.title||'让音乐降落';$('artist').textContent=s.artist||'从音乐库选一首喜欢的歌';
  if($('cover').getAttribute('src')!==s.cover)$('cover').src=s.cover||'../assets/avatar.png';
  $('state').textContent=(s.error|| (s.busy?'正在连接':s.playing?'正在播放':s.title?'已暂停':'等待播放'))+(s.previewOnly?' · 试听片段':'');
  $('toggle').textContent=s.playing?'暂停':'播放';$('toggle').disabled=!!s.busy;$('seek').disabled=!s.duration;$('seek').max=String(s.duration||1);
  if(document.activeElement!==$('seek'))$('seek').value=s.time||0;if(document.activeElement!==$('volume'))$('volume').value=s.volume;
  $('elapsed').textContent=time(s.time);$('duration').textContent=time(s.duration);
  const next=JSON.stringify([s.key,s.lyrics]);
  if(next!==signature){signature=next;active=-2;followAfter=0;$('lyric-list').replaceChildren();
   for(const [i,line] of (s.lyrics||[]).entries()){const button=document.createElement('button');button.className='lyric';button.dataset.index=i;button.textContent=line.text;if(line.translation){const small=document.createElement('small');small.textContent=line.translation;button.append(small);}button.onclick=()=>{followAfter=0;control('seek',line.time);};$('lyric-list').append(button);}
   if(!s.lyrics?.length){const p=document.createElement('p');p.className='empty';p.textContent=s.title?'这首歌暂时没有同步歌词，安心听音乐。':'选一首喜欢的歌，让音乐陪你。';$('lyric-list').append(p);$('lyrics').scrollTop=0;}
  }
  if(active!==s.index){active=s.index;for(const child of $('lyric-list').children)child.classList.toggle('active',Number(child.dataset.index)===active);follow();}
 });
 $('cover').onerror=()=>{if(!$('cover').src.endsWith('/assets/avatar.png'))$('cover').src='../assets/avatar.png';};
 $('close').onclick=()=>control('close');$('toggle').onclick=()=>control('toggle');$('previous').onclick=()=>control('previous');$('next').onclick=()=>control('next');
 $('seek').onchange=()=>{control('seek',Number($('seek').value));$('seek').blur();};$('volume').oninput=()=>control('volume',Number($('volume').value));
 let resume; $('lyrics').addEventListener('wheel',()=>{followAfter=Date.now()+3500;clearTimeout(resume);resume=setTimeout(follow,3600);},{passive:true});
 window.addEventListener('resize',follow);
 document.addEventListener('dragstart',e=>e.preventDefault());
 document.addEventListener('keydown',e=>{if(e.key==='Escape')control('close');if(e.code==='Space'&&!['INPUT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();control('toggle');}});
})();
