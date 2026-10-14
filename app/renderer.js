'use strict';
(() => {
  const bridge = window.musicBridge;
  const $ = selector => document.querySelector(selector);
  const state = {view:'home', tracks:[], selected:new Set(), busy:false, settings:null, playlist:false, playingId:null, playToken:0, preparing:false, lyrics:[], lyricIndex:-1, playerInfo:null, playlists:[], activePlaylistId:null, immersive:false, downloadJobs:new Map(), activeDownloadBatches:0,query:'',page:1,total:0,paused:false,floating:false,playQueue:null,advancingPlaylist:false,advanceSerial:0,currentLocalName:null};

  const svg = {
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/><path d="M3 11h18"/>',
    heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.3 1A7 7 0 0 0 15 6l-.4-2.6h-4.1L10 6a7 7 0 0 0-1.6 1l-2.3-1-2 3.5L6.2 11a7 7 0 0 0 0 2L4 14.5 6 18l2.4-1a7 7 0 0 0 1.6 1l.5 2.6h4.1L15 18a7 7 0 0 0 1.6-1l2.3 1 2-3.5-2-1.5a7 7 0 0 0 .1-1z"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4.2 4.2"/>',
    music:'<path d="M9 19V5l12-2v14"/><circle cx="6" cy="19" r="3"/><circle cx="18" cy="17" r="3"/>',
    download:'<path d="M12 3v13m-5-5 5 5 5-5M4 19v2h16v-2"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    list:'<path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
    arrowRight:'<path d="M5 12h14m-7-7 7 7-7 7"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.1"/>',
    play:'<path d="m7 4 13 8-13 8z"/>',
    pause:'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    volume:'<path d="m11 5-5 4H3v6h3l5 4z"/><path d="M15 9a5 5 0 0 1 0 6M18 6a9 9 0 0 1 0 12"/>',
    external:'<path d="M13 5h6v6M19 5l-9 9M19 13v6H5V5h6"/>'
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${svg[name] || svg.music}</svg>`;
  function attachIcons(root=document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
      const key = el.dataset.icon.replace(/-([a-z])/g, (_m,c) => c.toUpperCase());
      el.innerHTML = icon(key);
    });
  }
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function setStatus(text, kind='info') {
    $('#status-text').textContent = text;
    $('#status-icon').innerHTML = icon(kind === 'error' ? 'info' : kind === 'ok' ? 'check' : 'info');
  }
  function showToast(text, error=false) {
    const toast = node('div','toast' + (error ? ' error' : ''),text);
    $('#toast-container').appendChild(toast);
    window.setTimeout(() => toast.remove(), 4400);
  }
  const errMessage = err => err && (err.message || err.error) ? (err.message || err.error) : String(err);
  function setBusy(active, label) {
    state.busy = active;
    $('#search-action').disabled = active;
    $('#search-input').disabled = active;
    $('#playlist-toggle').disabled = active;
    $('#download-selected').disabled = active || state.selected.size === 0;
    document.querySelectorAll('.track-action.download,.track-select').forEach(btn => btn.disabled = active);
    if (label) setStatus(label);
  }
  function select(id, checked, card) {
    if (checked) state.selected.add(String(id));
    else state.selected.delete(String(id));
    card.classList.toggle('selected', checked);
    card.querySelector('.track-select').setAttribute('aria-pressed',String(checked));
    $('#selected-count').textContent = state.selected.size;
    $('#download-selected').disabled = state.busy || !state.selected.size;
  }
  function trackCard(track) {
    const card=node('article','song-card');card.dataset.artist=(track.artists||'').toLowerCase();
    const art = node('div', 'track-icon');art.innerHTML=icon('music');
    // Only allow official music image CDN hosts; never render arbitrary API URLs.
    try{const url=new URL(track.cover_url||'');if(url.protocol==='https:' && /(^|\.)music\.(?:126|163)\.net$/.test(url.hostname)){
      const img=node('img','track-cover');img.src=url.href;img.alt='专辑封面';img.loading='lazy';
      img.onerror=()=>img.remove();art.appendChild(img);
    }}catch{}
    const info = node('div','track-info');
    const title = node('div','track-title',track.name || '未知歌曲'); title.title = track.name || '';
    const artist = node('div','track-meta',`歌手：${track.artists || '未知歌手'}`);
    info.append(title,artist);
    const ctrl = node('div','track-controls');
    const toggle = node('button','track-select');
    toggle.type = 'button';toggle.title='勾选歌曲';toggle.setAttribute('aria-label','勾选 '+(track.name||''));
    toggle.setAttribute('aria-pressed','false'); toggle.innerHTML=icon('check');
    toggle.addEventListener('click',()=>select(track.id,!state.selected.has(String(track.id)),card));
    const actions=node('div','track-actions');
    const download=node('button','track-action download');download.type='button';download.title='下载这首歌曲';download.setAttribute('aria-label','下载 '+(track.name||''));download.innerHTML=icon('download');
    download.addEventListener('click',()=>downloadSongs([String(track.id)]));
    actions.append(download);ctrl.append(toggle,actions);
    const job=node('div','track-job-state'); job.dataset.songId=String(track.id);
    const existing=state.downloadJobs.get(String(track.id));
    if(existing) {job.textContent=jobText(existing);job.dataset.status=existing.status;}
    info.appendChild(job);
    card.append(art,info,ctrl);
    return card;
  }
  function jobText(job) {
    const scope='';
    const names={queued:'已排队',running:'下载中',completed:'已完成',failed:'失败',cancelled:'已取消'};
    const pct=job.status==='running'&&job.progress?.percent!=null?` ${Number(job.progress.percent).toFixed(1)}%`:'';
    const speed=job.status==='running'&&job.progress?.speed ? ` · ${(job.progress.speed/1024/1024).toFixed(2)} MB/s`:'';
    return scope+(names[job.status]||'准备中')+pct+speed+(job.warning?` · ${String(job.warning).slice(0,100)}`:'')+(job.error?`：${String(job.error).slice(0,100)}`:'');
  }
  let taskRefreshTimer=null;
  function queueTaskRefresh(){
    if(taskRefreshTimer!==null)return;
    taskRefreshTimer=setTimeout(()=>{taskRefreshTimer=null;if(state.view==='local')void renderTasks();},300);
  }
  function displayDownloadJob(job) {
    if(!job || !job.id) return;
    const id=String(job.id);
    state.downloadJobs.set(id,{...(state.downloadJobs.get(id)||{}),...job,progress:['completed','failed','cancelled'].includes(job.status)?null:(job.progress??state.downloadJobs.get(id)?.progress??null)});
    for(const el of document.querySelectorAll('.track-job-state')){
      if(el.dataset.songId===id){el.textContent=jobText(state.downloadJobs.get(id));el.dataset.status=job.status;}
    }
    const panel=$('#download-activity');
    if(panel){
      const counts={queued:0,running:0,completed:0,failed:0,cancelled:0};
      for(const entry of state.downloadJobs.values()){
        if(entry.status in counts)counts[entry.status]++;
      }
      panel.hidden=false;
      $('#download-activity-label').textContent=`下载任务 · ${counts.running} 首进行中 · ${counts.queued} 首排队 · ${counts.completed} 首完成 · ${counts.failed} 首失败`;
      const latest=[...state.downloadJobs.entries()].slice(-3).reverse();
      const detail=$('#download-activity-items');detail.replaceChildren();
      for(const [songId,entry] of latest){
        const track=state.tracks.find(x=>String(x.id)===songId);
        const title=track?.name||songId;
        const item=node('span','download-task-chip',`${title} · ${jobText(entry)}`);
        item.title=`${title} · ${jobText(entry)}`;
        detail.appendChild(item);
      }
    }
    if(state.view==='local')queueTaskRefresh();
  }
  const audio=()=>$('#music-audio');
  function timeLabel(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const n=Math.floor(seconds);
    return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
  }
  const parseLrc=window.MusicLRC.parseLrc;
  const lyricSeekTime=window.MusicLyricNavigation.seekTime;
  const inertiaStep=window.MusicLyricNavigation.inertiaStep;
  let manualLyricScrollUntil=0, lyricDrag=null, suppressLyricClick=false;
  let lyricGlideFrame=0, lyricSeekSerial=0;
  function holdManualLyricScroll(milliseconds=9500){manualLyricScrollUntil=performance.now()+milliseconds;}
  function stopLyricGlide(){if(lyricGlideFrame)cancelAnimationFrame(lyricGlideFrame);lyricGlideFrame=0;}
  function beginLyricGlide(pane,velocity){
    stopLyricGlide();
    if(Math.abs(velocity)<.12)return;
    let last=performance.now(),speed=Math.max(-4,Math.min(4,velocity));
    const tick=now=>{
      lyricGlideFrame=0;
      const step=inertiaStep(speed,now-last);last=now;
      const old=pane.scrollTop;
      pane.scrollTop+=step.pixels;
      speed=step.velocity;
      if(Math.abs(speed)<.04||Math.abs(pane.scrollTop-old)<.15)return;
      holdManualLyricScroll();
      lyricGlideFrame=requestAnimationFrame(tick);
    };
    lyricGlideFrame=requestAnimationFrame(tick);
  }
  function seekLyricLine(lineIndex){
    const row=state.lyrics[lineIndex],media=audio();
    if(!row||!Number.isFinite(row.time)){showToast('这句歌词没有有效时间戳，无法跳转。',true);return false;}
    if(!media.src){showToast('请先播放一首本地歌曲，再点击歌词跳转。',true);return false;}
    const target=lyricSeekTime(row.time,media.duration);
    if(target===null){
      showToast('歌词时间 '+timeLabel(row.time)+' 超出当前音频时长 '+timeLabel(media.duration)+'；已阻止错误跳转到开头。请检查下载文件是否完整。',true);
      return false;
    }
    stopLyricGlide();
    const token=state.playToken,serial=++lyricSeekSerial;
    const apply=()=>{
      if(token!==state.playToken||serial!==lyricSeekSerial)return;
      try{
        media.currentTime=target;
        manualLyricScrollUntil=0;
        syncLyrics(true);
        // Electron may accept a currentTime assignment without actually making the media seekable.
        // Report that condition rather than silently showing the first lyric again.
        setTimeout(()=>{
          if(token!==state.playToken||serial!==lyricSeekSerial||media.seeking||media.readyState===0)return;
          if(Math.abs(media.currentTime-target)>2)
            showToast('歌词定位未成功（目标 '+timeLabel(target)+'，实际 '+timeLabel(media.currentTime)+'）。请检查本地音频格式及可跳转性。',true);
        },900);
      }catch(e){showToast('歌词跳转失败：'+errMessage(e),true);}
    };
    if(media.readyState===0){
      media.addEventListener('loadedmetadata',apply,{once:true});
      return true;
    }
    apply();
    return true;
  }
  function enableLyricBrowsing(pane){
    // Native wheel/touch scroll is already inertial. Stop only a previous mouse glide.
    pane.addEventListener('wheel',()=>{stopLyricGlide();holdManualLyricScroll();},{passive:true});
    pane.addEventListener('touchstart',()=>{stopLyricGlide();holdManualLyricScroll();},{passive:true});
    pane.addEventListener('dragstart',event=>event.preventDefault());
    pane.addEventListener('pointerdown',e=>{
      if(e.button!==0||e.pointerType==='touch')return;
      stopLyricGlide();
      lyricDrag={id:e.pointerId,initialY:e.clientY,lastY:e.clientY,lastAt:performance.now(),moved:false,velocity:0};
    });
    pane.addEventListener('pointermove',e=>{
      const d=lyricDrag;if(!d||d.id!==e.pointerId)return;
      if(!d.moved&&Math.abs(e.clientY-d.initialY)<6)return;
      if(!d.moved){d.moved=true;pane.setPointerCapture?.(e.pointerId);}
      const now=performance.now(),elapsed=Math.max(8,now-d.lastAt);
      const delta=d.lastY-e.clientY;
      pane.scrollTop+=delta;
      const velocity=delta/elapsed;
      d.velocity=d.velocity*.45+velocity*.55;
      d.lastY=e.clientY;d.lastAt=now;
      holdManualLyricScroll();
      e.preventDefault();
    });
    function endBrowse(event){
      const d=lyricDrag;if(!d||event.pointerId!==d.id)return;
      lyricDrag=null;
      if(d.moved){
        suppressLyricClick=true;
        setTimeout(()=>{suppressLyricClick=false;},120);
        if(event.type==='pointerup'&&performance.now()-d.lastAt<100)beginLyricGlide(pane,d.velocity);
      }
      if(pane.hasPointerCapture?.(event.pointerId))pane.releasePointerCapture(event.pointerId);
    }
    pane.addEventListener('pointerup',endBrowse);
    pane.addEventListener('pointercancel',endBrowse);
    pane.addEventListener('lostpointercapture',event=>{
      if(lyricDrag?.id===event.pointerId)endBrowse(event);
    });
    pane.addEventListener('click',e=>{
      if(suppressLyricClick){e.preventDefault();e.stopImmediatePropagation();}
    },true);
  }

  const songMetadata=new Map();
  const safeCoverUrl=url=>{try{const u=new URL(url);return u.protocol==='https:'&&/(^|\.)music\.(?:126|163)\.net$/.test(u.hostname)?u.href:null}catch{return null}};
  function clearLyrics(message='正在获取歌词…') {
    state.lyrics=[];state.lyricIndex=-1;
    $('#player-synced-line').textContent=message;
    $('#immersive-lyrics').replaceChildren(node('div','immersive-empty',message));
  }
  function drawLyrics(result) {
    const rows=parseLrc(result.lrc,result.translated_lrc);
    state.lyrics=rows;state.lyricIndex=-1;
    const pane=$('#immersive-lyrics');pane.replaceChildren();
    if(!rows.length){
      const txt=result.lrc?.trim()?result.lrc.slice(0,3500):'这首歌暂时没有可用同步歌词';
      pane.appendChild(node('div','immersive-empty',txt));
      $('#player-synced-line').textContent=txt;
      updateFloatingLine();return;
    }
    rows.forEach((row,i)=>{
      const el=node('div','immersive-line',row.text);el.dataset.index=String(i);
      if(row.translation)el.appendChild(node('span','immersive-translation',row.translation));
      el.addEventListener('click',()=>seekLyricLine(i));
      pane.append(el);
    });
    syncLyrics(true);
  }
  function syncLyrics(force=false) {
    const rows=state.lyrics;if(!rows.length)return;
    const t=audio().currentTime||0;
    let lo=0,hi=rows.length-1,idx=-1;
    while(lo<=hi){const mid=(lo+hi)>>1;if(rows[mid].time<=t+.025){idx=mid;lo=mid+1;}else hi=mid-1;}
    if(!force&&state.lyricIndex===idx)return;
    const pane=$('#immersive-lyrics');
    if(state.lyricIndex>=0){const previous=pane.children[state.lyricIndex];previous?.classList.remove('active');previous?.classList.add('past')}
    state.lyricIndex=idx;
    if(idx>=0){
      const current=pane.children[idx];current?.classList.add('active');current?.classList.remove('past');
      $('#player-synced-line').textContent=rows[idx].text;
      if(state.immersive&&(force||performance.now()>=manualLyricScrollUntil))current?.scrollIntoView({behavior:force?'instant':'smooth',block:'center'});
    }else $('#player-synced-line').textContent='♪ 音乐即将开始';
    updateFloatingLine();
  }
  function updateFloatingLine(){
    if(!state.floating)return;
    const row=state.lyrics[state.lyricIndex];
    void bridge.updateFloatingLyrics({title:state.playerInfo?.name||'桌面歌词',line:row?.text||'',translation:row?.translation||''}).catch(()=>{});
  }
  // requestAnimationFrame follows the audio playback clock, not the throttled HTMLAudioElement timeupdate event.
  let lyricFrame=0;
  function lyricClock(){lyricFrame=0;syncLyrics();if(!audio().paused&&!audio().ended)lyricFrame=requestAnimationFrame(lyricClock)}
  function clockOn(){if(!lyricFrame)lyricFrame=requestAnimationFrame(lyricClock)}
  function clockOff(){if(lyricFrame)cancelAnimationFrame(lyricFrame);lyricFrame=0;syncLyrics(true)}
  function updatePlayerControls(){
    $('#player-toggle').innerHTML=icon(!audio().paused&&!audio().ended?'pause':'play');
    $('#immersive-toggle').innerHTML=icon(!audio().paused&&!audio().ended?'pause':'play');
    // Never mutate search-result download buttons. Only the player button reflects playback state.
    document.body.classList.toggle('immersive-paused',audio().paused);
    document.body.classList.toggle('immersive-active',!audio().paused);
  }
  function showImmersive(open){
    state.immersive=!!open;
    document.body.classList.toggle('immersive-open',state.immersive);
    $('#immersive-player').hidden=!state.immersive;
    if(state.immersive)syncLyrics(true);
  }
  function splitLongTitle(input){
    const title=String(input||'等待播放').trim();
    // Move version, vocalist and feat. suffix to a smaller subtitle, never silently drop words.
    if(title.length<34)return {heading:title,extra:''};
    const match=/\s+(?=(?:feat\.?|ft\.?|with\s)|[-－—_／/]\s*[^-－—_／/]{2,}$)/i.exec(title);
    if(match&&match.index>5)return {heading:title.slice(0,match.index).trim(),extra:title.slice(match.index).trim()};
    const cut=title.slice(14,Math.min(title.length,42)).search(/[\s_\/－—-]/);
    if(cut>=0&&title.length>48){const end=14+cut;return {heading:title.slice(0,end).trim(),extra:title.slice(end).trim()};}
    return {heading:title,extra:''};
  }
  function renderImmersiveInfo(info){
    const title=splitLongTitle(info?.name);
    $('#immersive-title').textContent=title.heading;
    $('#immersive-title').title=info?.name||'';
    $('#immersive-title-extra').textContent=title.extra;
    $('#immersive-title-extra').hidden=!title.extra;
    $('#immersive-artist').textContent=info?.artists||'本地音乐';
    const art=safeCoverUrl(info?.cover_url);
    const mini=$('#player-cover-art');if(mini)mini.src=art||'../assets/avatar.png';
  }
  async function enrichLocalMetadata(id,token){
    if(!id)return;
    try{
      let song=songMetadata.get(String(id));
      if(!song){song=await bridge.songInfo(String(id));if(song)songMetadata.set(String(id),song)}
      if(token!==state.playToken||!song)return;
      const cover=safeCoverUrl(song.cover_url);
      if(cover){state.playerInfo={...state.playerInfo,cover_url:cover};renderImmersiveInfo(state.playerInfo)}
      if(song.artists && !state.playerInfo?.artists){state.playerInfo.artists=song.artists;$('#player-artist').textContent=song.artists;$('#immersive-artist').textContent=song.artists}
    }catch{/* network metadata is optional; keep software icon as fallback */}
  }
  async function showBackground(){
    const v=$('#immersive-bg-video'),im=$('#immersive-bg-image');
    try{
      const info=await bridge.playerBackground();
      v.pause();v.onerror=null;v.removeAttribute('src');v.load();v.hidden=true;
      im.removeAttribute('src');im.hidden=true;
      if(info?.kind==='video'){
        v.onerror=()=>{v.hidden=true;showToast('动态背景无法播放。建议将原视频转换为 H.264 MP4 后重新选择。',true);};
        v.src=info.url;v.hidden=false;
        await v.play().catch(e=>{v.hidden=true;showToast('动态背景启动失败：'+errMessage(e),true);});
      }else if(info?.kind==='image'){
        im.src=info.url;im.hidden=false;
      }else if(info?.kind==='missing'){
        showToast('原来选定的动态背景文件已丢失。请到「设置 → 沉浸播放背景」重新选择柠檬视频。',true);
      }
    }catch(e){showToast('读取动态背景失败：'+errMessage(e),true);}
  }
  async function loadLyrics(id,token) {
    if(!id){clearLyrics('本地音频没有可识别的网易云歌曲 ID');return;}
    try {
      const lyrics=await bridge.fetchLyrics(String(id));
      if(token!==state.playToken)return;
      drawLyrics(lyrics);
      if(!lyrics.found && lyrics.diagnostic?.length)setStatus('歌词暂无结果：'+lyrics.diagnostic.at(-1),'error');
    } catch(e) {
      if(token===state.playToken){clearLyrics('歌词接口请求失败：'+errMessage(e));}
    }
  }
  async function startAudio(info, url, token, id) {
    if(token!==state.playToken)return;
    state.playingId=id?String(id):null;
    state.playerInfo=info;
    $('#player-song').textContent=info.name||'未知歌曲';
    $('#player-artist').textContent=(info.artists||'本地音乐')+(info.fromCache?' · 已缓存':' · 新缓存');
    renderImmersiveInfo(info);
    void enrichLocalMetadata(id,token);
    clearLyrics();
    updateFloatingLine();
    if(token===state.playToken)void loadLyrics(id,token);
    audio().src=url;
    audio().load();
    updatePlayerControls();
    state.preparing=false;
    let started=false;
    try {await audio().play();started=true;setStatus(`正在播放：${info.name||'音乐'}`,'ok');}
    catch(e){if(token===state.playToken)setStatus('试听源不可播放，正在尝试缓存备用音源…','error');}
    updatePlayerControls();
    return started;
  }
  function stopLocalPlaybackIfRenaming(name){
    if(state.currentLocalName!==name)return;
    audio().pause();audio().removeAttribute('src');audio().load();
    state.playToken++;state.advanceSerial++;state.playQueue=null;
    state.currentLocalName=null;state.playingId=null;
    clearLyrics('请选择歌曲');updatePlayerControls();
  }
  async function playLocalFile(file,queue=null,automatic=false) {
    if(!automatic)state.advanceSerial++;
    const token=++state.playToken;
    audio().pause();
    state.preparing=true;
    state.currentLocalName=file.name;
    state.playQueue=queue?{id:queue.id,tracks:[...queue.tracks],index:queue.index}:null;
    try {
      const info=await bridge.playLocal(file.name);
      if(token!==state.playToken)return false;
      return await startAudio(info,info.url,token,info.id)===true;
    }catch(e){
      if(token===state.playToken)showToast('无法播放「'+file.name+'」：'+errMessage(e),true);
      return false;
    }finally{
      if(token===state.playToken)state.preparing=false;
    }
  }
  async function advancePlaylist(){
    const q=state.playQueue;
    if(!q?.tracks.length||state.advancingPlaylist)return;
    const serial=++state.advanceSerial;
    state.advancingPlaylist=true;
    let success=false;
    try{
      for(let step=1;step<=q.tracks.length;step++){
        if(serial!==state.advanceSerial)return;
        const index=(q.index+step)%q.tracks.length;
        success=await playLocalFile({name:q.tracks[index]},{id:q.id,tracks:q.tracks,index},true);
        if(serial!==state.advanceSerial)return;
        if(success)return;
      }
    }finally{
      state.advancingPlaylist=false;
      if(!success&&serial===state.advanceSerial){
        state.playQueue=null;
        showToast('歌单没有可继续播放的歌曲，已停止。',true);
      }
    }
  }
  async function updateCacheStats(){
    try {const stats=await bridge.cacheStats();$('#cache-stats').textContent=`已缓存 ${stats.count} 首 · ${(stats.bytes/1024/1024).toFixed(1)} MB`;}
    catch {$('#cache-stats').textContent='缓存信息暂时不可用';}
  }
  function showTracks(tracks, total=null) {
    state.tracks = tracks;
    state.selected.clear();
    $('#selected-count').textContent = '0';
    $('#download-selected').disabled = true;
    const parent = $('#songs');parent.replaceChildren();
    if (!tracks.length) {
      const empty = node('div','empty-state');
      const art = node('div','empty-art');art.innerHTML=icon('music');
      empty.append(art,node('strong','', '没有找到匹配的歌曲'),node('span','', '试试加上歌手名，或换一个关键词。'));
      parent.appendChild(empty);
    } else {
      for (const t of tracks) parent.appendChild(trackCard(t));
    }
    const suffix = Number.isInteger(total) && total > tracks.length ? ` / 共 ${total} 首` : '';
    $('#results-count').textContent = `显示 ${tracks.length} 首${suffix}`;
    $('#results-scroller').scrollTop = 0;
    $('#artist-filter').value='';
  }
  async function search(event) {
    if (event) event.preventDefault();
    if (state.busy) return;
    const q=$('#search-input').value.trim();
    if (!q) {showToast('先输入歌名或歌手名。',true);$('#search-input').focus();return;}
    setBusy(true,`正在搜索「${q}」…`);
    try {
      state.query=q;state.page=1;
      const result=await bridge.search(q,1);
      if (!result || !Array.isArray(result.results)) throw new Error('搜索接口没有返回歌曲列表');
      state.playlist=false;
      showTracks(result.results,result.total);
      updatePagination(result);
      setStatus(result.results.length ? `搜索完成，找到 ${result.results.length} 条结果。选择歌曲后下载。` : '未找到匹配歌曲，请尝试其他关键词。','ok');
    } catch(e) {setStatus(`搜索失败：${errMessage(e)}`,'error');showToast(`搜索失败：${errMessage(e)}`,true);}
    finally {setBusy(false);}
  }
  function updatePagination(res){
    state.total=Number(res.total||0);$('#page-label').textContent=`第 ${state.page} 页`;
    $('#page-prev').disabled=state.page<=1;
    $('#page-next').disabled=state.total>0?state.page*40>=state.total:(res.results?.length||0)<40;
  }
  async function changePage(delta){
    if(state.busy||!state.query)return;
    const next=state.page+delta;if(next<1)return;
    setBusy(true,'正在读取第 '+next+' 页…');
    try{const result=await bridge.search(state.query,next);state.page=next;showTracks(result.results,result.total);updatePagination(result);}
    catch(e){showToast('翻页失败：'+errMessage(e),true);}
    finally{setBusy(false);}
  }
  async function prefetchLyricsForDownloads(ids){
    // Prefetch concurrently with downloads, but never spawn 50 Python processes at once.
    const pending=[...ids];
    const worker=async()=>{while(pending.length){const id=pending.shift();try{await bridge.fetchLyrics(id)}catch{/* lyrics remain optional */}}};
    await Promise.all(Array.from({length:Math.min(2,pending.length)},()=>worker()));
  }
  async function downloadSongs(ids) {
    const unique=[...new Set((ids||[]).map(String))];
    if(!unique.length) return;
    state.activeDownloadBatches++;
    void prefetchLyricsForDownloads(unique);
    setStatus(`已提交 ${unique.length} 首歌曲：最多 ${state.settings?.parallelDownloads||3} 首并行，其余自动排队。`);
    try {
      const res=await bridge.download(unique);
      if (!res || !Array.isArray(res.results)) throw new Error('下载进程没有返回有效结果');
      const success=Number(res.success_count ?? res.results.filter(x=>x.ok).length);
      const fail=Number(res.failed_count ?? res.results.filter(x=>!x.ok).length);
      const downgraded=res.results.filter(x=>x.warning).map(x=>`${x.song?.name||x.song?.id||''}：${x.warning}`);
      if(downgraded.length)showToast(`音质提醒：${downgraded.slice(0,2).join('；')}`);
      if (fail) {
        const first=res.results.find(x=>!x.ok);
        setStatus(`本批下载结束：成功 ${success} 首，失败 ${fail} 首。${first?.error || ''}`,'error');
        showToast(`本批成功 ${success} 首，失败 ${fail} 首；可到「本地」查看结果。`,true);
      } else {
        setStatus(`本批下载完成：${success} 首。已保存到设置的下载目录。`,'ok');
        showToast(`已成功保存 ${success} 首音乐。`);
      }
      if(downgraded.length)setStatus('音质提醒：'+downgraded[0]);
    } catch(e) {setStatus(`下载失败：${errMessage(e)}`,'error');showToast(`下载失败：${errMessage(e)}`,true);}
    finally { state.activeDownloadBatches--; if(state.view==='local')void refreshLocal(); }
  }
  async function playlist(event) {
    if(event) event.preventDefault();
    if(state.busy) return;
    const id=$('#playlist-input').value.trim();
    if (!id) {showToast('先输入歌单链接或 ID。',true);return;}
    setBusy(true, '正在读取歌单…');
    try {
      const res=await bridge.playlist(id);
      if (!res || !Array.isArray(res.tracks)) throw new Error('歌单接口没有返回歌曲列表');
      showTracks(res.tracks,res.total);
      state.playlist=true;$('#page-prev').disabled=true;$('#page-next').disabled=true;$('#page-label').textContent='歌单曲目';
      if (res.possibly_incomplete) showToast('注意：接口可能只返回了歌单中的部分歌曲。',true);
      setStatus(`已读取 ${res.tracks.length} 首歌曲。可选择其中一首或多首下载。`,'ok');
    } catch(e) {showToast(errMessage(e),true);setStatus(`读取歌单失败：${errMessage(e)}`,'error');}
    finally {setBusy(false);}
  }
  async function showView(view){
    state.view=view;
    document.querySelectorAll('.nav-item').forEach(e=>e.classList.toggle('active',e.dataset.view===view));
    document.querySelectorAll('.view').forEach(e=>e.classList.toggle('active',e.id==='view-'+view));
    if(view==='local'){await refreshLocal();await renderTasks()}
    if(view==='playlists')await refreshPlaylists();
    if(view==='settings')renderSettings();
  }
  function songName(file){return file.name.replace(/\s*\[\d+\]\.[^.]+$/,'')}
  async function addLocalToPlaylist(file){
    try{
      stopLocalPlaybackIfRenaming(file.name);
      await bridge.playlistsAdd('default',file.name);
      showToast('已加入我的歌单，文件名添加 [歌单] 前缀。');
      await refreshLocal();
      if(state.view==='playlists')await refreshPlaylists();
    }catch(e){showToast(errMessage(e),true)}
  }
  async function removeLocalFromPlaylist(file){
    try{
      stopLocalPlaybackIfRenaming(file.name);
      await bridge.playlistsRemove('default',file.name);
      showToast('已移出歌单，文件名恢复原样。');
      await refreshLocal();
      if(state.view==='playlists')await refreshPlaylists();
    }catch(e){showToast(errMessage(e),true)}
  }
  async function deleteLocalFile(file){
    const warning=file.inPlaylist?'【这首歌曲属于我的歌单】':'这首歌曲不在歌单中';
    if(!confirm(warning+'\\n确定把「'+file.name+'」移入回收站吗？同名歌词文件也会一起移入回收站。'))return;
    try{
      stopLocalPlaybackIfRenaming(file.name);
      await bridge.deleteLocal(file.name,true);
      showToast('歌曲已移入回收站，可在 Windows 回收站中恢复。');
      await refreshLocal();
      if(state.view==='playlists')await refreshPlaylists();
    }catch(e){showToast('删除失败：'+errMessage(e),true)}
  }
  async function refreshPlaylists(){
    try{
      const list=await bridge.playlistsList();
      state.playlists=list;state.activePlaylistId='default';
      const cur=list[0],container=$('#my-playlist-tracks');container.replaceChildren();
      if(!cur?.tracks?.length){
        container.append(node('div','empty-simple','歌单还没有歌曲。请从「本地音乐」添加。'));
        return;
      }
      for(const [index,name] of cur.tracks.entries()){
        const row=node('div','playlist-entry');
        row.append(node('strong','',songName({name})));
        const play=node('button','','播放');
        play.onclick=()=>{void playLocalFile({name},{id:'default',tracks:cur.tracks,index})};
        const remove=node('button','','移出歌单');
        remove.onclick=()=>{void removeLocalFromPlaylist({name,inPlaylist:true})};
        row.append(play,remove);container.append(row);
      }
    }catch(e){showToast('读取歌单失败：'+errMessage(e),true)}
  }
  async function refreshLocal(){
    const parent=$('#local-list');parent.replaceChildren();
    try{
      const files=await bridge.listFiles();
      if(!files.length){parent.append(node('div','empty-simple','当前目录中还没有音乐文件。'));return}
      for(const file of files){
        const row=node('div','local-item');
        if(file.inPlaylist)row.classList.add('in-playlist');
        const i=node('span');i.innerHTML=icon('music');
        const name=node('span','local-item-name',file.name);name.title=file.name;
        const size=node('span','local-item-size',(file.size/1024/1024).toFixed(1)+' MB');
        const ops=node('div','local-ops');
        const play=node('button','local-play','播放');play.type='button';play.onclick=()=>{void playLocalFile(file)};
        const membership=node('button','local-play',file.inPlaylist?'移出歌单':'＋ 加入歌单');
        membership.type='button';
        membership.onclick=()=>{void(file.inPlaylist?removeLocalFromPlaylist(file):addLocalToPlaylist(file))};
        const del=node('button','local-delete','删除');del.type='button';del.onclick=()=>{void deleteLocalFile(file)};
        ops.append(play,membership,del);row.append(i,name,size,ops);parent.append(row);
      }
    }catch(e){showToast('本地列表加载失败：'+errMessage(e),true)}
  }
  let taskRenderVersion=0;
  async function renderTasks(){
    const root=$('#task-list'),holder=$('#local-downloads');if(!root||!holder)return;
    const requestVersion=++taskRenderVersion;
    try{const rows=(await bridge.downloadHistory()).filter(x=>x.status!=='completed');if(requestVersion!==taskRenderVersion)return;root.replaceChildren();
      holder.hidden=rows.length===0;
      $('#download-list-summary').textContent=`${rows.length} 项待处理 · 点击${holder.open?'收起':'展开'}`;
      if(!rows.length){holder.open=false;return;}
      for(const entry of rows){
        if(entry.id){const cleaned={...entry,progress:entry.status==='running'?entry.progress:null};state.downloadJobs.set(String(entry.id),cleaned);}
        const card=node('div','task-row');
        const left=node('div','task-main');
        const id=String(entry.id||'');const track=state.tracks.find(x=>String(x.id)===id);
        left.append(node('strong','',track?.name||entry.name||`歌曲 ${id}`),node('span','',jobText(entry)));
        if(entry.status==='running'&&Number.isFinite(Number(entry.progress?.percent))){const bar=node('div','task-progress');const fill=node('div','task-progress-fill');fill.style.width=`${Math.max(0,Math.min(100,Number(entry.progress.percent)))}%`;bar.append(fill);left.append(bar);}
        const actions=node('div','task-actions');
        if(['queued','running'].includes(entry.status)){const btn=node('button','subtle-action','取消');btn.onclick=async()=>{await bridge.cancelDownload(id);await renderTasks()};actions.append(btn)}
        if(['failed','cancelled'].includes(entry.status)){const btn=node('button','soft-action','重试');btn.onclick=()=>{btn.disabled=true;showToast('已重新提交下载任务');void bridge.retryDownload(id).then(()=>renderTasks(),e=>{showToast(errMessage(e),true);void renderTasks()});};actions.append(btn)}
        card.append(left,actions);root.append(card);
      }
    }catch(e){showToast(errMessage(e),true)}
  }
  const defaultLyricStyle=()=>({background:'none',originalColor:'#FFFFFF',translationColor:'#FFFFFF',outlineColor:'#FFFFFF',outlineWidth:0,glow:14,
    shadow:2,fontSize:30,translationSize:18,lineHeight:1.28,width:800,align:'center',showOriginal:true,
    showTranslation:true,alwaysOnTop:true,opacity:100,autoHideEmpty:false,mouseThrough:false});
  const lyricInputs={background:'lyr-background',align:'lyr-align',originalColor:'lyr-original-color',
    translationColor:'lyr-translation-color',outlineColor:'lyr-outline-color',outlineWidth:'lyr-outline-width',
    fontSize:'lyr-font-size',translationSize:'lyr-translation-size',width:'lyr-width',lineHeight:'lyr-line-height',
    opacity:'lyr-opacity',shadow:'lyr-shadow',glow:'lyr-glow',showOriginal:'lyr-show-original',showTranslation:'lyr-show-translation',
    alwaysOnTop:'lyr-always-on-top',autoHideEmpty:'lyr-auto-hide-empty',mouseThrough:'lyr-mouse-through'};
  function fillLyricsStyle(style){
    const s={...defaultLyricStyle(),...style};
    for(const [key,id] of Object.entries(lyricInputs)){
      const el=$('#'+id);if(el.type==='checkbox')el.checked=!!s[key];else el.value=String(s[key]);
    }
  }
  function readLyricsStyle(){
    const s={};
    for(const [key,id] of Object.entries(lyricInputs)){
      const el=$('#'+id);s[key]=el.type==='checkbox'?el.checked:el.type==='range'||el.type==='number'?Number(el.value):el.value;
    }
    return s;
  }
  function updateDesktopLyricsToggle(){
    const on=!!state.floating;
    const button=$('#toggle-desktop-lyrics');
    button.setAttribute('aria-pressed',String(on));
    button.setAttribute('aria-label',on?'关闭桌面歌词':'开启桌面歌词');
    $('#desktop-lyrics-button-text').textContent=on?'桌面歌词 · 开':'桌面歌词 · 关';
    $('#desktop-lyrics-enabled').checked=on;
  }
  async function toggleDesktopLyrics(next){
    const enabled=typeof next==='boolean'?next:!state.floating;
    const btn=$('#toggle-desktop-lyrics');btn.disabled=true;
    try{
      if(enabled){await bridge.showFloatingLyrics();state.floating=true;updateFloatingLine();}
      else {await bridge.closeFloatingLyrics();state.floating=false;}
      if(state.settings)state.settings=await bridge.saveSettings({...state.settings,desktopLyricsEnabled:enabled});
      updateDesktopLyricsToggle();
    }catch(e){showToast('桌面歌词切换失败：'+errMessage(e),true);}
    finally{btn.disabled=false;}
  }
  function renderSettings() {
    const s=state.settings;
    if(!s)return;
    $('#download-dir').value=s.downloadDir;
    $('#api-bases').value=(s.apiBases||[]).join('\n');
    $('#cache-limit').value=String(s.cacheLimitMB||1024);
    $('#parallel-downloads').value=String(s.parallelDownloads||3);
    fillLyricsStyle(s.floatingLyrics);
    $('#desktop-lyrics-enabled').checked=s.desktopLyricsEnabled===true;
    $('#player-bg-path').value=s.playerBackgroundPath||'';
    void updateCacheStats();
    updateDesktopLyricsToggle();
  }
  function openFirstRun(reviewOnly=false){
    $('#agree-disclaimer').checked=false;$('#first-confirm').disabled=true;
    $('#first-run-title').textContent='免责声明';$('#first-run').hidden=false;
  }
  async function init() {
    attachIcons();
    if(!bridge){setStatus('未找到桌面后端：请通过 Electron 启动本项目，而不是直接打开 HTML。','error');return;}
    bridge.onProgress(evt => {
      // 进度消息只更新对应歌曲，不覆盖搜索与试听状态。
      const id=evt?.id;
      const message=String(evt?.message||'').trim().split('\n').filter(Boolean).pop();
      if(id && evt.progress){const old=state.downloadJobs.get(String(id));if(old)displayDownloadJob({...old,progress:evt.progress});}
      if(id && message) {
        const entry=state.downloadJobs.get(String(id));
        if(entry?.status==='running') {
          const name=state.tracks.find(t=>String(t.id)===String(id))?.name||String(id);
          const chip=document.querySelector(`.track-job-state[data-song-id="${String(id)}"]`);
          if(chip)chip.title=`${name} · ${message.slice(0,180)}`;
        }
      }
    });
    enableLyricBrowsing($('#immersive-lyrics'));
    bridge.onDownloadTask(task=>displayDownloadJob(task));
    bridge.onFloatingLyricsStatus(info=>{state.floating=!!info.open;updateDesktopLyricsToggle();});
    bridge.onOpenLyricsSettings(()=>showView('settings'));
    document.querySelectorAll('.nav-item').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.view)));
    $('#search-form').addEventListener('submit',search);
    $('#example-search').addEventListener('click',()=>{$('#search-input').value='我的悲伤是水做的 洛天依';search();});
    $('#download-selected').addEventListener('click',()=>downloadSongs([...state.selected]));
    $('#artist-filter').addEventListener('input',()=>{const q=$('#artist-filter').value.trim().toLowerCase();document.querySelectorAll('.song-card').forEach(card=>{card.hidden=!!q&&!card.dataset.artist.includes(q)})});
    $('#page-prev').addEventListener('click',()=>changePage(-1));
    $('#page-next').addEventListener('click',()=>changePage(1));
    $('#playlist-toggle').addEventListener('click',()=>$('#playlist-box').classList.toggle('hidden'));
    $('#playlist-box').addEventListener('submit',playlist);
    $('#open-folder').addEventListener('click',()=>bridge.openDirectory().catch(e=>showToast(errMessage(e),true)));
    $('#local-open').addEventListener('click',()=>bridge.openDirectory().catch(e=>showToast(errMessage(e),true)));
    $('#pick-dir').addEventListener('click',async()=>{const dir=await bridge.chooseDirectory();if(dir)$('#download-dir').value=dir;});
    $('#lyr-reset').addEventListener('click',()=>fillLyricsStyle(defaultLyricStyle()));
    $('#lyr-test').addEventListener('click',async()=>{
      try {await bridge.showFloatingLyrics();state.floating=true;
        await bridge.updateFloatingLyrics({title:'歌词外观预览',line:'月の夜に咲く 一輪の花みたいね',translation:'就像那月夜里绽放的一朵花。'});
        showToast('已打开桌面歌词预览；保存设置后样式立即生效。');}
      catch(e){showToast(errMessage(e),true)}
    });
    $('#show-disclaimer').addEventListener('click',()=>openFirstRun(true));
    $('#agree-disclaimer').addEventListener('change',()=>{$('#first-confirm').disabled=!$('#agree-disclaimer').checked});
    $('#first-confirm').addEventListener('click',async()=>{
      if(!$('#agree-disclaimer').checked)return;
      try{state.settings=await bridge.saveSettings({...state.settings,disclaimerAcceptedVersion:1,setupCompleted:true});
        $('#first-run').hidden=true;showToast('免责声明已确认。')}
      catch(e){showToast('保存确认状态失败：'+errMessage(e),true)}
    });
    $('#pick-player-bg').addEventListener('click',async()=>{
      try{const obj=await bridge.choosePlayerBackground();if(obj){$('#player-bg-path').value=obj.path;state.settings.playerBackgroundPath=obj.path;await showBackground()}}
      catch(e){showToast(errMessage(e),true)}
    });
    $('#clear-player-bg').addEventListener('click',async()=>{try{await bridge.clearPlayerBackground();state.settings.playerBackgroundPath='';$('#player-bg-path').value='';await showBackground()}catch(e){showToast(errMessage(e),true)}});
    $('#save-settings').addEventListener('click',async()=>{
      try {
        state.settings = await bridge.saveSettings({...state.settings,downloadDir:$('#download-dir').value,quality:'best',cacheLimitMB:Number($('#cache-limit').value),parallelDownloads:Number($('#parallel-downloads').value),desktopLyricsEnabled:$('#desktop-lyrics-enabled').checked,floatingLyrics:readLyricsStyle(),apiBases:$('#api-bases').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)});
        if(state.settings.desktopLyricsEnabled&&!state.floating){await bridge.showFloatingLyrics();state.floating=true;updateFloatingLine()}
        if(!state.settings.desktopLyricsEnabled&&state.floating){await bridge.closeFloatingLyrics();state.floating=false}
        updateDesktopLyricsToggle();
        setStatus('已保存下载设置。','ok');showToast('设置已保存。');
      } catch(e) {showToast(errMessage(e),true);}
    });
    // 原生 audio 元素负责播放、进度和音量。歌词按 timeupdate 同步。
    audio().volume=.75;
    audio().addEventListener('timeupdate',()=>{
      $('#time-current').textContent=timeLabel(audio().currentTime);
      $('#immersive-current').textContent=timeLabel(audio().currentTime);
      if(Number.isFinite(audio().duration) && audio().duration>0 && !$('#player-seek').matches(':active'))
        $('#player-seek').value=String(Math.round(audio().currentTime/audio().duration*1000));
      if(Number.isFinite(audio().duration)&&audio().duration>0&&!$('#immersive-seek').matches(':active'))$('#immersive-seek').value=String(Math.round(audio().currentTime/audio().duration*1000));
      syncLyrics();
    });
    audio().addEventListener('loadedmetadata',()=>{$('#time-duration').textContent=timeLabel(audio().duration);$('#immersive-duration').textContent=timeLabel(audio().duration);});
    for(const event of ['play','pause','ended'])audio().addEventListener(event,()=>{updatePlayerControls();if(audio().paused)clockOff();else clockOn();bridge.setPlaybackState(!audio().paused).catch(()=>{});});
    audio().addEventListener('ended',()=>{void advancePlaylist()});
    audio().addEventListener('seeked',()=>syncLyrics(true));
    audio().addEventListener('error',()=>{if(audio().src)showToast('音频无法播放，可能是文件格式或缓存失效。',true);});
    $('#player-toggle').addEventListener('click',()=>{
      if(!audio().src || state.preparing)return;
      if(audio().paused)audio().play().catch(e=>showToast(errMessage(e),true));else audio().pause();
    });
    $('#player-seek').addEventListener('input',()=>{
      if(Number.isFinite(audio().duration)&&audio().duration>0)audio().currentTime=Number($('#player-seek').value)/1000*audio().duration;
    });
    $('#player-volume').addEventListener('input',()=>{audio().volume=Number($('#player-volume').value)/100;$('#immersive-volume').value=$('#player-volume').value});
    $('#immersive-volume').addEventListener('input',()=>{audio().volume=Number($('#immersive-volume').value)/100;$('#player-volume').value=$('#immersive-volume').value});
    $('#immersive-seek').addEventListener('input',()=>{if(Number.isFinite(audio().duration)&&audio().duration>0)audio().currentTime=Number($('#immersive-seek').value)/1000*audio().duration});
    $('#immersive-toggle').addEventListener('click',()=>{if(!audio().src||state.preparing)return;audio().paused?audio().play().catch(e=>showToast(errMessage(e),true)):audio().pause()});
    document.addEventListener('keydown',event=>{if(!state.immersive)return;if(event.key==='Escape'){showImmersive(false);event.preventDefault()}else if(event.code==='Space'&&!['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName)){event.preventDefault();audio().paused?audio().play().catch(()=>{}):audio().pause()}});
    $('#toggle-desktop-lyrics').addEventListener('click',()=>toggleDesktopLyrics());
    $('#open-immersive').addEventListener('click',async()=>{showImmersive(!state.immersive);if(state.immersive)await showBackground()});
    $('#immersive-close').addEventListener('click',()=>showImmersive(false));
    $('#clear-cache').addEventListener('click',async()=>{
      if(state.preparing||state.busy){showToast('有任务运行中，稍后清理缓存。');return;}
      if(!confirm('清除试听音频和歌词缓存？已下载到音乐文件夹的歌曲不会被删除。'))return;
      audio().pause();audio().removeAttribute('src');audio().load();state.playingId=null;state.playToken++;state.playQueue=null;state.advanceSerial++;state.currentLocalName=null;
      clearLyrics('缓存已清理');updatePlayerControls();
      try {await bridge.clearCache();await updateCacheStats();showToast('试听缓存已清理，下载目录中的音乐仍在。');}
      catch(e){showToast(errMessage(e),true);}
    });
    try {
      // Desktop lyrics is manually opt-in for each application session.
      // Do not reopen an overlay merely because a past session persisted 'enabled'.
      state.settings={...await bridge.getSettings(),desktopLyricsEnabled:false};
      state.floating=false;
      renderSettings();
      if(!state.settings.disclaimerAcceptedVersion)openFirstRun(false);
      updateDesktopLyricsToggle();
    }
    catch(e){showToast(`设置读取失败：${errMessage(e)}`,true);}
    try {const p=await bridge.checkPython();$('#python-label').textContent=`Python ${p.version} · 就绪`;}
    catch(e){$('#python-label').textContent='Python 环境未就绪';setStatus(errMessage(e),'error');showToast(errMessage(e),true);}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
