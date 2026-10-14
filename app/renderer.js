'use strict';
(() => {
  const bridge = window.musicBridge;
  const $ = selector => document.querySelector(selector);
  const state = {view:'home', tracks:[], selected:new Set(), busy:false, settings:null, playlist:false, playingId:null, playToken:0, preparing:false, lyrics:[], lyricIndex:-1, playerInfo:null, favorites:new Set(), pendingFavorites:new Set(), downloadJobs:new Map(), activeDownloadBatches:0,query:'',page:1,total:0,paused:false,floating:false};

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
    pause:'<path d="M8 5v14M16 5v14"/>',
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
    document.querySelectorAll('.track-action.download,.track-action.favorite,.track-select').forEach(btn => btn.disabled = active);
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
    const album = node('div','track-meta',`专辑：${track.album || '—'}`);
    const footer = node('div','track-footer');
    const duration = Number(track.duration_seconds || 0);
    const time = duration > 0 ? `${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}` : '—';
    footer.append(node('span','',`时长 ${time}`), node('span','',`网易云 ID ${track.id}`));
    info.append(title,artist,album,footer);
    const ctrl = node('div','track-controls');
    const toggle = node('button','track-select');
    toggle.type = 'button';toggle.title='勾选歌曲';toggle.setAttribute('aria-label','勾选 '+(track.name||''));
    toggle.setAttribute('aria-pressed','false'); toggle.innerHTML=icon('check');
    toggle.addEventListener('click',()=>select(track.id,!state.selected.has(String(track.id)),card));
    const actions=node('div','track-actions');
    const play=node('button','track-action');play.type='button';play.title='在软件里试听（首次需缓存音频）';play.setAttribute('aria-label','播放 '+(track.name||''));play.innerHTML=icon('play');
    play.dataset.songId=String(track.id);
    play.addEventListener('click',()=>playSong(track));
    const favorite=node('button','track-action favorite');favorite.type='button';favorite.title='收藏并下载无损音频 + LRC 歌词';favorite.setAttribute('aria-label','收藏 '+(track.name||''));favorite.innerHTML=icon('heart');
    favorite.dataset.songId=String(track.id);
    favorite.classList.toggle('active',state.favorites.has(String(track.id)));
    favorite.addEventListener('click',()=>addToFavorites(track));
    const download=node('button','track-action download');download.type='button';download.title='下载这首歌曲';download.setAttribute('aria-label','下载 '+(track.name||''));download.innerHTML=icon('download');
    download.addEventListener('click',()=>downloadSongs([String(track.id)]));
    actions.append(play,favorite,download);ctrl.append(toggle,actions);
    const job=node('div','track-job-state'); job.dataset.songId=String(track.id);
    const existing=state.downloadJobs.get(String(track.id));
    if(existing) {job.textContent=jobText(existing);job.dataset.status=existing.status;}
    info.appendChild(job);
    card.append(art,info,ctrl);
    card.addEventListener('dblclick', event => {if(!event.target.closest('button')) playSong(track);});
    return card;
  }
  function jobText(job) {
    const scope=job.purpose==='favorite'?'收藏 · ':'';
    const names={queued:'已排队',running:'下载中',completed:'已完成',failed:'失败',cancelled:'已取消'};
    const pct=job.progress?.percent!=null?` ${job.progress.percent.toFixed(1)}%`:'';
    const speed=job.progress?.speed ? ` · ${(job.progress.speed/1024/1024).toFixed(2)} MB/s`:'';
    return scope+(names[job.status]||'准备中')+pct+speed+(job.error?`：${String(job.error).slice(0,100)}`:'');
  }
  function displayDownloadJob(job) {
    if(!job || !job.id) return;
    const id=String(job.id);
    state.downloadJobs.set(id,{...(state.downloadJobs.get(id)||{}),...job});
    for(const el of document.querySelectorAll('.track-job-state')){
      if(el.dataset.songId===id){el.textContent=jobText(job);el.dataset.status=job.status;}
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
    if(state.view==='tasks')void renderTasks();
  }
  const audio=()=>$('#music-audio');
  function timeLabel(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const n=Math.floor(seconds);
    return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
  }
  const parseLrc=window.MusicLRC.parseLrc;
  function clearLyrics(message='正在获取歌词…') {
    state.lyrics=[];state.lyricIndex=-1;
    $('#lyrics-scroll').replaceChildren(node('div','lyrics-empty',message));
    $('#player-synced-line').textContent=message;
  }
  function drawLyrics(result) {
    const rows=parseLrc(result.lrc,result.translated_lrc);
    state.lyrics=rows;state.lyricIndex=-1;
    const pane=$('#lyrics-scroll');pane.replaceChildren();
    if (!rows.length) {
      const message=result.lrc?.trim() ? result.lrc.slice(0,3500) : '这首歌暂时没有可用歌词';
      pane.appendChild(node('div','lyrics-empty',message));
      $('#player-synced-line').textContent=result.lrc?.trim()?'静态歌词（无时间轴）':'暂无歌词';
      updateFloatingLine();
      return;
    }
    rows.forEach((row,i)=>{
      const line=node('div','lyric-line',row.text);
      line.dataset.index=String(i);
      if(row.translation)line.appendChild(node('span','lyric-translation',row.translation));
      line.addEventListener('click',()=>{if(Number.isFinite(audio().duration))audio().currentTime=row.time;});
      pane.appendChild(line);
    });
    syncLyrics(true);
  }
  function syncLyrics(force=false) {
    const rows=state.lyrics;
    if(!rows.length)return;
    const t=audio().currentTime||0;
    let lo=0,hi=rows.length-1,idx=-1;
    while(lo<=hi){const mid=(lo+hi)>>1;if(rows[mid].time<=t+.06){idx=mid;lo=mid+1;}else hi=mid-1;}
    if(!force && state.lyricIndex===idx)return;
    const old=$('#lyrics-scroll').querySelector('.lyric-line.active');
    if(old)old.classList.remove('active');
    state.lyricIndex=idx;
    if(idx>=0){
      const target=$('#lyrics-scroll').children[idx];
      target?.classList.add('active');
      if(!$('#lyrics-panel').hidden)target?.scrollIntoView({behavior:force?'instant':'smooth',block:'center'});
      $('#player-synced-line').textContent=rows[idx].text;
    } else $('#player-synced-line').textContent='♪ 音乐即将开始';
    updateFloatingLine();
  }
  function updateFloatingLine(){
    if(!state.floating)return;
    const row=state.lyrics[state.lyricIndex];
    void bridge.updateFloatingLyrics({title:state.playerInfo?.name||'桌面歌词',line:row?.text||$('#player-synced-line').textContent,translation:row?.translation||''}).catch(()=>{});
  }
  function updatePlayerControls() {
    $('#player-toggle').innerHTML=icon(!audio().paused && !audio().ended ? 'pause':'play');
    document.querySelectorAll('.track-action[data-song-id]').forEach(btn=>{
      const playing=btn.dataset.songId===state.playingId && !audio().paused;
      btn.classList.toggle('playing',playing);btn.innerHTML=icon(playing?'pause':'play');
    });
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
    $('#lyrics-song').textContent=(info.name||'未知歌曲')+' · '+(info.artists||'本地音频');
    clearLyrics();
    updateFloatingLine();
    audio().src=url;
    audio().load();
    updatePlayerControls();
    state.preparing=false;
    let started=false;
    try {await audio().play();started=true;setStatus(`正在播放：${info.name||'音乐'}`,'ok');}
    catch(e){if(token===state.playToken)setStatus('试听源不可播放，正在尝试缓存备用音源…','error');}
    updatePlayerControls();
    if(token===state.playToken&&started)void loadLyrics(id,token);
    return started;
  }
  async function playSong(track){
    if(!bridge || !track?.id)return;
    const id=String(track.id);
    if(state.playingId===id && audio().src && !state.preparing){
      if(audio().paused)audio().play().catch(e=>showToast(errMessage(e),true));else audio().pause();
      return;
    }
    if(state.preparing){showToast('正在准备上一首歌曲，请稍候。');return;}
    const token=++state.playToken;
    audio().pause();state.preparing=true;
    $('#player-song').textContent=track.name||'准备播放';
    $('#player-artist').textContent=track.artists||'正在检查音源';
    clearLyrics('正在准备音频…');
    setStatus(`正在准备「${track.name}」：首次播放先缓存较小的 MP3…`);
    try {
      // 流式优先，接口不支持时自动退回已验证的本地 MP3 缓存。
      let started=false;
      try{
        const info=await bridge.streamAudio(id);
        if(token!==state.playToken)return;
        started=await startAudio({...info,name:track.name,artists:track.artists},info.url,token,id);
        if(started&&!info.fromCache){
          // 同时后台准备完整缓存，后续再试听不必重复等待。
          void bridge.prepareAudio(id).catch(()=>{});
        }
      }catch{}
      if(!started && token===state.playToken){
        const info=await bridge.prepareAudio(id);
        if(token===state.playToken)await startAudio({...info,name:track.name||info.name,artists:track.artists||info.artists},info.url,token,id);
      }
    }catch(e){if(token===state.playToken){state.preparing=false;setStatus(`无法试听：${errMessage(e)}`,'error');showToast(`无法试听：${errMessage(e)}`,true);}}
  }
  async function playLocalFile(file) {
    if(state.busy || state.preparing){showToast('请稍后再试听。');return;}
    const token=++state.playToken;
    audio().pause();state.preparing=true;
    try {const info=await bridge.playLocal(file.name);if(token===state.playToken)await startAudio(info,info.url,token,info.id);}
    catch(e){if(token===state.playToken){state.preparing=false;showToast(errMessage(e),true);}}
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
  async function addToFavorites(track) {
    if(state.pendingFavorites.has(String(track.id))) return;
    if(state.favorites.has(String(track.id))){showToast('这首歌曲已经收藏，可以在「收藏」查看。');return;}
    state.pendingFavorites.add(String(track.id));
    const heart=document.querySelector(`.track-action.favorite[data-song-id="${String(track.id)}"]`);
    if(heart)heart.disabled=true;
    setStatus(`已提交收藏「${track.name}」：无损音频与歌词获取中…`);
    try {
      const row=await bridge.addFavorite(track);
      state.favorites.add(String(track.id));
      document.querySelectorAll('.track-action.favorite').forEach(btn=>{
        if(btn.dataset.songId===String(track.id))btn.classList.add('active');
      });
      const msg=row.lyricExists ? '收藏成功，无损音频和 LRC 歌词已保存。' : '已收藏无损音频；歌词暂时无法获取，可到收藏页重试。';
      setStatus(msg,'ok');showToast(msg,!row.lyricExists);
      if(state.view==='favorites')await refreshFavorites();
    }catch(e){setStatus(`收藏失败：${errMessage(e)}`,'error');showToast(errMessage(e),true);}
    finally{state.pendingFavorites.delete(String(track.id));if(heart)heart.disabled=false;}
  }
  async function refreshFavorites() {
    const parent=$('#favorites-list');parent.replaceChildren();
    try {
      const rows=await bridge.listFavorites();
      state.favorites=new Set(rows.map(row=>String(row.id)));
      if(!rows.length){parent.appendChild(node('div','empty-simple','收藏夹还是空的，在搜索结果中点击爱心收藏歌曲。'));return;}
      for(const row of rows){
        const card=node('div','favorite-item');
        const info=node('div','favorite-details');
        info.append(node('strong','',row.name),node('span','',row.artists||'未知歌手'),node('small',row.lyricExists?'无损音频 · LRC 歌词已保存':'无损音频已保存 · 歌词待补充'));
        const ops=node('div','favorite-actions');
        const play=node('button','soft-action','播放');play.type='button';
        play.addEventListener('click',async()=>{
          if(state.busy||state.preparing)return;
          const token=++state.playToken;audio().pause();state.preparing=true;
          try {const res=await bridge.playFavorite(String(row.id));if(token===state.playToken)await startAudio(res,res.url,token,row.id);}
          catch(e){state.preparing=false;showToast(errMessage(e),true);}
        });
        ops.append(play);
        if(!row.lyricExists){
          const retry=node('button','soft-action','重试歌词');retry.type='button';
          retry.addEventListener('click',async()=>{
            retry.disabled=true;
            try{const changed=await bridge.retryFavoriteLyrics(String(row.id));showToast(changed.lyricExists?'歌词已保存':'歌词接口仍未返回有效结果',!changed.lyricExists);}
            catch(e){showToast(errMessage(e),true);}
            finally{await refreshFavorites();}
          });
          ops.append(retry);
        }
        const remove=node('button','subtle-action','移出收藏');remove.type='button';
        remove.title='仅移出收藏列表，不删除已保存的音频文件';
        remove.addEventListener('click',async()=>{await bridge.removeFavorite(String(row.id));await refreshFavorites();showToast('已移出收藏，磁盘文件未删除。');});
        ops.append(remove);
        card.append(info,ops);parent.append(card);
      }
    } catch(e){showToast(errMessage(e),true);}
  }
  async function downloadSongs(ids) {
    const unique=[...new Set((ids||[]).map(String))];
    if(!unique.length) return;
    state.activeDownloadBatches++;
    setStatus(`已提交 ${unique.length} 首歌曲：最多 ${state.settings?.parallelDownloads||3} 首并行，其余自动排队。`);
    try {
      const res=await bridge.download(unique);
      if (!res || !Array.isArray(res.results)) throw new Error('下载进程没有返回有效结果');
      const success=Number(res.success_count ?? res.results.filter(x=>x.ok).length);
      const fail=Number(res.failed_count ?? res.results.filter(x=>!x.ok).length);
      if (fail) {
        const first=res.results.find(x=>!x.ok);
        setStatus(`本批下载结束：成功 ${success} 首，失败 ${fail} 首。${first?.error || ''}`,'error');
        showToast(`本批成功 ${success} 首，失败 ${fail} 首；可以点击其他歌曲继续下载。`,true);
      } else {
        setStatus(`本批下载完成：${success} 首。已保存到设置的下载目录。`,'ok');
        showToast(`已成功保存 ${success} 首音乐。`);
      }
    } catch(e) {setStatus(`下载失败：${errMessage(e)}`,'error');showToast(`下载失败：${errMessage(e)}`,true);}
    finally { state.activeDownloadBatches--; }
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
  async function showView(view) {
    state.view=view;
    document.querySelectorAll('.nav-item').forEach(e=>e.classList.toggle('active',e.dataset.view === view));
    document.querySelectorAll('.view').forEach(e=>e.classList.toggle('active',e.id === 'view-'+view));
    if (view === 'local') await refreshLocal();
    if (view === 'favorites') await refreshFavorites();
    if (view === 'settings') renderSettings();
    if (view === 'tasks') await renderTasks();
  }
  async function refreshLocal() {
    const parent=$('#local-list');parent.replaceChildren();
    try {
      const files=await bridge.listFiles();
      if (!files.length){parent.appendChild(node('div','empty-simple','当前目录中还没有音乐文件。'));return;}
      for(const file of files){
        const row=node('div','local-item');const i=node('span');i.innerHTML=icon('music');
        const name=node('span','local-item-name',file.name);name.title=file.name;
        const size=node('span','local-item-size',`${(file.size/1024/1024).toFixed(1)} MB`);
        const p=node('button','local-play','播放');p.type='button';p.addEventListener('click',()=>playLocalFile(file));
        row.append(i,name,size,p);parent.appendChild(row);
      }
    } catch(e) {showToast(errMessage(e),true);}
  }
  async function renderTasks(){
    const root=$('#task-list');if(!root)return;
    try{const rows=await bridge.downloadHistory();root.replaceChildren();
      if(!rows.length){root.appendChild(node('div','empty-simple','还没有下载任务'));return;}
      for(const entry of rows){
        const card=node('div','task-row');
        const left=node('div','task-main');
        const id=String(entry.id||'');const track=state.tracks.find(x=>String(x.id)===id);
        left.append(node('strong','',track?.name||entry.name||`歌曲 ${id}`),node('span','',jobText(entry)));
        const bar=node('div','task-progress');const fill=node('div','task-progress-fill');fill.style.width=`${Math.max(0,Math.min(100,Number(entry.progress?.percent||0)))}%`;bar.append(fill);left.append(bar);
        const actions=node('div','task-actions');
        if(['queued','running'].includes(entry.status)){const btn=node('button','subtle-action','取消');btn.onclick=async()=>{await bridge.cancelDownload(id);await renderTasks()};actions.append(btn)}
        if(['failed','cancelled'].includes(entry.status)){const btn=node('button','soft-action','重试');btn.onclick=async()=>{btn.disabled=true;try{await bridge.retryDownload(id)}catch(e){showToast(errMessage(e),true)}finally{await renderTasks()}};actions.append(btn)}
        card.append(left,actions);root.append(card);
      }
    }catch(e){showToast(errMessage(e),true)}
  }
  function renderSettings() {
    const s=state.settings;
    if(!s)return;
    $('#download-dir').value=s.downloadDir;
    $('#favorites-dir').value=s.favoritesDir||s.downloadDir+'\\收藏';
    $('#quality').value=s.quality;
    $('#api-bases').value=(s.apiBases||[]).join('\n');
    $('#cache-limit').value=String(s.cacheLimitMB||1024);
    $('#parallel-downloads').value=String(s.parallelDownloads||3);
    void updateCacheStats();
  }
  function openFirstRun(reviewOnly=false){
    const s=state.settings||{};
    $('#first-download-dir').value=s.downloadDir||'';
    $('#first-favorites-dir').value=s.favoritesDir||'';
    $('#agree-disclaimer').checked=false;
    $('#first-confirm').disabled=true;
    $('#first-run-title').textContent=reviewOnly?'使用说明与路径确认':'欢迎使用音乐下载器';
    $('#first-run').hidden=false;
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
    bridge.onDownloadTask(task=>displayDownloadJob(task));
    bridge.onFloatingLyricsStatus(info=>{state.floating=!!info.open;$('#toggle-floating').classList.toggle('active',state.floating)});
    document.querySelectorAll('.nav-item').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.view)));
    $('#search-form').addEventListener('submit',search);
    $('#example-search').addEventListener('click',()=>{$('#search-input').value='我的悲伤是水做的 洛天依';search();});
    $('#download-selected').addEventListener('click',()=>downloadSongs([...state.selected]));
    $('#artist-filter').addEventListener('input',()=>{const q=$('#artist-filter').value.trim().toLowerCase();document.querySelectorAll('.song-card').forEach(card=>{card.hidden=!!q&&!card.dataset.artist.includes(q)})});
    $('#page-prev').addEventListener('click',()=>changePage(-1));
    $('#page-next').addEventListener('click',()=>changePage(1));
    $('#pause-queue').addEventListener('click',async()=>{state.paused=!state.paused;await bridge.pauseDownloads(state.paused);$('#pause-queue').textContent=state.paused?'继续队列':'暂停队列'});
    $('#refresh-tasks').addEventListener('click',renderTasks);
    $('#playlist-toggle').addEventListener('click',()=>$('#playlist-box').classList.toggle('hidden'));
    $('#playlist-box').addEventListener('submit',playlist);
    $('#open-folder').addEventListener('click',()=>bridge.openDirectory().catch(e=>showToast(errMessage(e),true)));
    $('#local-open').addEventListener('click',()=>bridge.openDirectory().catch(e=>showToast(errMessage(e),true)));
    $('#pick-dir').addEventListener('click',async()=>{const dir=await bridge.chooseDirectory();if(dir)$('#download-dir').value=dir;});
    $('#pick-favorites-dir').addEventListener('click',async()=>{const dir=await bridge.chooseDirectory();if(dir)$('#favorites-dir').value=dir;});
    $('#show-disclaimer').addEventListener('click',()=>openFirstRun(true));
    $('#first-pick-download').addEventListener('click',async()=>{const dir=await bridge.chooseDirectory();if(dir)$('#first-download-dir').value=dir;});
    $('#first-pick-favorites').addEventListener('click',async()=>{const dir=await bridge.chooseDirectory();if(dir)$('#first-favorites-dir').value=dir;});
    $('#agree-disclaimer').addEventListener('change',()=>{$('#first-confirm').disabled=!$('#agree-disclaimer').checked});
    $('#first-confirm').addEventListener('click',async()=>{
      if(!$('#agree-disclaimer').checked)return;
      try{const s={...state.settings,downloadDir:$('#first-download-dir').value,favoritesDir:$('#first-favorites-dir').value,setupCompleted:true};
        state.settings=await bridge.saveSettings(s);$('#first-run').hidden=true;renderSettings();showToast('保存目录与使用说明已确认。');}
      catch(e){showToast('首次设置保存失败：'+errMessage(e),true)}
    });
    $('#save-settings').addEventListener('click',async()=>{
      try {
        state.settings = await bridge.saveSettings({downloadDir:$('#download-dir').value,favoritesDir:$('#favorites-dir').value,setupCompleted:true,quality:$('#quality').value,cacheLimitMB:Number($('#cache-limit').value),parallelDownloads:Number($('#parallel-downloads').value),apiBases:$('#api-bases').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)});
        setStatus('已保存下载设置。','ok');showToast('设置已保存。');
      } catch(e) {showToast(errMessage(e),true);}
    });
    // 原生 audio 元素负责播放、进度和音量。歌词按 timeupdate 同步。
    audio().volume=.75;
    audio().addEventListener('timeupdate',()=>{
      $('#time-current').textContent=timeLabel(audio().currentTime);
      if(Number.isFinite(audio().duration) && audio().duration>0 && !$('#player-seek').matches(':active'))
        $('#player-seek').value=String(Math.round(audio().currentTime/audio().duration*1000));
      syncLyrics();
    });
    audio().addEventListener('loadedmetadata',()=>{$('#time-duration').textContent=timeLabel(audio().duration);});
    for(const event of ['play','pause','ended'])audio().addEventListener(event,()=>{updatePlayerControls();bridge.setPlaybackState(!audio().paused).catch(()=>{});});
    audio().addEventListener('error',()=>{if(audio().src)showToast('音频无法播放，可能是文件格式或缓存失效。',true);});
    $('#player-toggle').addEventListener('click',()=>{
      if(!audio().src || state.preparing)return;
      if(audio().paused)audio().play().catch(e=>showToast(errMessage(e),true));else audio().pause();
    });
    $('#player-seek').addEventListener('input',()=>{
      if(Number.isFinite(audio().duration)&&audio().duration>0)audio().currentTime=Number($('#player-seek').value)/1000*audio().duration;
    });
    $('#player-volume').addEventListener('input',()=>{audio().volume=Number($('#player-volume').value)/100;});
    $('#toggle-floating').addEventListener('click',async()=>{
      try{if(state.floating){await bridge.closeFloatingLyrics();state.floating=false}else{await bridge.showFloatingLyrics();state.floating=true;updateFloatingLine()}
        $('#toggle-floating').classList.toggle('active',state.floating);}catch(e){showToast(errMessage(e),true)}
    });
    $('#unlock-floating').addEventListener('click',async()=>{try{await bridge.lockFloatingLyrics(false);showToast('悬浮歌词已解除鼠标穿透，可继续拖动。')}catch(e){showToast(errMessage(e),true)}});
    $('#toggle-immersive').addEventListener('click',()=>$('#lyrics-panel').classList.toggle('immersive'));
    $('#toggle-lyrics').addEventListener('click',()=>{
      const panel=$('#lyrics-panel');panel.hidden=!panel.hidden;$('#toggle-lyrics').classList.toggle('active',!panel.hidden);
      if(!panel.hidden)syncLyrics(true);
    });
    $('#close-lyrics').addEventListener('click',()=>{$('#lyrics-panel').hidden=true;$('#toggle-lyrics').classList.remove('active');});
    $('#clear-cache').addEventListener('click',async()=>{
      if(state.preparing||state.busy){showToast('有任务运行中，稍后清理缓存。');return;}
      if(!confirm('清除试听音频和歌词缓存？已下载到音乐文件夹的歌曲不会被删除。'))return;
      audio().pause();audio().removeAttribute('src');audio().load();state.playingId=null;state.playToken++;
      clearLyrics('缓存已清理');updatePlayerControls();
      try {await bridge.clearCache();await updateCacheStats();showToast('试听缓存已清理，下载目录中的音乐仍在。');}
      catch(e){showToast(errMessage(e),true);}
    });
    try {const rows=await bridge.listFavorites();state.favorites=new Set(rows.map(r=>String(r.id)));} catch {}
    try {state.settings=await bridge.getSettings();renderSettings();if(!state.settings.setupCompleted)openFirstRun(false);}
    catch(e){showToast(`设置读取失败：${errMessage(e)}`,true);}
    try {const p=await bridge.checkPython();$('#python-label').textContent=`Python ${p.version} · 就绪`;}
    catch(e){$('#python-label').textContent='Python 环境未就绪';setStatus(errMessage(e),'error');showToast(errMessage(e),true);}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
