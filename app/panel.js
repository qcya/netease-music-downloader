'use strict';
(()=>{
 const $=id=>document.getElementById(id),bridge=window.musicBridge,audio=$('music-audio');
 let settings=null,tab='local',files=[],categories={categories:[],assignments:{},order:[]},lists=[],rows=[],searchPage=1,total=0,batch=0,loadSerial=0,lyrics=[],lyricIndex=-1,currentHeight=740,lastTrackKey='',lastPlaying=false,lastBusy=false,mutedVolume=.75,libraryChoice='all';
 const availability=new Map(),tasks=new Map();let seeking=false,taskRenderTimer=null;
 const sheet=document.querySelector('.panel');let slide=null;
 bridge.onPanelReveal(({progress,animate})=>{
  const from=getComputedStyle(sheet).transform;slide?.cancel();
  const target='translateY('+((progress-1)*100)+'%)';sheet.style.transform=target;
  if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)slide=sheet.animate([{transform:from},{transform:target}],{duration:460,easing:'cubic-bezier(.16,1,.3,1)'});
 });
 let fullscreenActive=false,lyricsKey='';
 function fullscreenState(s=player.state()){
  const lines=s.track?.key===lyricsKey?lyrics:[];
  let index=-1;for(let n=0;n<lines.length&&lines[n].time<=s.time+.05;n++)index=n;
  return {key:s.track?.key||'',title:s.track?.name||'',artist:s.track?.artists||'',cover:coverURL(s.track?.cover_url),previewOnly:!!s.track?.previewOnly,playing:s.playing,busy:s.busy,error:s.error,time:s.time,duration:s.duration,volume:s.volume,lyrics:lines,index};
 }
 function publishFullscreen(s){if(fullscreenActive)bridge.updateFullscreen(fullscreenState(s));}
 let session={},lastSave=0;try{session=JSON.parse(localStorage.getItem('orbit-session')||'{}');}catch{}
 function saveSession(s,force=false){if(!force&&Date.now()-lastSave<2000)return;lastSave=Date.now();try{localStorage.setItem('orbit-session',JSON.stringify({file:s.track?.local?s.track.file:null,time:s.time,mode:s.mode,volume:s.volume}));}catch{}}
 const status=(text,error=false)=>{$('status').textContent=text;$('status').title=text;$('status').classList.toggle('error',error);};
 const safe=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>status(e.message||String(e),true));
 const clean=name=>String(name||'').replace(/\s*\[歌单\]/g,'').replace(/\s*\[\d+\](?=\.[^.]+$)/,'').replace(/\.[^.]+$/,'');
 const time=n=>{n=Math.max(0,Math.floor(n||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
 const coverURL=url=>{try{const u=new URL(url);return u.protocol==='https:'&&/(^|\.)music\.(126|163)\.net$/.test(u.hostname)?u.href:'../assets/avatar.png';}catch{return '../assets/avatar.png';}};
 const localRow=f=>({key:'local:'+f.name,local:true,file:f.name,name:clean(f.name),artists:'本地音乐',conflict:f.conflict});
 const onlineRow=s=>({...s,key:'online:'+s.id,id:String(s.id),local:false});
 const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 function promptDialog(title,{message='',value='',choices=null,maxLength=32}={}){
  return new Promise(resolve=>{const d=$('dialog');$('dialog-title').textContent=title;$('dialog-message').textContent=message;$('dialog-input').hidden=!!choices;$('dialog-select').hidden=!choices;
   $('dialog-input').value=value;$('dialog-input').maxLength=maxLength;$('dialog-select').replaceChildren();for(const c of choices||[]){const o=element('option','',c.name);o.value=c.id;$('dialog-select').append(o);}
   d.returnValue='';d.addEventListener('close',()=>resolve(d.returnValue==='ok'?(choices?$('dialog-select').value:$('dialog-input').value.trim()):null),{once:true});d.showModal();
  });
 }
 const player=window.OrbitPlayer.createPlayer({audio,bridge,onState:drawPlayer,onTrack:(track,token)=>{void loadLyrics(track,token);}});
 function drawPlayer(s){
  saveSession(s);
  publishFullscreen(s);
  document.body.classList.toggle('playing',s.playing);$('signal-label').textContent=s.busy?'正在连接':s.playing?'正在播放':s.track?'已暂停':'等待播放';
  $('play-path').setAttribute('d',s.playing?'M8 5h3v14H8ZM15 5h3v14h-3Z':'m9 5 11 7-11 7Z');$('play').disabled=s.busy;
  $('track-title').textContent=s.track?.name||'让音乐降落';$('track-title').title=s.track?.name||'';$('track-artist').textContent=s.track?.artists||'从下面选一首，留给此刻。';
  $('track-source').textContent=s.track?(s.track.local?'本地音乐':s.track.fromLocal?'已下载 · 本地播放':'在线播放'):'点击封面打开全屏歌词';
  const art=coverURL(s.track?.cover_url);if($('cover').getAttribute('src')!==art)$('cover').src=art;
  $('cover').onerror=()=>{$('cover').src='../assets/avatar.png';};$('preview-tag').hidden=!s.track?.previewOnly;
  $('track-format').textContent=s.track?.previewOnly?'试听片段':s.track?.local||s.track?.fromLocal?'本地':s.track?'在线':'待播放';
  $('elapsed').textContent=time(s.time);$('duration').textContent=time(s.duration);$('seek').disabled=!s.duration;$('seek').max=String(s.duration||1);
  if(!seeking)$('seek').value=String(s.time);$('volume').value=String(s.volume);
  $('mode').textContent=({sequence:'顺序',shuffle:'随机','repeat-one':'单曲',reverse:'倒序','stop-after':'播完停'})[s.mode];
  if(s.error)status(s.error,true);else if(s.busy)status('正在连接「'+s.track.name+'」…');
  if(lastTrackKey!==s.track?.key||lastPlaying!==s.playing||lastBusy!==s.busy){
   lastTrackKey=s.track?.key;lastPlaying=s.playing;lastBusy=s.busy;
   for(const row of $('track-list').children)row.classList.toggle('current',row.dataset.key===s.track?.key);
   if(s.track&&!s.busy&&!s.error)status(s.track.previewOnly?'正在试听片段 · '+s.track.name:(s.playing?'正在播放 · ':'已暂停 · ')+s.track.name);
  }
 }
 async function loadLyrics(track,token){
  lyrics=[];lyricIndex=-1;$('lyric-line').textContent='正在寻找这首歌的歌词…';$('lyrics-list').replaceChildren();
  lyricsKey=track.key;publishFullscreen();
  if(settings?.desktopLyricsEnabled)void bridge.updateFloatingLyrics({line:'',translation:''}).catch(()=>{});
  try{
   let data=track.local||track.fromLocal?await bridge.localLyrics(track.file||track.localFile):null;
   if(!data?.found&&track.id)data=await(track.local?bridge.fetchLyrics(track.id):bridge.fetchLyricsMemory(track.id));
   if(token!==player.serial())return;
   lyrics=window.MusicLRC.parseLrc(data?.lrc||'',data?.translated_lrc||'');
   publishFullscreen();
   if(!lyrics.length){$('lyric-line').textContent='此刻，专注听旋律。';$('lyrics-list').append(element('p','empty','这首歌暂时没有同步歌词。'));return;}
   for(const [i,line] of lyrics.entries()){const button=element('button','lyric-item',line.text);if(line.translation)button.append(element('small','',line.translation));button.onclick=()=>{if(Number.isFinite(audio.duration)&&line.time<audio.duration)audio.currentTime=line.time;};button.dataset.index=i;$('lyrics-list').append(button);}
   syncLyrics();
  }catch{if(token===player.serial())$('lyric-line').textContent='歌词暂时未连接，音乐继续。';}
 }
 function syncLyrics(){
  let i=-1;for(let n=0;n<lyrics.length&&lyrics[n].time<=audio.currentTime+.05;n++)i=n;if(i===lyricIndex)return;lyricIndex=i;
  const line=lyrics[i];$('lyric-line').textContent=line?.text||'此刻，专注听旋律。';
  for(const child of $('lyrics-list').children)child.classList.toggle('active',Number(child.dataset.index)===i);
  if(settings?.desktopLyricsEnabled)void bridge.updateFloatingLyrics({line:line?.text||'',translation:line?.translation||''}).catch(()=>{});
 }
 function empty(title,detail=''){const box=element('div','empty');box.append(element('strong','',title),element('span','',detail));return box;}
 function renderRows(){
  const query=$('query').value.trim().toLowerCase(),visible=tab==='search'?rows:rows.filter(s=>(s.name+' '+s.artists).toLowerCase().includes(query));
  $('track-list').replaceChildren();$('list-count').textContent=visible.length+' 首';
  if(!visible.length){$('track-list').append(empty(tab==='local'?'你的音乐，等你放进来':tab==='search'?'寻找下一段旋律':'暂时没有更多歌曲',tab==='local'?'点击「导入」，添加本地文件；或去搜索喜欢的歌。':tab==='search'?'输入歌名或歌手，按 Enter 搜索。':'试试刷新，或换一个歌单。'));return;}
  const fragment=document.createDocumentFragment();
  for(const [i,song] of visible.entries()){
   const row=element('article','track-row'+(player.state().track?.key===song.key?' current':''));row.dataset.key=song.key;
   const play=element('button','row-play');play.title='播放 '+song.name;play.setAttribute('aria-label','播放 '+song.name);play.disabled=!!song.conflict;
   play.append(element('span','row-number',String(i+1).padStart(2,'0')));
   if(song.cover_url){const img=element('img','row-cover');img.src=coverURL(song.cover_url);img.alt='';img.loading='lazy';img.onerror=()=>img.remove();play.append(img);}
   const info=element('span','row-info');info.append(element('strong','',song.name),element('small','',song.reason||song.artists||'本地音乐'));play.append(info);
   play.onclick=safe(()=>player.play(song,visible,{allowTrial:true}));
   row.append(play);
   if(!song.local){const known=availability.get(song.id),label=element('span','row-state',known?.fromLocal?'本地可播':known?.trialAvailable?'试听片段':known?.state==='unavailable'?'在线未就绪':'');label.title=known?.reason||'';row.append(label);}
   const action=element('button','row-action',song.local?'⋯':'↓');action.title=song.local?'歌单操作':'下载这首歌';action.setAttribute('aria-label',action.title+' '+song.name);
   action.onclick=safe(()=>song.local?manageTrack(song):download(song,action));row.append(action);fragment.append(row);
  }
  $('track-list').append(fragment);
 }
 async function probeRows(expected){
  const ids=rows.filter(s=>!s.local).map(s=>s.id);
  for(let i=0;i<ids.length;i+=40){try{const found=await bridge.mediaAvailability(ids.slice(i,i+40));if(expected!==loadSerial)return;found.forEach(s=>availability.set(s.id,s));renderRows();}catch{}}
 }
 async function refreshLocal(){
  const [newFiles,newCategories,newLists]=await Promise.all([bridge.listFiles(),bridge.playlistCategoriesList(),bridge.playlistsList()]);
  files=newFiles;categories=newCategories;lists=newLists;
  $('playlist').replaceChildren();for(const c of [{id:'all',name:'全部本地音乐'},{id:'default',name:categories.defaultName||'未分类歌单'},...categories.categories]){const o=element('option','',c.name);o.value=c.id;$('playlist').append(o);}
  if(![...$('playlist').options].some(o=>o.value===libraryChoice))libraryChoice='all';$('playlist').value=libraryChoice;
 }
 function hideSheets(){for(const id of ['settings-view','tasks-view','lyrics-view'])$(id).hidden=true;$('browser').hidden=false;}
 async function loadTab(next=tab){
  tab=next;const request=++loadSerial;hideSheets();$('query').value='';$('library-tools').hidden=tab!=='local';$('online-tools').hidden=!['search','recent'].includes(tab);$('search-submit').hidden=tab!=='search';$('search-submit').disabled=false;$('pagination').hidden=true;
  $('query').placeholder=tab==='search'?'搜索歌曲、歌手…':tab==='local'?'筛选音乐库…':'筛选当前列表…';
  for(const button of document.querySelectorAll('[data-tab]'))button.classList.toggle('active',button.dataset.tab===tab);
  $('list-title').textContent=({local:'我的音乐',recent:'最近发行',search:'搜索结果',queue:'接下来播放'})[tab];
  rows=[];$('track-list').replaceChildren(empty('正在载入…'));
  try{
   if(tab==='local'){await refreshLocal();if(request!==loadSerial)return;rows=window.MusicPlaylistQueue.libraryFiles(files,lists,categories,libraryChoice).map(localRow);}
   else if(tab==='queue')rows=player.state().rows;
   else if(tab==='recent'){const data=await bridge.discovery({category:'recent',batch});if(request!==loadSerial)return;rows=data.songs.map(onlineRow);status(data.message,data.offline);$('pagination').hidden=false;$('page-label').textContent='第 '+(batch+1)+' 批';$('page-prev').disabled=batch===0;$('page-next').disabled=(batch+1)*8>=data.poolSize;}
   if(request!==loadSerial)return;renderRows();void probeRows(request);
  }catch(e){if(request===loadSerial){$('track-list').replaceChildren(empty('暂时没有连接上',e.message));status(e.message,true);}}
 }
 async function search(){
  const query=$('query').value.trim();if(!query)return;if(tab!=='search'){await loadTab('search');$('query').value=query;}
  const request=++loadSerial;$('search-submit').disabled=true;status('正在搜索「'+query+'」…');
  try{const data=await bridge.search(query,searchPage);if(request!==loadSerial)return;rows=(data.results||[]).map(onlineRow);total=data.total||rows.length;renderRows();$('pagination').hidden=false;$('page-label').textContent='第 '+searchPage+' 页';$('page-prev').disabled=searchPage===1;$('page-next').disabled=searchPage*40>=total;status('找到 '+total+' 首歌曲');void probeRows(request);}
  finally{if(request===loadSerial)$('search-submit').disabled=false;}
 }
 async function manageTrack(song){
  const choices=[{id:'add',name:'加入歌单'},{id:'remove',name:'从歌单移出（保留文件）'}];const choice=await promptDialog(song.name,{message:'整理音乐，不会删除原文件。',choices});if(!choice)return;
  const target=choice==='add'?await promptDialog('加入哪个歌单？',{choices:[{id:'default',name:categories.defaultName||'未分类'},...categories.categories]}):null;if(choice==='add'&&!target)return;
  const prior=player.state(),release=prior.track?.local&&prior.track.file===song.file;let lease;
  // Chromium can keep a paused local file open on Windows. Release it before rename.
  if(release){player.stop();lease=player.serial();await new Promise(resolve=>{audio.addEventListener('emptied',resolve,{once:true});audio.removeAttribute('src');audio.load();setTimeout(resolve,150);});}
  try{
   if(choice==='remove'){await bridge.playlistsRemove('default',song.file);player.renameLocal(song.file,song.file.replace(/^\[歌单\] /,''));}
   else{await bridge.playlistsAdd('default',song.file);const name=song.file.startsWith('[歌单] ')?song.file:'[歌单] '+song.file;player.renameLocal(song.file,name);await bridge.playlistCategoryMove(name,target==='default'?null:target);}
  }finally{if(release&&player.serial()===lease)await player.play(player.state().track,null,{paused:!prior.playing,resumeTime:prior.time});}
  await loadTab('local');status('歌单已更新');
 }
 async function download(song,button){
  button.disabled=true;status('已加入下载任务 · '+song.name);try{const result=await bridge.download([song.id],[song]);status(result.ok?'下载完成 · '+song.name:result.results?.find(r=>!r.ok)?.error||'下载未完成',!result.ok);await refreshLocal();}finally{button.disabled=false;}
 }
 function showSheet(id){$('browser').hidden=true;for(const name of ['settings-view','tasks-view','lyrics-view'])$(name).hidden=name!==id;}
 function renderTasks(){
  $('task-list').replaceChildren();const entries=[...tasks.values()].sort((a,b)=>(b.time||0)-(a.time||0));$('task-badge').hidden=!entries.some(t=>['running','queued'].includes(t.status));
  if(!entries.length){$('task-list').append(empty('还没有下载任务','在搜索结果中点击 ↓ 即可下载。'));return;}
  for(const t of entries){const item=element('div','task');item.append(element('strong','',t.song?.name||(t.name&&t.name!==String(t.id)?t.name:'歌曲名称暂不可用')),element('p','',({running:'正在下载',queued:'排队中',done:'下载完成',completed:'下载完成',failed:'下载失败',cancelled:'已取消'})[t.status]||t.status));if(t.artists||t.song?.artists)item.append(element('p','',t.artists||t.song.artists));
   const p=t.progress;if(t.status==='running'&&p&&typeof p.percent==='number'&&Number.isFinite(p.percent)){const percent=Math.max(0,Math.min(100,p.percent)),bar=element('progress','task-progress');bar.max=100;bar.value=percent;bar.setAttribute('aria-label','下载进度');item.append(bar,element('p','',Math.round(percent)+'%'+(Number.isFinite(p.speed)&&p.speed>0?' · '+(p.speed/1048576).toFixed(2)+' MB/s':'')));}
   if(t.error)item.append(element('p','',t.error));const button=element('button','',t.status==='failed'?'重试':'取消');button.hidden=!['failed','running','queued'].includes(t.status);button.onclick=safe(()=>t.status==='failed'?bridge.retryDownload(String(t.id)):bridge.cancelDownload(String(t.id)));item.append(button);$('task-list').append(item);}
 }
 function gesture(node,kind){
  let held=false;node.addEventListener('pointerdown',e=>{if(e.button!==0||kind==='move'&&e.target.closest('button'))return;held=true;node.setPointerCapture(e.pointerId);bridge.panelAction({type:'begin',kind,native:true,x:window.screenX+e.clientX,y:window.screenY+e.clientY});});
  node.addEventListener('pointermove',e=>{if(held)bridge.panelAction({type:'move',x:window.screenX+e.clientX,y:window.screenY+e.clientY});});
  node.addEventListener('pointerup',()=>{if(held){held=false;bridge.panelAction({type:'end'});}});for(const event of ['pointercancel','lostpointercapture'])node.addEventListener(event,()=>{if(held){held=false;bridge.panelAction({type:'cancel'});}});
 }
 gesture($('resize-grip'),'resize');gesture($('anchor'),'move');
 $('resize-grip').onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();bridge.panelAction({type:'height',value:currentHeight+(e.key==='ArrowDown'?30:-30)});}};
 bridge.onPanelState(s=>{currentHeight=s.height;$('height-label').textContent=Math.round(s.height);});
 $('collapse').onclick=()=>bridge.panelAction({type:'collapse'});$('quit').onclick=()=>bridge.windowAction('quit');
 $('length-preset').onchange=()=>bridge.panelAction({type:'height',value:Number($('length-preset').value)});
 for(const button of document.querySelectorAll('[data-tab]'))button.onclick=safe(()=>{batch=0;searchPage=1;return loadTab(button.dataset.tab);});
 $('playlist').onchange=safe(()=>{libraryChoice=$('playlist').value;rows=window.MusicPlaylistQueue.libraryFiles(files,lists,categories,libraryChoice).map(localRow);renderRows();});
 $('query').oninput=()=>{if(tab!=='search')renderRows();};
 // Prevent submit synchronously before entering the async error boundary.
 $('search-form').onsubmit=e=>{e.preventDefault();searchPage=1;void safe(search)();};
 $('refresh').onclick=safe(()=>tab==='search'?search():loadTab());
 $('page-next').onclick=safe(()=>{if(tab==='search'){searchPage++;return search();}batch++;return loadTab();});$('page-prev').onclick=safe(()=>{if(tab==='search'){searchPage=Math.max(1,searchPage-1);return search();}batch=Math.max(0,batch-1);return loadTab();});
 $('import').onclick=safe(async()=>{const kind=await promptDialog('导入本地音乐',{choices:[{id:'files',name:'选择音乐文件'},{id:'folder',name:'选择整个文件夹'}]});if(!kind)return;const result=await bridge.importLocal(kind);if(!result.canceled){await loadTab('local');status('已导入 '+result.imported+' 首音乐');}});
 $('load-online-playlist').onclick=safe(async()=>{const id=await promptDialog('打开网易云歌单',{message:'粘贴歌单链接或歌单 ID。',maxLength:300});if(!id)return;const request=++loadSerial;status('正在读取歌单…');const data=await bridge.playlist(id);if(request!==loadSerial)return;rows=(data.tracks||[]).map(onlineRow);$('query').value='';$('pagination').hidden=true;renderRows();void probeRows(request);status((data.possibly_incomplete?'接口仅返回部分歌单 · ':'歌单已载入 · ')+rows.length+' 首',data.possibly_incomplete);});
 $('download-list').onclick=safe(async()=>{const ids=rows.filter(s=>!s.local).map(s=>s.id);if(!ids.length){status('当前列表没有可下载的歌曲');return;}status('已加入 '+ids.length+' 首下载任务');$('download-list').disabled=true;try{let success=0,failed=0;for(let i=0;i<ids.length;i+=100){const result=await bridge.download(ids.slice(i,i+100),rows.filter(s=>ids.slice(i,i+100).includes(s.id)));success+=result.success_count;failed+=result.failed_count;}status('下载完成 '+success+' 首，失败 '+failed+' 首',failed>0);await refreshLocal();}finally{$('download-list').disabled=false;}});
 $('new-playlist').onclick=safe(async()=>{const name=await promptDialog('新建歌单');if(name){await bridge.playlistCategoryCreate(name);await loadTab('local');}});
 $('playlist-menu').onclick=safe(async()=>{
  if(libraryChoice==='all'){status('请先选择一个具体歌单，再管理它。');return;}
  const action=await promptDialog('管理歌单',{choices:[{id:'rename',name:'重命名'},...(libraryChoice==='default'?[]:[{id:'delete',name:'删除歌单分类（保留歌曲）'}])]});
  if(action==='rename'){const name=await promptDialog('新的歌单名称');if(name)await(libraryChoice==='default'?bridge.playlistRenameDefault(name):bridge.playlistCategoryRename(libraryChoice,name));}
  else if(action==='delete'){await bridge.playlistCategoryDelete(libraryChoice);libraryChoice='all';}await loadTab('local');
 });
 $('play').onclick=safe(()=>player.toggle());$('previous').onclick=safe(()=>player.step(-1));$('next').onclick=safe(()=>player.step(1));
 $('mode').onclick=()=>{const modes=['sequence','shuffle','repeat-one','reverse','stop-after'];player.setMode(modes[(modes.indexOf(player.state().mode)+1)%modes.length]);};
 $('seek').addEventListener('pointerdown',()=>{seeking=true;});for(const name of ['pointerup','pointercancel','lostpointercapture'])$('seek').addEventListener(name,()=>{seeking=false;});
 $('seek').onchange=()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(Number($('seek').value),audio.duration);};
 $('volume').oninput=()=>{audio.volume=Number($('volume').value);};$('mute').onclick=()=>{if(audio.volume){mutedVolume=audio.volume;audio.volume=0;}else audio.volume=mutedVolume;};
 const openFullscreen=()=>bridge.openFullscreen(fullscreenState());
 $('open-fullscreen').onclick=openFullscreen;$('lyric-line').onclick=openFullscreen;
 bridge.onFullscreenActive(active=>{fullscreenActive=active;publishFullscreen();});
 bridge.onFullscreenControl(safe(message=>{
  if(message.action==='retry-lyrics'){const t=player.state().track;if(t)return loadLyrics(t,player.serial());}
  if(message.action==='toggle')return player.toggle();
  if(message.action==='previous')return player.step(-1);
  if(message.action==='next')return player.step(1);
  if(message.action==='seek'&&Number.isFinite(audio.duration)){audio.currentTime=Math.max(0,Math.min(message.value,audio.duration));syncLyrics();player.emit();}
  if(message.action==='volume')audio.volume=Math.max(0,Math.min(1,message.value));
 }));
 document.addEventListener('dragstart',e=>{if(!e.target.closest('input,textarea,[contenteditable="true"]'))e.preventDefault();});
 $('tasks-button').onclick=safe(async()=>{(await bridge.downloadHistory()).forEach(t=>{const key=t.key||t.id,old=tasks.get(key);if(!old||(old.time||0)<(t.time||0))tasks.set(key,t);});renderTasks();showSheet('tasks-view');});
 $('settings-button').onclick=safe(async()=>{settings=await bridge.getSettings();$('download-dir').value=settings.downloadDir;$('parallel').value=settings.parallelDownloads;$('api-bases').value=settings.apiBases.join('\n');$('desktop-lyrics').checked=settings.desktopLyricsEnabled;$('lock-lyrics').checked=settings.floatingLyrics.mouseThrough;fillAppearance();showSheet('settings-view');});
 for(const b of document.querySelectorAll('.back-button'))b.onclick=hideSheets;
 $('choose-dir').onclick=safe(async()=>{const dir=await bridge.chooseDirectory();if(dir)$('download-dir').value=dir;});$('open-dir').onclick=safe(()=>bridge.openDirectory());
 $('save-settings').onclick=safe(async()=>{settings=await bridge.saveSettings({...settings,downloadDir:$('download-dir').value,apiBases:$('api-bases').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),parallelDownloads:Number($('parallel').value),desktopLyricsEnabled:$('desktop-lyrics').checked,floatingLyrics:readAppearance()});
  if(settings.desktopLyricsEnabled)await bridge.showFloatingLyrics();else await bridge.closeFloatingLyrics();await bridge.lockFloatingLyrics($('lock-lyrics').checked);availability.clear();status('设置已保存');});

 function fillAppearance(){
  $('player-bg-path').value=settings.playerBackgroundPath||'原版动态背景';const s=settings.floatingLyrics;
  for(const [id,key] of Object.entries({'lyric-color':'originalColor','translation-color':'translationColor','lyric-size':'fontSize','translation-size':'translationSize','lyric-glow':'glow','lyric-shadow':'shadow'}))$(id).value=s[key];
  $('show-original').checked=s.showOriginal;$('show-translation').checked=s.showTranslation;
 }
 function readAppearance(){return {...settings.floatingLyrics,originalColor:$('lyric-color').value,translationColor:$('translation-color').value,fontSize:Number($('lyric-size').value),translationSize:Number($('translation-size').value),glow:Number($('lyric-glow').value),shadow:Number($('lyric-shadow').value),showOriginal:$('show-original').checked,showTranslation:$('show-translation').checked};}
 $('choose-background').onclick=safe(async()=>{const result=await bridge.choosePlayerBackground();if(result){settings.playerBackgroundPath=result.path;$('player-bg-path').value=result.path;status('背景已更新，打开全屏即可查看');}});
 $('clear-background').onclick=safe(async()=>{await bridge.clearPlayerBackground();settings.playerBackgroundPath='';$('player-bg-path').value='原版动态背景';status('已恢复原版动态背景');});
 $('retry-current-lyrics').onclick=safe(()=>{const track=player.state().track;if(track)return loadLyrics(track,player.serial());});
 $('accept').onclick=safe(async()=>{settings=await bridge.saveSettings({...settings,disclaimerAcceptedVersion:1});$('welcome').close();});
 document.onkeydown=e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))bridge.panelAction({type:'collapse'});if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();void player.toggle();}};
 audio.ontimeupdate=()=>{player.emit();syncLyrics();};audio.onvolumechange=()=>player.emit();audio.onloadedmetadata=()=>player.emit();
 for(const event of ['play','pause','ended'])audio.addEventListener(event,()=>{player.emit();saveSession(player.state(),true);void bridge.setPlaybackState(!audio.paused).catch(()=>{});});
 window.addEventListener('beforeunload',()=>saveSession(player.state(),true));
 audio.onended=()=>{void player.step(1,'ended');};audio.onerror=()=>{if(audio.src)status('这首歌暂时无法播放，可以重新选择或检测音源。',true);};
 bridge.onDownloadTask(t=>{tasks.set(t.key||t.id,{...t,time:t.time||Date.now()});$('task-badge').hidden=![...tasks.values()].some(v=>['running','queued'].includes(v.status));if(!$('tasks-view').hidden&&!taskRenderTimer)taskRenderTimer=setTimeout(()=>{taskRenderTimer=null;renderTasks();},150);});
 bridge.onBackendStatus(s=>{if(s.ok===false)status(s.message,true);});bridge.onOpenLyricsSettings(()=>$('settings-button').click());
 safe(async()=>{audio.volume=Number.isFinite(session.volume)?Math.max(0,Math.min(1,session.volume)):.75;player.setMode(session.mode);settings=await bridge.getSettings();await loadTab('local');const remembered=rows.find(r=>r.file===session.file);if(remembered)await player.play(remembered,rows,{paused:true,resumeTime:session.time});const info=await bridge.appInfo();$('build-label').textContent='音乐下载器 · '+info.version;if(!settings.disclaimerAcceptedVersion)$('welcome').showModal();if(settings.desktopLyricsEnabled)await bridge.showFloatingLyrics();status('顶部拖动位置 · 底边调节长度');})();
})();
