'use strict';
(()=>{
 const $=id=>document.getElementById(id),bridge=window.musicBridge,audio=$('music-audio');
 let startupInteraction=false;document.addEventListener('click',()=>{startupInteraction=true;},{capture:true,once:true});
 let settings=null,tab='local',files=[],categories={categories:[],assignments:{},order:[]},lists=[],rows=[],searchPage=1,total=0,batch=0,loadSerial=0,lyrics=[],lyricIndex=-1,currentHeight=740,lastTrackKey='',lastPlaying=false,lastBusy=false,mutedVolume=.75,libraryChoice='all';
 let discoveryPage=1,discoverySongsPage=1,activeDiscovery=null,discoveryList=[],discoveryHasMore=false,selectedLocalPlaylistId=null;
 const availability=new Map(),availabilityVersions=new Map(),tasks=new Map(),localArtwork=new Map(),localSongIds=new Map(),localFileVersions=new Map(),coverPending=new Set(),expandedPlaylists=new Set();let seeking=false,taskRenderTimer=null,myPlaylists=[],selection=null,availabilityRevision=0,availabilityProbePending=false;
 const sheet=document.querySelector('.panel');let slide=null;
 bridge.onOverlayVisibility?.(({visible})=>document.body.classList.toggle('power-idle',!visible));
 bridge.onPanelReveal(({progress,animate,anchor})=>{
  const from=getComputedStyle(sheet).clipPath;slide?.cancel();
  const amount=1-Math.max(0,Math.min(1,Number(progress)||0)),center=Number.isFinite(anchor)?Math.max(0,Math.min(1,anchor)):.5;
  const target=`inset(0 ${amount*(1-center)*100}% 0 ${amount*center*100}%)`;sheet.style.clipPath=target;
  if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)slide=sheet.animate([{clipPath:from==='none'?'inset(0 0% 0 0%)':from},{clipPath:target}],{duration:460,easing:'cubic-bezier(.16,1,.3,1)'});
 });
 let fullscreenActive=false,lyricsKey='',lyricPhase='idle',lyricRequest=0;
 let alignmentRequest='',alignmentNotice='';
 function stopAlignment(){alignmentRequest='';alignmentNotice='';void bridge.cancelLyricAlignment?.().catch(()=>{});}
 async function requestWordTimings(){
  if((!fullscreenActive&&!settings?.desktopLyricsEnabled)||alignmentRequest||!lyrics.length||lyrics.every(l=>l.words?.length)||!bridge.alignLyrics)return;
  const track=player.state().track;if(!track||track.key!==lyricsKey)return;
  const requestId=track.key+':'+lyricRequest+':'+Date.now();alignmentRequest=requestId;alignmentNotice='正在分析逐字歌词…';publishFullscreen();
  try{const result=await bridge.alignLyrics({requestId,source:track.local||track.fromLocal?{localFile:track.file||track.localFile}:{id:track.id},lines:lyrics,index:Math.max(0,lyricIndex)});
   if(alignmentRequest!==requestId||track.key!==lyricsKey)return;
   if(!result.cancelled&&Array.isArray(result.lines))lyrics=result.lines;
   alignmentNotice=result.cancelled?'':lyrics.some(l=>!l.words?.length)?'部分歌词暂未对齐，保留整句显示。':'';
  }catch{if(alignmentRequest===requestId)alignmentNotice='逐字分析暂不可用，继续显示整句歌词。';}
  finally{if(alignmentRequest===requestId){alignmentRequest='';publishFullscreen();pushDesktopLyrics();}}
 }
 bridge.onLyricAlignment?.(message=>{if(message.requestId!==alignmentRequest||!lyrics[message.index])return;lyrics[message.index]={...lyrics[message.index],words:message.words};publishFullscreen();pushDesktopLyrics();});
 function lyricsState(){return {enabled:!!settings?.desktopLyricsEnabled,locked:!!settings?.floatingLyrics?.mouseThrough};}
 function updateLyricsButton(){const enabled=!!settings?.desktopLyricsEnabled,button=$('lyrics-toggle');button.classList.toggle('active',enabled);button.setAttribute('aria-pressed',String(enabled));button.title=enabled?'关闭桌面歌词':'打开桌面歌词';button.setAttribute('aria-label',button.title);document.dispatchEvent(new CustomEvent('music:lyrics-state',{detail:lyricsState()}));if(enabled)void requestWordTimings();else if(!fullscreenActive&&alignmentRequest)stopAlignment();}
 function pushDesktopLyrics(){
  if(!settings?.desktopLyricsEnabled)return;
  const track=player.state().track;let current=null;
  if(track&&track.key===lyricsKey)for(const line of lyrics){if(line.time>audio.currentTime+.05)break;current=line;}
  const fallback=!track?'':track.key!==lyricsKey||lyricPhase==='loading'?'正在获取歌词…':lyricPhase==='source-error'?'歌曲暂时无法播放':lyricPhase==='error'?'歌词暂时不可用':lyrics.length?'等待歌词…':'暂无同步歌词';
  void bridge.updateFloatingLyrics({title:track?.name||'',line:current?.text||fallback,translation:current?.translation||'',words:current?.words||[],time:audio.currentTime,playing:!audio.paused}).catch(()=>{});
 }
 function fullscreenState(s=player.state()){
  const lines=s.track?.key===lyricsKey?lyrics:[];
  let index=-1;for(let n=0;n<lines.length&&lines[n].time<=s.time+.05;n++)index=n;
  return {key:s.track?.key||'',title:s.track?.name||'',artist:s.track?.artists||'',cover:coverURL(s.track?.cover_url),previewOnly:!!s.track?.previewOnly,playing:s.playing,busy:s.busy,error:s.error,alignmentNotice,time:s.time,duration:s.duration,volume:s.volume,lyrics:lines,index,mode:s.mode,quality:s.quality,actualQuality:s.actualQuality,lyricsState:lyricsState(),qualityInfo:{requested:s.quality,actual:s.actualQuality,actualQuality:s.actualQuality,local:!!s.track?.local,fromLocal:!!s.track?.fromLocal,verified:!!s.track?.qualityVerified,format:s.track?.format,bitrate:s.track?.bitrate,sampleRate:s.track?.sampleRate,bitDepth:s.track?.bitDepth}};
 }
 function publishFullscreen(s){if(fullscreenActive)bridge.updateFullscreen(fullscreenState(s));}
 let session={},lastSave=0,sessionReady=false,sessionVolumeTimer=null;try{session=JSON.parse(localStorage.getItem('orbit-session')||'{}');}catch{}
 function saveSession(s,force=false){if(!sessionReady||!force&&Date.now()-lastSave<2000)return;lastSave=Date.now();void bridge.savePlaybackSession({file:s.track?.local?s.track.file:null,time:s.time,mode:s.mode,volume:s.volume}).catch(()=>{});}
 let noticeTimer=null;const status=(text,error=false)=>{const node=$('status');node.textContent=text;node.title=text;node.classList.toggle('error',error);clearTimeout(noticeTimer);node.hidden=!text||!error&&/^(正在播放|已暂停|歌单 ·|INS |找到 |我的歌单)/.test(text);if(!error&&!node.hidden)noticeTimer=setTimeout(()=>{node.hidden=true;},3500);};
 const safe=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>status(e.message||String(e),true));
 const clean=name=>String(name||'').replace(/\s*\[歌单\]/g,'').replace(/\s*\[\d+\](?=\.[^.]+$)/,'').replace(/\.[^.]+$/,'');
 const time=n=>{n=Math.max(0,Math.floor(n||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
 const coverURL=url=>{if(typeof url==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)&&url.length<1400000)return url;try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!/(^|\.)music\.(126|163)\.net$/.test(u.hostname))return '../assets/avatar.png';u.protocol='https:';return u.href;}catch{return '../assets/avatar.png';}};
 const localRow=f=>({key:'local:'+f.name,local:true,file:f.name,id:localSongIds.get(f.name)||/\[(\d{1,20})\]\.[^.]+$/.exec(f.name)?.[1]||null,name:clean(f.name),artists:'本地音乐',cover_url:localArtwork.get(f.name)||'',conflict:f.conflict});
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
  document.dispatchEvent(new CustomEvent('music:state',{detail:s}));
  saveSession(s);
  recordPlaybackAvailability(s);
  const nextKey=s.track?.key||'';
  if(lastTrackKey!==nextKey){
   stopAlignment();
   // Invalidate pending lyric work as soon as the selection changes, not only
   // after its audio URL resolves. Otherwise the previous song remains visible.
   lyricRequest++;lyrics=[];lyricIndex=-1;lyricsKey=nextKey;lyricPhase=s.track?'loading':'idle';
   $('lyric-line').textContent=s.track?'正在寻找这首歌的歌词…':'选择歌曲后显示歌词';$('lyrics-list').replaceChildren();
   pushDesktopLyrics();
  }else if(s.error&&lyricPhase==='loading'){
   lyricPhase='source-error';$('lyric-line').textContent='歌曲暂时无法播放';pushDesktopLyrics();
  }
  publishFullscreen(s);
  document.body.classList.toggle('playing',s.playing);$('signal-label').textContent=s.busy?'正在连接':s.playing?'正在播放':s.track?'已暂停':'等待播放';
  $('play-path').setAttribute('d',s.playing?'M8 5h3v14H8ZM15 5h3v14h-3Z':'m9 5 11 7-11 7Z');$('play').disabled=s.busy;
  $('track-title').textContent=s.track?.name||'未在播放';$('track-title').title=s.track?.name||'';$('track-artist').textContent=s.track?.artists||'';
  $('track-source').textContent=s.track?(s.track.local?'本地音乐':s.track.fromLocal?'已下载 · 本地播放':'在线播放'):'点击封面打开全屏歌词';
  const art=coverURL(s.track?.cover_url);if($('cover').getAttribute('src')!==art)$('cover').src=art;
  $('cover').onerror=()=>{$('cover').src='../assets/avatar.png';};$('preview-tag').hidden=!s.track?.previewOnly;
  $('track-format').textContent=s.track?.previewOnly?'试听片段':s.track?.local||s.track?.fromLocal?'本地':s.track?'在线':'待播放';
  $('elapsed').textContent=time(s.time);$('duration').textContent=s.duration?'-'+time(s.duration-s.time):'0:00';$('seek').disabled=!s.duration;$('seek').max=String(s.duration||1);$('seek').closest('.seek-rail')?.style.setProperty('--progress',Math.max(0,Math.min(100,s.time/(s.duration||1)*100))+'%');
  if(!seeking)$('seek').value=String(s.time);$('volume').value=String(s.volume);
  const modeName=({sequence:'顺序播放',shuffle:'随机播放','repeat-one':'单曲循环',reverse:'倒序播放','stop-after':'播完停止'})[s.mode];$('mode').title=modeName;$('mode').setAttribute('aria-label',modeName);$('mode').dataset.mode=s.mode;$('mode-path').setAttribute('d',({sequence:'M4 7h13m-3-3 3 3-3 3M20 17H7m3-3-3 3 3 3',shuffle:'M4 6h3l10 12h3m-4-3 3 3-3 3M4 18h3l10-12h3m-3-3 3 3-3 3','repeat-one':'M5 7h14l-3-3m3 3-3 3M19 17H5l3 3m-3-3 3-3M12 9v6',reverse:'M20 7H7l3-3m-3 3 3 3M4 17h13l-3-3m3 3-3 3','stop-after':'M7 5h10v14H7Z'})[s.mode]);
  if(s.error)status(s.error,true);else if(s.busy)status('正在连接「'+s.track.name+'」…');
  if(lastTrackKey!==nextKey||lastPlaying!==s.playing||lastBusy!==s.busy){
   lastTrackKey=nextKey;lastPlaying=s.playing;lastBusy=s.busy;
   for(const row of $('track-list').querySelectorAll('.track-row,.my-track'))row.classList.toggle('current',row.dataset.key===s.track?.key);
   if(s.track&&!s.busy&&!s.error)status(s.track.previewOnly?'正在试听片段 · '+s.track.name:(s.playing?'正在播放 · ':'已暂停 · ')+s.track.name);
  }
 }
 async function loadLyrics(track,token){
  stopAlignment();
  const request=++lyricRequest;
  lyrics=[];lyricIndex=-1;$('lyric-line').textContent='正在寻找这首歌的歌词…';$('lyrics-list').replaceChildren();
  lyricsKey=track.key;lyricPhase='loading';publishFullscreen();pushDesktopLyrics();
  try{
   let data=track.local||track.fromLocal?await bridge.localLyrics(track.file||track.localFile):null;
   if(token!==player.serial()||request!==lyricRequest)return;
   if(!data?.found&&track.id)data=await(track.local?bridge.fetchLyrics(track.id):bridge.fetchLyricsMemory(track.id));
   if(token!==player.serial()||request!==lyricRequest)return;
   lyrics=window.MusicLRC.parseLyrics(data?.lrc||'',data?.translated_lrc||'',data?.yrc||'');lyricPhase='ready';
   publishFullscreen();pushDesktopLyrics();
   if(!lyrics.length){$('lyric-line').textContent='此刻，专注听旋律。';$('lyrics-list').append(element('p','empty','这首歌暂时没有同步歌词。'));return;}
   for(const [i,line] of lyrics.entries()){const button=element('button','lyric-item',line.text);if(line.translation)button.append(element('small','',line.translation));button.onclick=()=>{if(Number.isFinite(audio.duration)&&line.time<audio.duration)audio.currentTime=line.time;};button.dataset.index=i;$('lyrics-list').append(button);}
   syncLyrics();
   if(fullscreenActive||settings?.desktopLyricsEnabled)void requestWordTimings();
  }catch{if(token===player.serial()&&request===lyricRequest){$('lyric-line').textContent='歌词暂时未连接，音乐继续。';lyricPhase='error';pushDesktopLyrics();}}
 }
 function syncLyrics(){
  let i=-1;for(let n=0;n<lyrics.length&&lyrics[n].time<=audio.currentTime+.05;n++)i=n;if(i===lyricIndex){if(lyrics[i]?.words?.length)pushDesktopLyrics();return;}lyricIndex=i;
  const line=lyrics[i];$('lyric-line').textContent=line?.text||'此刻，专注听旋律。';
  for(const child of $('lyrics-list').children)child.classList.toggle('active',Number(child.dataset.index)===i);
  pushDesktopLyrics();
 }
 function empty(title,detail=''){const box=element('div','empty');box.append(element('strong','',title),element('span','',detail));return box;}
 async function playOnlineSong(song,visible,context,offset,initialRows=visible){
  const playlist=context&&window.MusicDiscoveryQueue.createDiscoveryQueue({
   initialOffset:offset,initialRows,selectedKey:song.key,selectedRow:song,
   fetchPage:async options=>{const data=await readDiscoveryPage(context,options);return {...data,tracks:data.tracks.map(onlineRow)};}
  });
  return player.play(song,visible,{allowTrial:true,extendQueue:playlist?async request=>{
   try{const updated=await playlist.extend(request.direction);return request.isCurrent()&&request.updateQueue(updated);}
   catch(e){if(request.isCurrent())status('歌单加载失败，请重试 · '+(e.message||''),true);return false;}
  }:null});
 }
 function renderRows(){
  if(tab==='local'){renderMyPlaylists();return;}
  const query=$('query').value.trim().toLowerCase(),filtered=tab==='search'?rows:rows.filter(s=>(s.name+' '+s.artists).toLowerCase().includes(query)),visible=window.MusicTrackOrder.pageOrder(filtered,availability);
  $('track-list').replaceChildren();$('list-count').textContent=visible.length+' 首';
  if(!visible.length){$('track-list').append(empty(tab==='local'?'你的音乐，等你放进来':tab==='search'?'寻找下一段旋律':'暂时没有更多歌曲',tab==='local'?'点击「导入」，添加本地文件；或去搜索喜欢的歌。':tab==='search'?'输入歌名或歌手，按 Enter 搜索。':'试试刷新，或换一个歌单。'));return;}
  const fragment=document.createDocumentFragment();
  for(const [i,song] of visible.entries()){
   const row=element('article','track-row'+(player.state().track?.key===song.key?' current':''));row.dataset.key=song.key;
   const play=element('button','row-play');play.title='播放 '+song.name;play.setAttribute('aria-label','播放 '+song.name);play.disabled=!!song.conflict;
   play.append(element('span','row-number',String(i+1).padStart(2,'0')));
   if(song.cover_url){const img=element('img','row-cover');img.src=coverURL(song.cover_url);img.alt='';img.loading='lazy';img.onerror=()=>img.remove();play.append(img);}
   const info=element('span','row-info');info.append(element('strong','',song.name),element('small','',song.reason||song.artists||'本地音乐'));play.append(info);
   play.onclick=safe(async()=>{
    const context=tab==='recent'?activeDiscovery:null;
    await playOnlineSong(song,visible,context,(discoverySongsPage-1)*8,rows);
   });
   row.append(play);
   if(!song.local){const known=availability.get(song.id);if(!known?.fromLocal&&!known?.trialAvailable&&known?.state==='unavailable'){const label=element('span','row-state','在线未就绪');label.title=known.reason||'';row.append(label);}}
   const action=element('button','row-action','↓');action.title='下载这首歌';action.setAttribute('aria-label',action.title+' '+song.name);
   action.onclick=safe(()=>download(song,action));const add=element('button','row-action','＋');add.title='下载并加入歌单';add.setAttribute('aria-label',add.title+' '+song.name);add.onclick=safe(()=>downloadIntoPlaylist(song,add));row.append(action,add);fragment.append(row);
  }
  $('track-list').append(fragment);
 }
 function updateAvailabilityVersion(id){availabilityVersions.set(id,(availabilityVersions.get(id)||0)+1);}
 function cleanPlaybackAvailability(){
  for(const [id,row] of availability)if(row.playbackPage!==undefined&&row.playbackPage!==loadSerial){availability.delete(id);updateAvailabilityVersion(id);}
 }
 function recordPlaybackAvailability(s){
  cleanPlaybackAvailability();const track=s.track,id=track?.id&&String(track.id);
  if(!id||track.local||!rows.some(row=>String(row.id)===id))return;
  const old=availability.get(id);
  if(s.error||audio.error){if(old?.playbackPage===loadSerial){availability.delete(id);updateAvailabilityVersion(id);renderRows();}return;}
  if(!s.playing||s.busy)return;
  const next=track.fromLocal?{id,state:'available',fromLocal:true,reason:'已下载，可本地播放'}:track.previewOnly?{id,state:'unavailable',trialAvailable:true,reason:'正在试听片段'}:{id,state:'available',reason:'当前音源已开始播放，完整性尚未确认'};
  if(old?.playbackPage===loadSerial&&old.reason===next.reason)return;
  availability.set(id,{...next,playbackPage:loadSerial});updateAvailabilityVersion(id);renderRows();
 }
 function forgetPlaybackAvailability(){
  const id=player.state().track?.id&&String(player.state().track.id);if(!id)return;
  if(availability.get(id)?.playbackPage===loadSerial){availability.delete(id);updateAvailabilityVersion(id);renderRows();}
 }
 async function probeRows(expected){
  cleanPlaybackAvailability();
  const revision=availabilityRevision;
  const ids=rows.filter(s=>!s.local).map(s=>s.id);
  for(let i=0;i<ids.length;i+=40){try{const batch=ids.slice(i,i+40),versions=new Map(batch.map(id=>[id,availabilityVersions.get(id)||0]));const found=await bridge.mediaAvailability(batch);if(expected!==loadSerial||revision!==availabilityRevision)return;found.forEach(s=>{if((availabilityVersions.get(s.id)||0)===versions.get(s.id)&&availability.get(s.id)?.playbackPage!==loadSerial)availability.set(s.id,s);});renderRows();}catch{}}
 }
 function invalidateSongAvailability(){
  availabilityRevision++;availability.clear();availabilityVersions.clear();
  if(!rows.length||!(tab==='search'||tab==='recent'&&activeDiscovery)){availabilityProbePending=false;return;}
  renderRows();availabilityProbePending=$('browser').hidden;
  if(!availabilityProbePending)void probeRows(loadSerial);
 }
 async function refreshLocal(){
  const [newFiles,data]=await Promise.all([bridge.listFiles(),bridge.userPlaylistsList().catch(()=>({playlists:[]}))]);files=newFiles;myPlaylists=data.playlists;
  const live=new Set();for(const f of files){live.add(f.name);const version=JSON.stringify([f.directory,f.size,f.mtimeMs,f.conflict]);if(localFileVersions.has(f.name)&&localFileVersions.get(f.name)!==version){localArtwork.delete(f.name);localSongIds.delete(f.name);}localFileVersions.set(f.name,version);const id=/\[(\d{1,20})\]\.[^.]+$/.exec(f.name)?.[1];if(id)localSongIds.set(f.name,id);}
  for(const name of localFileVersions.keys())if(!live.has(name)){localFileVersions.delete(name);localArtwork.delete(name);localSongIds.delete(name);}
  void hydrateLocalArtwork(files.map(f=>f.name));
 }
 async function hydrateLocalArtwork(names){
  const pending=names.filter(n=>(!localArtwork.has(n)||!localSongIds.has(n))&&!coverPending.has(n));pending.forEach(n=>coverPending.add(n));
  for(let i=0;i<pending.length;i+=4){const batch=pending.slice(i,i+4),versions=new Map(batch.map(n=>[n,localFileVersions.get(n)]));try{
   const found=await bridge.localCovers(batch);for(const item of found){if(versions.get(item.name)!==localFileVersions.get(item.name))continue;
    if(item.cover)localArtwork.set(item.name,item.cover);if(item.id)localSongIds.set(item.name,item.id);
    const before=player.state().track;player.updateLocalArtwork(item.name,item.cover||'',item.id||null);
    const current=player.state().track;if(item.id&&before?.local&&before.file===item.name&&!before.id&&current?.id===item.id)void loadLyrics(current,player.serial());
    for(const img of document.querySelectorAll('.local-cover'))if(img.dataset.file===item.name)img.src=coverURL(item.cover);}
  }catch{}finally{batch.forEach(n=>coverPending.delete(n));const changed=batch.filter(n=>localFileVersions.has(n)&&versions.get(n)!==localFileVersions.get(n));if(changed.length)void hydrateLocalArtwork(changed);}}
 }
 function playlistSong(list,name){const f=files.find(x=>x.name===name);return {...localRow(f||{name}),missing:!f,conflict:!!f?.conflict||list.conflicts.includes(name)};}
 function renderMuoniumPlaylistNavigation(){
  const nav=$('mu-nav-playlists');nav.replaceChildren();
  if(!myPlaylists.length)return;
  nav.append(element('div','mu-nav-heading','我的歌单'));
  for(const list of myPlaylists){
   const button=element('button','mu-nav-playlist','♫  '+list.name);button.type='button';button.title=list.name;
   button.onclick=safe(async()=>{
    if($('netease-view'))$('netease-view').dataset.restore='false';document.getElementById('home-button')?.classList.remove('active');
    if(tab!=='local')await loadTab('local');
    else hideSheets(false);
    selectedLocalPlaylistId=list.id;expandedPlaylists.add(list.id);renderMyPlaylists();
    const hero=$('mu-playlist-hero'),first=list.tracks[0],cover=first&&localArtwork.get(first);
    hero.dataset.local='true';hero.hidden=false;$('mu-playlist-name').textContent=list.name;
    $('mu-playlist-info').textContent=list.tracks.length+' 首歌曲';$('mu-playlist-source').textContent='本地歌单';
    $('mu-playlist-cover').src=coverURL(cover||'');$('mu-playlist-play').hidden=!list.tracks.length;
    $('mu-playlist-play').onclick=safe(async()=>{const songs=list.tracks.map(name=>playlistSong(list,name)).filter(song=>!song.missing&&!song.conflict);if(songs.length)await player.play(songs[0],songs,{allowTrial:true});});
    const header=[...$('track-list').querySelectorAll('.playlist-heading')].find(el=>el.dataset.selectId===list.id);header?.scrollIntoView({block:'nearest'});
   });
   button.ondragover=e=>{if(e.dataTransfer?.types?.includes('application/x-music-track-ids')){e.preventDefault();e.dataTransfer.dropEffect='move';}};
   button.ondrop=safe(async e=>{e.preventDefault();let ids;try{ids=JSON.parse(e.dataTransfer.getData('application/x-music-track-ids'));}catch{return;}if(Array.isArray(ids)&&ids.length<=10000)await transferTracks(ids,list.id,true);});
   nav.append(button);
  }
 }
 function trackSelectionId(listId,name){return JSON.stringify([listId,name]);}
 function unpackTrack(id){try{const value=JSON.parse(id);return Array.isArray(value)&&value.length===2&&value.every(x=>typeof x==='string')?value:null;}catch{return null;}}
 function renderMyPlaylists(){
  renderMuoniumPlaylistNavigation();
  if(selectedLocalPlaylistId&&!myPlaylists.some(list=>list.id===selectedLocalPlaylistId))selectedLocalPlaylistId=null;
  const container=$('track-list'),query=$('query').value.trim().toLowerCase();container.replaceChildren();$('list-count').textContent=selectedLocalPlaylistId?(myPlaylists.find(p=>p.id===selectedLocalPlaylistId)?.tracks.length||0)+' 首':myPlaylists.length+' 个歌单';
  if(!myPlaylists.length){container.append(empty('还没有歌单','点击「新建歌单」开始整理。'));return;}
  for(const list of myPlaylists){
   if(selectedLocalPlaylistId&&list.id!==selectedLocalPlaylistId)continue;
   const songRows=list.tracks.map(name=>playlistSong(list,name)),matching=songRows.filter(s=>(s.name+' '+s.artists).toLowerCase().includes(query));
   if(query&&!list.name.toLowerCase().includes(query)&&!matching.length)continue;
   const group=element('section','my-playlist'),header=element('div','playlist-heading');header.tabIndex=0;header.draggable=true;header.setAttribute('role','button');header.setAttribute('aria-expanded',String(expandedPlaylists.has(list.id)));
   header.dataset.selectKind='playlist';header.dataset.selectId=list.id;
   header.append(element('span','playlist-chevron',expandedPlaylists.has(list.id)?'▾':'▸'),element('span','playlist-folder','♫'));
   const name=element('strong','playlist-name',list.name);header.append(name,element('span','playlist-count',list.tracks.length+' 首'));
   const toggle=()=>{if(expandedPlaylists.has(list.id))expandedPlaylists.delete(list.id);else expandedPlaylists.add(list.id);renderMyPlaylists();};
   header.onclick=e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey)setTimeout(toggle,0);};header.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}};
   group.append(header);
   if(expandedPlaylists.has(list.id)||query){
    const visible=window.MusicTrackOrder.pageOrder(query?matching:songRows,availability);
    if(!visible.length)group.append(element('p','playlist-empty','这个歌单还没有歌曲。'));
    for(const song of visible){
     const row=element('div','my-track'+(player.state().track?.key===song.key?' current':''));row.tabIndex=0;row.setAttribute('role','option');row.draggable=!song.missing&&!song.conflict;row.dataset.key=song.key;row.dataset.selectKind='track';row.dataset.selectId=trackSelectionId(list.id,song.file);
     const cover=element('img','local-cover');cover.alt='';cover.draggable=false;cover.dataset.file=song.file;cover.src=coverURL(song.cover_url);cover.onerror=()=>{cover.src='../assets/avatar.png';};
     const info=element('span','row-info');info.append(element('strong','',song.name),element('small','',song.missing?'文件已丢失':song.conflict?'同名文件冲突':'本地音乐'));
     const play=element('button','playlist-play','▶');play.title='播放 '+song.name;play.setAttribute('aria-label',play.title);play.disabled=song.missing||song.conflict;
     const start=safe(()=>player.play(song,songRows.filter(s=>!s.missing&&!s.conflict),{allowTrial:true}));play.onclick=e=>{e.stopPropagation();void start();};row.ondblclick=()=>{if(!song.missing&&!song.conflict)void start();};row.onkeydown=e=>{if(e.key==='Enter'&&!song.missing&&!song.conflict){e.preventDefault();void start();}};
     row.append(cover,info,play);group.append(row);
    }
   }
   container.append(group);
  }
  selection?.refresh();
 }
 async function refreshMyPlaylists(message){await refreshLocal();selection?.clear();renderMyPlaylists();if(message)status(message);}
 async function transferTracks(ids,target,move){
  const grouped=new Map();for(const item of ids.map(unpackTrack).filter(Boolean)){const [source,name]=item;if(!grouped.has(source))grouped.set(source,[]);if(!grouped.get(source).includes(name))grouped.get(source).push(name);}
  if(!grouped.size)return;let changed=false;
  try{for(const [source,names] of grouped){if(source===target)continue;await bridge.userPlaylistsTransfer(source,target,names,move);changed=true;}}
  finally{await refreshMyPlaylists(changed?'歌单已更新':'请选择不同的目标歌单');}
 }
 async function chooseTarget(ids,move){
  const target=await promptDialog(move?'移动到哪个歌单？':'复制到哪个歌单？',{choices:myPlaylists.map(p=>({id:p.id,name:p.name}))});if(target)await transferTracks(ids,target,move);
 }
 async function reorderTracks({trackIds,targetTrackId,position}){
  const target=unpackTrack(targetTrackId),chosen=trackIds.map(unpackTrack).filter(Boolean);if(!target||!chosen.length)return;
  if(chosen.some(x=>x[0]!==target[0])){status('排序时请选择同一个歌单里的歌曲');return;}
  const list=myPlaylists.find(p=>p.id===target[0]);if(!list)return;
  const names=new Set(chosen.map(x=>x[1])),moving=list.tracks.filter(n=>names.has(n)),rest=list.tracks.filter(n=>!names.has(n));
  const index=rest.indexOf(target[1]);if(index<0)return;rest.splice(index+(position==='after'?1:0),0,...moving);
  await bridge.userPlaylistsReorderTracks(list.id,rest);await refreshMyPlaylists('歌曲顺序已保存');
 }
 async function reorderPlaylists({playlistIds,targetPlaylistId,position}){
  const selected=new Set(playlistIds),moving=myPlaylists.filter(p=>selected.has(p.id)).map(p=>p.id),rest=myPlaylists.filter(p=>!selected.has(p.id)).map(p=>p.id);
  const index=rest.indexOf(targetPlaylistId);if(index<0||!moving.length)return;rest.splice(index+(position==='after'?1:0),0,...moving);
  await bridge.userPlaylistsReorder(rest);await refreshMyPlaylists('歌单顺序已保存');
 }
 function closeContextMenu(){document.getElementById('playlist-context')?.remove();}
 function playlistContextMenu({kind,id,selectedIds,x,y}){
  closeContextMenu();const menu=element('div','playlist-context');menu.id='playlist-context';menu.setAttribute('role','menu');document.body.append(menu);
  const add=(label,action)=>{const button=element('button','',label);button.setAttribute('role','menuitem');button.onclick=safe(async()=>{closeContextMenu();await action();});menu.append(button);};
  if(kind==='playlist'){
   const list=myPlaylists.find(p=>p.id===id);if(!list){closeContextMenu();return;}
   if(selectedIds.length>1)add('合并所选歌单为新歌单',async()=>{const name=await promptDialog('合并为新歌单',{message:'原歌单和音乐文件都会保留。'});if(name){await bridge.userPlaylistsMerge(selectedIds,name);await refreshMyPlaylists('已创建合并歌单');}});
   else{
    add('重命名歌单',async()=>{const name=await promptDialog('重命名歌单',{value:list.name});if(name){await bridge.userPlaylistsRename(id,name);await refreshMyPlaylists('歌单已重命名');}});
    if(id!=='default')add('删除歌单（保留歌曲）',async()=>{const yes=await promptDialog('删除歌单？',{message:'歌曲文件和其他歌单不会删除。',choices:[{id:'no',name:'取消'},{id:'yes',name:'删除歌单'}]});if(yes==='yes'){await bridge.userPlaylistsDelete(id);expandedPlaylists.delete(id);await refreshMyPlaylists('歌单已删除');}});
   }
  }else{
   add('复制到其他歌单',()=>chooseTarget(selectedIds,false));add('移动到其他歌单',()=>chooseTarget(selectedIds,true));
   add('从当前歌单移除',async()=>{const grouped=new Map();for(const [source,name] of selectedIds.map(unpackTrack).filter(Boolean)){if(source==='default')continue;if(!grouped.has(source))grouped.set(source,[]);grouped.get(source).push(name);}if(!grouped.size){status('“全部已下载”展示所有本地文件，无法从中移除。');return;}try{for(const [source,names] of grouped)await bridge.userPlaylistsRemove(source,[...new Set(names)]);}finally{await refreshMyPlaylists('已从歌单移除，音乐文件仍保留');}});
   add('删除本地文件…',async()=>deleteLocalTracks(selectedIds));
   if(selectedIds.map(unpackTrack).filter(Boolean).some(([,name])=>!files.some(f=>f.name===name)))add('清理失效的歌曲引用',async()=>{const names=[...new Set(selectedIds.map(unpackTrack).filter(Boolean).map(x=>x[1]).filter(n=>!files.some(f=>f.name===n)))];await bridge.userPlaylistsForgetFiles(names);await refreshMyPlaylists('已清理失效引用');});
  }
  menu.style.left=Math.max(4,Math.min(x,innerWidth-190))+'px';menu.style.top=Math.max(4,Math.min(y,innerHeight-menu.offsetHeight-4))+'px';
 }
 async function deleteLocalTracks(ids){
  const names=[...new Set(ids.map(unpackTrack).filter(Boolean).map(x=>x[1]))];if(!names.length)return;
  const answer=await promptDialog('删除 '+names.length+' 首本地音乐？',{message:'文件会移入回收站，并从所有歌单移除。',choices:[{id:'no',name:'取消'},{id:'yes',name:'移入回收站'}]});if(answer!=='yes')return;
  const removed=[];try{for(const name of names){const before=player.state(),release=before.track?.local&&before.track.file===name||before.track?.fromLocal&&before.track.localFile===name;let lease;
   if(release){player.stop();lease=player.serial();audio.removeAttribute('src');audio.load();await new Promise(r=>setTimeout(r,150));}
   try{await bridge.deleteLocal(name,true);removed.push(name);localArtwork.delete(name);localSongIds.delete(name);localFileVersions.delete(name);player.removeLocal(name);}
   catch(e){if(release&&player.serial()===lease)await player.play(before.track,null,{paused:!before.playing,resumeTime:before.time});throw e;}
  }}finally{try{if(removed.length)await bridge.userPlaylistsForgetFiles(removed);}finally{await refreshMyPlaylists('已移入回收站 '+removed.length+' 首');}}
 }
 selection=window.PlaylistSelection.bind($('track-list'),{
  onDropTracks:({trackIds,playlistId})=>void safe(()=>transferTracks(trackIds,playlistId,true))(),
  onReorderTracks:args=>void safe(()=>reorderTracks(args))(),
  onReorderPlaylists:args=>void safe(()=>reorderPlaylists(args))(),
  onContextMenu:playlistContextMenu
 });
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('#playlist-context'))closeContextMenu();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('playlist-context')){e.preventDefault();e.stopImmediatePropagation();closeContextMenu();}},true);
 function hideSheets(refresh=true){for(const id of ['settings-view','tasks-view','lyrics-view','netease-view']){const sheet=$(id);if(sheet)sheet.hidden=true;}$('browser').hidden=false;if($('netease-view')?.dataset.restore==='true'){$('browser').hidden=true;$('netease-view').hidden=false;}if(refresh&&availabilityProbePending){availabilityProbePending=false;if(rows.length&&(tab==='search'||tab==='recent'&&activeDiscovery))void probeRows(loadSerial);}}
 async function loadTab(next=tab){
  if($('netease-view'))$('netease-view').dataset.restore='false';
  selectedLocalPlaylistId=null;
  $('mu-playlist-hero').dataset.local='false';$('mu-playlist-hero').hidden=true;$('mu-playlist-play').hidden=true;
  tab=next;const request=++loadSerial;availabilityProbePending=false;hideSheets(false);$('query').value='';$('library-tools').hidden=tab!=='local';$('online-tools').hidden=!['search','recent'].includes(tab);$('search-submit').hidden=tab!=='search';$('search-submit').disabled=false;$('pagination').hidden=true;
  $('search-form').hidden=false;$('back-discovery').hidden=true;
  $('query').placeholder=tab==='search'?'搜索歌曲、歌手…':tab==='local'?'筛选歌单或歌曲…':'筛选当前列表…';
  document.getElementById('home-button')?.classList.remove('active');for(const button of document.querySelectorAll('[data-tab]'))button.classList.toggle('active',button.dataset.tab===tab);
  $('list-title').textContent=({local:'我的歌单',recent:'网易云热门歌单',search:'搜索结果',queue:'接下来播放'})[tab];
  rows=[];$('track-list').replaceChildren(empty('正在载入…'));
  try{
   if(tab==='local'){await refreshLocal();if(request!==loadSerial)return;rows=files.map(localRow);}
   else if(tab==='queue')rows=player.state().rows;
   else if(tab==='recent'){activeDiscovery=null;discoveryPage=1;await loadDiscoveryList(1,false);return;}
   if(request!==loadSerial)return;renderRows();void probeRows(request);
  }catch(e){if(request===loadSerial){$('track-list').replaceChildren(empty('暂时没有连接上',e.message));status(e.message,true);}}
 }
 async function loadDiscoveryList(page=1,force=false){
  activeDiscovery=null;discoveryPage=page;const request=++loadSerial;rows=[];$('query').value='';$('search-form').hidden=true;$('online-tools').hidden=true;$('back-discovery').hidden=true;
  $('list-title').textContent='网易云热门歌单';$('track-list').replaceChildren(empty('正在加载热门歌单…'));
  try{const data=await bridge.popularPlaylists({page,force});if(request!==loadSerial)return;
   discoveryList=data.playlists||[];discoveryHasMore=!!data.hasMore;renderDiscovery();status(data.message||'热门歌单',!!data.offline);
   $('pagination').hidden=false;$('page-label').textContent='第 '+page+' 页';$('page-prev').disabled=page<=1;$('page-next').disabled=!discoveryHasMore;
  }catch(e){if(request===loadSerial){$('track-list').replaceChildren(empty('热门歌单暂时无法加载','请刷新重试。'));$('pagination').hidden=true;status(e.message||'热门歌单加载失败',true);}}
 }
 function renderDiscovery(){
  $('track-list').replaceChildren();$('list-count').textContent=discoveryList.length+' 个';
  if(!discoveryList.length){$('track-list').append(empty('暂时没有取到热门歌单','请点击右上角刷新。'));return;}
  for(const item of discoveryList){const card=element('button','discovery-card');card.title='打开歌单 '+item.name;
   const art=element('img','discovery-cover');art.alt='';art.src=coverURL(item.cover_url);art.onerror=()=>{art.src='../assets/avatar.png';};
   const details=element('span','discovery-info');details.append(element('strong','',item.name),element('small','',(item.creator||'网易云歌单')+' · '+item.trackCount+' 首'));
   card.append(art,details,element('span','discovery-arrow','›'));card.onclick=safe(()=>openDiscovery(item));$('track-list').append(card);}
 }
 async function readDiscoveryPage(context,options){
  if(!context.manualTracks)return bridge.popularPlaylist(context.id,options);
  const {offset,limit}=options,total=context.manualTracks.length;
  return {tracks:context.manualTracks.slice(offset,offset+limit),total,hasMore:offset+limit<total};
 }
 async function openDiscovery(item){activeDiscovery=item;discoverySongsPage=1;await loadDiscoverySongs();}
 async function loadDiscoverySongs(){
  const context=activeDiscovery;if(!context)return;const request=++loadSerial;rows=[];$('query').value='';$('search-form').hidden=false;$('query').placeholder='筛选本页歌曲…';$('online-tools').hidden=false;$('back-discovery').hidden=false;$('list-title').textContent=context.name;$('track-list').replaceChildren(empty('正在打开歌单…'));
  $('mu-playlist-hero').dataset.local='false';$('mu-playlist-source').textContent='网易云音乐';$('mu-playlist-play').hidden=true;
  $('mu-playlist-cover').src=coverURL(context.cover_url);$('mu-playlist-cover').onerror=()=>{$('mu-playlist-cover').src='../assets/avatar.png';};
  try{const data=await readDiscoveryPage(context,{offset:(discoverySongsPage-1)*8,limit:8});if(request!==loadSerial||activeDiscovery?.id!==context.id)return;
   rows=data.tracks.map(onlineRow);renderRows();void probeRows(request);$('pagination').hidden=false;$('page-label').textContent='第 '+discoverySongsPage+' 页';$('page-prev').disabled=discoverySongsPage<=1;$('page-next').disabled=!data.hasMore;
   $('mu-playlist-play').hidden=!(rows.length||discoverySongsPage>1);$('mu-playlist-play').onclick=safe(async()=>{const initial=await readDiscoveryPage(context,{offset:0,limit:8});if(activeDiscovery!==context)return;const first=initial.tracks.map(onlineRow);if(!first.length){status('歌单没有可播放的歌曲',true);return;}await playOnlineSong(first[0],first,context,0);});
   status(context.possibly_incomplete?'接口仅返回部分歌单，可稍后重试。':data.missingCount?'部分歌曲信息未取得，可稍后重试。':'歌单 · '+context.name,!!(context.possibly_incomplete||data.missingCount));
  }catch(e){if(request===loadSerial){$('track-list').replaceChildren(empty('歌单暂时无法打开','请刷新重试。'));$('pagination').hidden=true;status(e.message||'歌单读取失败',true);}}
 }
 async function search(){
  const query=$('query').value.trim();if(!query)return;if(tab!=='search'){await loadTab('search');$('query').value=query;}
  const request=++loadSerial;$('search-submit').disabled=true;status('正在搜索「'+query+'」…');
  try{const data=await bridge.search(query,searchPage,8);if(request!==loadSerial)return;rows=(data.results||[]).map(onlineRow);total=data.total||rows.length;renderRows();$('pagination').hidden=false;$('page-label').textContent='第 '+searchPage+' 页';$('page-prev').disabled=searchPage===1;$('page-next').disabled=searchPage*8>=total;status('找到 '+total+' 首歌曲');void probeRows(request);}
  finally{if(request===loadSerial)$('search-submit').disabled=false;}
 }
 async function download(song,button){
  button.disabled=true;status('已加入下载任务 · '+song.name);try{const result=await bridge.download([song.id],[song]),warning=result.results?.find(r=>r.ok&&r.warning)?.warning;status(result.ok?'下载完成 · '+song.name+(warning?' · '+warning:''):result.results?.find(r=>!r.ok)?.error||'下载未完成',!result.ok);await refreshLocal();}finally{button.disabled=false;}
 }
 async function downloadIntoPlaylist(song,button){
  const data=await bridge.userPlaylistsList(),choices=[...data.playlists.map(p=>({id:p.id,name:p.name})),{id:'__new__',name:'＋ 新建歌单'}];
  let target=await promptDialog('下载并加入歌单',{choices});if(!target)return;
  if(target==='__new__'){const name=await promptDialog('新建歌单');if(!name)return;const created=await bridge.userPlaylistsCreate(name);target=created.playlists.find(p=>p.name===name)?.id;if(!target)throw Error('新歌单创建失败');}
  button.disabled=true;status('已加入下载任务 · '+song.name);
  try{const result=await bridge.download([song.id],[song]),item=result.results?.[0];if(!result.ok||!item?.localName)throw Error(item?.error||'下载未完成，未加入歌单');await bridge.userPlaylistsAdd(target,[item.localName]);await refreshLocal();status('已下载并加入歌单 · '+song.name+(item.warning?' · '+item.warning:''));}
  finally{button.disabled=false;}
 }
 function showSheet(id){$('browser').hidden=true;for(const name of ['settings-view','tasks-view','lyrics-view','netease-view']){const sheet=$(name);if(sheet)sheet.hidden=name!==id;}}
 window.NeteaseDesktopHost={
  state:()=>player.state(),
  hide:()=>bridge.panelAction({type:'collapse'}),
  downloadedTracks:async()=>{await refreshLocal();return files.map(localRow);},
  openDownloads:()=>bridge.openDirectory(),
  importDownloads:async()=>{const result=await bridge.importLocal('files');await window.NeteaseViews.downloads();return result;},
  showDownloads:()=>window.NeteaseViews.downloads(),
  getQuality:()=>({requested:player.state().quality,actual:player.state().actualQuality,verified:!!player.state().track?.qualityVerified,format:player.state().track?.format,bitrate:player.state().track?.bitrate,sampleRate:player.state().track?.sampleRate,bitDepth:player.state().track?.bitDepth}),
  setQuality:async level=>{const quality=await bridge.setPlaybackQuality(level);if(settings)settings.playbackQuality=quality;const result=await player.setQuality(quality);document.dispatchEvent(new CustomEvent('music:quality-state',{detail:{requested:quality,actual:player.state().actualQuality}}));return result;},
  lyricsState,
  toggleLyrics:()=>toggleDesktopLyrics(),
  toggleLyricsLock:async()=>{if(!settings)settings=await bridge.getSettings();if(lyricLockWorker)await lyricLockWorker;const wanted=!settings.floatingLyrics.mouseThrough;await bridge.lockFloatingLyrics(wanted);setLyricLockDisplay(wanted);return lyricsState();},
  playRow:(row,pool)=>player.play(row,pool,{allowTrial:true}),
  show:()=>{showSheet('netease-view');$('netease-view').dataset.restore='true';},
  cover:coverURL,
  play:(songs,index=0,options={})=>{const pool=songs.map(onlineRow);return player.play(pool[index],pool,{allowTrial:true,...options});},
  download:song=>bridge.download([song.id],[song]),
  addToPlaylist:(song,button)=>downloadIntoPlaylist(onlineRow(song),button),
  customSource:()=>!!settings?.apiBases?.length,
  status,
 };
 function renderTasks(){
  $('task-list').replaceChildren();const entries=[...tasks.values()].sort((a,b)=>(b.time||0)-(a.time||0));$('task-badge').hidden=!entries.some(t=>['running','queued'].includes(t.status));
  if(!entries.length){$('task-list').append(empty('还没有下载任务','在搜索结果中点击 ↓ 即可下载。'));return;}
  for(const t of entries){const item=element('div','task');item.append(element('strong','',t.song?.name||(t.name&&t.name!==String(t.id)?t.name:'歌曲名称暂不可用')),element('p','',({running:'正在下载',queued:'排队中',done:'下载完成',completed:'下载完成',failed:'下载失败',cancelled:'已取消'})[t.status]||t.status));if(t.artists||t.song?.artists)item.append(element('p','',t.artists||t.song.artists));
   const p=t.progress;if(t.status==='running'&&p&&typeof p.percent==='number'&&Number.isFinite(p.percent)){const percent=Math.max(0,Math.min(100,p.percent)),bar=element('progress','task-progress');bar.max=100;bar.value=percent;bar.setAttribute('aria-label','下载进度');item.append(bar,element('p','',Math.round(percent)+'%'+(Number.isFinite(p.speed)&&p.speed>0?' · '+(p.speed/1048576).toFixed(2)+' MB/s':'')));}
   if(t.error)item.append(element('p','',t.error));const button=element('button','',t.status==='failed'?'重试':'取消');button.hidden=!['failed','running','queued'].includes(t.status);button.onclick=safe(()=>t.status==='failed'?bridge.retryDownload(String(t.id)):bridge.cancelDownload(String(t.id)));item.append(button);$('task-list').append(item);}
 }
 function gesture(node,kind){
  let held=false;node.addEventListener('pointerdown',e=>{if(e.button!==0||kind==='move'&&e.target.closest('button'))return;held=true;node.setPointerCapture(e.pointerId);bridge.panelAction({type:'begin',kind,native:true,x:window.screenX+e.clientX,y:window.screenY+e.clientY});});
  node.addEventListener('pointerup',()=>{if(held){held=false;bridge.panelAction({type:'end'});}});for(const event of ['pointercancel','lostpointercapture'])node.addEventListener(event,()=>{if(held){held=false;bridge.panelAction({type:'cancel'});}});
 }
 gesture($('resize-grip'),'resize');gesture($('anchor'),'move');

 bridge.onPanelState(s=>{currentHeight=s.height;$('height-label').textContent=Math.round(s.height);if(s.rect){const r=s.rect;Object.assign(sheet.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});}});

 $('quit').onclick=()=>bridge.windowAction('quit');
 $('length-preset').onchange=()=>bridge.panelAction({type:'height',value:Number($('length-preset').value)});
 document.getElementById('home-button')?.classList.remove('active');for(const button of document.querySelectorAll('[data-tab]'))button.onclick=safe(()=>{batch=0;searchPage=1;return loadTab(button.dataset.tab);});
 $('query').oninput=()=>{if(tab!=='search')renderRows();};
 // Prevent submit synchronously before entering the async error boundary.
 $('search-form').onsubmit=e=>{e.preventDefault();searchPage=1;void safe(search)();};
 $('refresh').onclick=safe(()=>tab==='search'?search():tab==='recent'?(activeDiscovery?loadDiscoverySongs():loadDiscoveryList(1,true)):loadTab());
 $('back-discovery').onclick=safe(()=>loadDiscoveryList(discoveryPage,false));
 $('page-next').onclick=safe(()=>{if(tab==='search'){searchPage++;return search();}if(tab==='recent'){if(activeDiscovery){discoverySongsPage++;return loadDiscoverySongs();}return loadDiscoveryList(discoveryPage+1,false);}});
 $('page-prev').onclick=safe(()=>{if(tab==='search'){searchPage=Math.max(1,searchPage-1);return search();}if(tab==='recent'){if(activeDiscovery){discoverySongsPage=Math.max(1,discoverySongsPage-1);return loadDiscoverySongs();}return loadDiscoveryList(Math.max(1,discoveryPage-1),false);}});
 $('import').onclick=safe(async()=>{const kind=await promptDialog('导入本地音乐',{choices:[{id:'files',name:'选择音乐文件'},{id:'folder',name:'选择整个文件夹'}]});if(!kind)return;const result=await bridge.importLocal(kind);if(!result.canceled){await loadTab('local');status('已导入 '+result.imported+' 首音乐');}});
 $('load-online-playlist').onclick=safe(async()=>{
  const id=await promptDialog('打开网易云歌单',{message:'粘贴歌单链接或歌单 ID。',maxLength:300});if(!id)return;
  const request=++loadSerial;status('正在读取歌单…');const data=await bridge.playlist(id);if(request!==loadSerial)return;
  tab='recent';$('library-tools').hidden=true;$('search-submit').hidden=true;$('search-submit').disabled=false;
  document.getElementById('home-button')?.classList.remove('active');for(const button of document.querySelectorAll('[data-tab]'))button.classList.toggle('active',button.dataset.tab===tab);
  await openDiscovery({id:String(id),name:'网易云歌单',manualTracks:data.tracks||[],possibly_incomplete:!!data.possibly_incomplete});
 });
 $('download-list').onclick=safe(async()=>{const ids=rows.filter(s=>!s.local).map(s=>s.id);if(!ids.length){status('当前列表没有可下载的歌曲');return;}status('已加入 '+ids.length+' 首下载任务');$('download-list').disabled=true;try{let success=0,failed=0;for(let i=0;i<ids.length;i+=100){const result=await bridge.download(ids.slice(i,i+100),rows.filter(s=>ids.slice(i,i+100).includes(s.id)));success+=result.success_count;failed+=result.failed_count;}status('下载完成 '+success+' 首，失败 '+failed+' 首',failed>0);await refreshLocal();}finally{$('download-list').disabled=false;}});
 $('new-playlist').onclick=safe(async()=>{const name=await promptDialog('新建歌单');if(name){await bridge.userPlaylistsCreate(name);await refreshLocal();renderMyPlaylists();status('歌单已创建');}});
 $('play').onclick=safe(()=>player.toggle());$('previous').onclick=safe(()=>player.step(-1));$('next').onclick=safe(()=>player.step(1));
 $('mode').onclick=()=>{const modes=['sequence','shuffle','repeat-one','reverse','stop-after'];player.setMode(modes[(modes.indexOf(player.state().mode)+1)%modes.length]);saveSession(player.state(),true);};
 $('seek').addEventListener('pointerdown',()=>{seeking=true;});for(const name of ['pointerup','pointercancel','lostpointercapture'])$('seek').addEventListener(name,()=>{seeking=false;});
 $('seek').onchange=()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(Number($('seek').value),audio.duration);};
 $('volume').oninput=()=>{audio.volume=Number($('volume').value);};$('mute').onclick=()=>{if(audio.volume){mutedVolume=audio.volume;audio.volume=0;}else audio.volume=mutedVolume;};
 const openFullscreen=()=>bridge.openFullscreen(fullscreenState());
 $('open-fullscreen').onclick=openFullscreen;$('lyric-line').onclick=openFullscreen;
 async function toggleDesktopLyrics(){if(!settings)settings=await bridge.getSettings();if(settings.desktopLyricsEnabled){await bridge.closeFloatingLyrics();settings.desktopLyricsEnabled=false;}else{settings.desktopLyricsEnabled=true;await bridge.showFloatingLyrics();pushDesktopLyrics();}updateLyricsButton();return lyricsState();}
 $('lyrics-toggle').onclick=safe(toggleDesktopLyrics);
 bridge.onFloatingLyricsStatus(s=>{if(s.notice)status(s.notice);if(s.open===false&&settings){void bridge.getSettings().then(value=>{settings.desktopLyricsEnabled=value.desktopLyricsEnabled;updateLyricsButton();}).catch(()=>{});if(s.error)status(s.error,true);}});
 bridge.onFullscreenActive(active=>{fullscreenActive=active;if(!active&&!settings?.desktopLyricsEnabled)stopAlignment();publishFullscreen();if(active)void requestWordTimings();});
 bridge.onFullscreenControl(safe(message=>{
  if(message.action==='mode')return $('mode').click();
  if(message.action==='quality')return window.NeteaseDesktopHost.setQuality(message.value);
  if(message.action==='lyrics-toggle')return toggleDesktopLyrics().then(()=>publishFullscreen());
  if(message.action==='lyrics-lock')return window.NeteaseDesktopHost.toggleLyricsLock().then(()=>publishFullscreen());
  if(message.action==='retry-lyrics'){const t=player.state().track;if(t)return loadLyrics(t,player.serial());}
  if(message.action==='toggle')return player.toggle();
  if(message.action==='previous')return player.step(-1);
  if(message.action==='next')return player.step(1);
  if(message.action==='seek'&&Number.isFinite(audio.duration)){audio.currentTime=Math.max(0,Math.min(message.value,audio.duration));syncLyrics();player.emit();}
  if(message.action==='volume')audio.volume=Math.max(0,Math.min(1,message.value));
 }));
 document.addEventListener('dragstart',e=>{if(!e.target.closest('[data-select-kind="track"],[data-select-kind="playlist"],input,textarea,[contenteditable="true"]'))e.preventDefault();});
 $('tasks-button').onclick=safe(async()=>{(await bridge.downloadHistory()).forEach(t=>{const key=t.key||t.id,old=tasks.get(key);if(!old||(old.time||0)<(t.time||0))tasks.set(key,t);});renderTasks();showSheet('tasks-view');});
 let lyricLockDesired=!!settings?.floatingLyrics?.mouseThrough,lyricLockConfirmed=lyricLockDesired,lyricLockWorker=null;
 function setLyricLockDisplay(value){lyricLockDesired=lyricLockConfirmed=!!value;$('lock-lyrics').checked=lyricLockConfirmed;if(settings?.floatingLyrics)settings.floatingLyrics.mouseThrough=lyricLockConfirmed;updateLyricsButton();}
 bridge.onFloatingLyricsLockStatus(event=>{if(!lyricLockWorker)setLyricLockDisplay(event.locked);});
 $('lock-lyrics').onchange=()=>{
  lyricLockDesired=$('lock-lyrics').checked;if(lyricLockWorker)return;
  lyricLockWorker=(async()=>{
   while(lyricLockDesired!==lyricLockConfirmed){
    const wanted=lyricLockDesired;
    try{await bridge.lockFloatingLyrics(wanted);lyricLockConfirmed=wanted;if(settings?.floatingLyrics)settings.floatingLyrics.mouseThrough=wanted;updateLyricsButton();}
    catch(e){if(lyricLockDesired===wanted){lyricLockDesired=lyricLockConfirmed;$('lock-lyrics').checked=lyricLockConfirmed;status('桌面歌词锁定设置失败：'+(e.message||String(e)),true);}}
   }
  })().finally(()=>{lyricLockWorker=null;});
 };
 $('settings-button').onclick=safe(async()=>{if(lyricLockWorker)await lyricLockWorker;settings=await bridge.getSettings();$('download-dir').value=settings.downloadDir;$('parallel').value=settings.parallelDownloads;$('api-bases').value=settings.apiBases.join('\n');$('desktop-lyrics').checked=settings.desktopLyricsEnabled;setLyricLockDisplay(settings.floatingLyrics.mouseThrough);fillAppearance();showSheet('settings-view');void refreshAccount();});
 $('account-entry').onclick=()=>{$('settings-button').click();};
 $('settings-button').addEventListener('click',()=>{void safe(async()=>{const startup=await bridge.startupStatus();$('startup-toggle').checked=startup.enabled;$('startup-toggle').disabled=!startup.supported;$('startup-hint').textContent=startup.supported?'启用后开机静默运行；按 INS 呼出，空闲时低功耗待命。':'开发版请在打包后设置开机启动。';})();});
 $('startup-toggle').onchange=safe(async()=>{const wanted=$('startup-toggle').checked;try{const result=await bridge.setStartup(wanted);$('startup-toggle').checked=result.enabled;}catch(e){$('startup-toggle').checked=!wanted;throw e;}});
 let accountRefresh=0;
 function displayAccount(result){
  $('account-entry-label').textContent=result.loggedIn?(result.nickname||'已登录'):'未登录';const avatar=$('account-avatar'),placeholder=$('account-placeholder');avatar.hidden=!result.loggedIn||!result.avatarUrl;placeholder.hidden=!avatar.hidden;if(!avatar.hidden){avatar.src=result.avatarUrl;avatar.onerror=()=>{avatar.hidden=true;placeholder.hidden=false;};}else avatar.removeAttribute('src');
  $('account-status').textContent=result.loggedIn?'已登录'+(result.nickname?' · '+result.nickname:''):(result.message||result.error||'未登录');
  $('account-login').hidden=!!result.loggedIn;$('account-login').disabled=false;$('account-web-login').hidden=!!result.loggedIn;$('account-qq-login').hidden=!!result.loggedIn;$('account-logout').hidden=!(result.loggedIn||result.savedCredential);
  $('account-cookie-login').hidden=!!result.loggedIn;
 }
 async function refreshAccount(){
  const request=++accountRefresh;
  if(typeof bridge.accountStatus!=='function'){$('account-status').textContent='账号功能暂不可用';$('account-login').disabled=true;return;}
  try{const result=await bridge.accountStatus();if(request!==accountRefresh)return;
   displayAccount(result);
  }catch{if(request===accountRefresh){$('account-status').textContent='暂时无法获取登录状态';$('account-login').disabled=false;}}
 }
 bridge.onAccountStatus?.(result=>{accountRefresh++;displayAccount(result||{});invalidateSongAvailability();});
 const accountDialog=$('account-dialog');
 const accountLogin=window.MusicAccountLogin.createAccountLogin({bridge,onState:s=>{
  if(!accountDialog.open)return;
  if(s.phase==='starting'){$('account-qr').hidden=true;$('account-qr').removeAttribute('src');}
  if(s.image){$('account-qr').src=s.image;$('account-qr').hidden=false;}
  $('account-retry').hidden=!['expired','error'].includes(s.phase);
  $('account-qr-state').textContent=({starting:'正在获取二维码…',waiting:'等待扫码…',scanned:'已扫码，请在手机上确认。',authenticated:'登录成功',expired:'二维码已过期，请重新获取。',error:'登录未完成，请重试。'})[s.phase]||'';
  if(s.message&&['error','expired'].includes(s.phase))$('account-qr-state').textContent=s.message;
  if(s.phase==='authenticated'){invalidateSongAvailability();accountDialog.close();void refreshAccount();status('网易云账号已登录');}
 }});
 $('account-login').onclick=()=>{if(!accountDialog.open)accountDialog.showModal();void accountLogin.start();};
 const cookieDialog=$('cookie-dialog');
 $('account-cookie-login').onclick=()=>{$('cookie-value').value='';$('cookie-error').textContent='';cookieDialog.showModal();};
 cookieDialog.addEventListener('close',()=>{$('cookie-value').value='';void bridge.accountCancel().catch(()=>{});});
 $('cookie-submit').onclick=async()=>{
  const value=$('cookie-value').value.trim();$('cookie-value').value='';if(!value){$('cookie-error').textContent='请粘贴你自己的网易云登录 Cookie。';return;}
  $('cookie-submit').disabled=true;
  try{await bridge.accountImportCookie(value);cookieDialog.close();await refreshAccount();status('网易云账号已登录');}catch(e){$('cookie-error').textContent=e.message||'Cookie 验证失败';}finally{$('cookie-submit').disabled=false;}
 };
 let webLoginOpening=false;
 async function openWebLogin(mode){
  if(webLoginOpening)return;webLoginOpening=true;$('account-web-login').disabled=true;$('account-qq-login').disabled=true;
  try{if(typeof bridge.accountOpenWebLogin!=='function')throw Error();await bridge.accountOpenWebLogin(mode);status(mode==='qq'?'请在 QQ 官方授权窗口完成登录，关闭窗口可取消。':'请在网易云官方窗口选择手机号登录，关闭窗口可取消。');}
  catch{status('登录窗口暂时无法打开，请稍后重试。',true);}
  finally{webLoginOpening=false;$('account-web-login').disabled=false;$('account-qq-login').disabled=false;}
 }
 $('account-qq-login').onclick=()=>openWebLogin('qq');
 $('account-web-login').onclick=()=>openWebLogin('phone');
 bridge.onAccountWebStatus?.(value=>{
  if(value?.state==='checking')status('正在确认网易云登录状态…');
  else if(value?.state==='authenticated')status('网易云账号已登录');
  else if(value?.state==='cancelled')status('已取消网页登录');
  else if(value?.state==='error')status(value.message||'网易云官方网页暂时无法打开。',true);
  else if(value?.state==='waiting'&&value.message)status(value.message);
 });
 $('account-retry').onclick=()=>{void accountLogin.start();};
 // Cancel IPC immediately on user intent. A dialog close event can wait for
 // rendering in an occluded window while a network reply is already in flight.
 $('account-close').onclick=()=>{void accountLogin.cancel().catch(()=>{});accountDialog.close();};
 accountDialog.addEventListener('cancel',()=>{void accountLogin.cancel().catch(()=>{});});
 accountDialog.addEventListener('close',()=>{if(!accountDialog.open)void accountLogin.cancel().catch(()=>{});});
 $('account-logout').onclick=safe(async()=>{$('account-logout').disabled=true;try{await bridge.accountLogout();invalidateSongAvailability();await refreshAccount();status('网易云账号已退出');}finally{$('account-logout').disabled=false;}});
 for(const b of document.querySelectorAll('.back-button'))b.onclick=hideSheets;
 $('choose-dir').onclick=safe(async()=>{const dir=await bridge.chooseDirectory();if(dir)$('download-dir').value=dir;});$('open-dir').onclick=safe(()=>bridge.openDirectory());
 $('save-settings').onclick=safe(async()=>{if(lyricLockWorker)await lyricLockWorker;settings=await bridge.saveSettings({...settings,quality:$('download-quality').value,downloadDir:$('download-dir').value,apiBases:$('api-bases').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),parallelDownloads:Number($('parallel').value),desktopLyricsEnabled:$('desktop-lyrics').checked,floatingLyrics:readAppearance()});
  if(settings.desktopLyricsEnabled){await bridge.showFloatingLyrics();pushDesktopLyrics();}else await bridge.closeFloatingLyrics();updateLyricsButton();invalidateSongAvailability();status('设置已保存');});

 function fillAppearance(){
  $('download-quality').value=settings.quality||'best';
  $('player-bg-path').value=settings.playerBackgroundPath||'纯黑背景';const s=settings.floatingLyrics;
  for(const [id,key] of Object.entries({'lyric-color':'originalColor','translation-color':'translationColor','lyric-size':'fontSize','translation-size':'translationSize','lyric-glow':'glow','lyric-shadow':'shadow'}))$(id).value=s[key];
  $('show-original').checked=s.showOriginal;$('show-translation').checked=s.showTranslation;
 }
 function readAppearance(){return {...settings.floatingLyrics,originalColor:$('lyric-color').value,translationColor:$('translation-color').value,fontSize:Number($('lyric-size').value),translationSize:Number($('translation-size').value),glow:Number($('lyric-glow').value),shadow:Number($('lyric-shadow').value),showOriginal:$('show-original').checked,showTranslation:$('show-translation').checked};}
 $('choose-background').onclick=safe(async()=>{const result=await bridge.choosePlayerBackground();if(result){settings.playerBackgroundPath=result.path;$('player-bg-path').value=result.path;status('背景已更新，打开全屏即可查看');}});
 $('clear-background').onclick=safe(async()=>{await bridge.clearPlayerBackground();settings.playerBackgroundPath='';$('player-bg-path').value='纯黑背景';status('已恢复纯黑背景');});
 $('retry-current-lyrics').onclick=safe(()=>{const track=player.state().track;if(track)return loadLyrics(track,player.serial());});
 $('accept').onclick=safe(async()=>{settings=await bridge.saveSettings({...settings,disclaimerAcceptedVersion:1});$('welcome').close();});

 audio.ontimeupdate=()=>{player.emit();syncLyrics();};audio.onvolumechange=()=>{player.emit();clearTimeout(sessionVolumeTimer);sessionVolumeTimer=setTimeout(()=>saveSession(player.state(),true),120);};audio.onloadedmetadata=()=>player.emit();
 for(const event of ['play','pause','ended'])audio.addEventListener(event,()=>{player.emit();pushDesktopLyrics();saveSession(player.state(),true);void bridge.setPlaybackState(!audio.paused).catch(()=>{});});
 window.addEventListener('beforeunload',()=>saveSession(player.state(),true));
 audio.onended=()=>{void player.step(1,'ended');};audio.onerror=()=>{if(audio.src){forgetPlaybackAvailability();status('这首歌暂时无法播放，可以重新选择或检测音源。',true);}};
 bridge.onDownloadTask(t=>{tasks.set(t.key||t.id,{...t,time:t.time||Date.now()});$('task-badge').hidden=![...tasks.values()].some(v=>['running','queued'].includes(v.status));if(!$('tasks-view').hidden&&!taskRenderTimer)taskRenderTimer=setTimeout(()=>{taskRenderTimer=null;renderTasks();},150);});
 bridge.onBackendStatus(s=>{if(s.ok===false)status(s.message,true);});bridge.onOpenLyricsSettings(()=>$('settings-button').click());
 safe(async()=>{session=await bridge.loadPlaybackSession();audio.volume=Number.isFinite(session.volume)?Math.max(0,Math.min(1,session.volume)):.75;player.setMode(session.mode);settings=await bridge.getSettings();await player.setQuality(settings.playbackQuality||'standard');updateLyricsButton();await refreshLocal();rows=files.map(localRow);const remembered=rows.find(r=>r.file===session.file);if(remembered)await player.play(remembered,rows,{paused:true,resumeTime:session.time});sessionReady=true;const info=await bridge.appInfo();$('build-label').textContent='青春沿岸の音乐播放器 · '+info.version;if(!settings.disclaimerAcceptedVersion)$('welcome').showModal();void refreshAccount();status('');if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));if(!startupInteraction)await window.NeteaseHome?.();})();
})();
