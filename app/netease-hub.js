/* Desktop adapters for the NetEase pages in MuoniumPlayer. Apache-2.0 upstream
 * endpoints and original Java client live in upstream/muonium. Existing audio
 * and subtitle engines are retained through NeteaseDesktopHost. */
(()=>{
 'use strict';
 const host=window.NeteaseDesktopHost,bridge=window.musicBridge;if(!host||!bridge.neteaseRequest)return;
 const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
 const sheet=el('section','sheet netease-hub');sheet.id='netease-view';sheet.hidden=true;document.querySelector('.panel').append(sheet);
 const tabs=document.querySelector('.tabs'),nav=el('div','mu-net-nav');nav.append(el('div','mu-nav-heading','网易云音乐'));tabs.append(nav);
 const homeButton=el('button','home-button','主页');homeButton.id='home-button';tabs.prepend(homeButton);
 const account=document.getElementById('account-entry');document.querySelector('.panel').append(account);
 const volume=document.querySelector('.volume');document.querySelector('.player').append(volume);
 const seek=document.getElementById('seek'),rail=el('div','seek-rail');seek.before(rail);rail.append(seek);
 let serial=0,current=null,uid=null,accountSerial=0,cloudPlaylists=[],accountLoggedIn=false,privateView=false;
 let likedIds=new Set(),likesReady=false,likesError=false,activePlaylist=null,closePlaylistMenu=()=>{};
 const likeBusy=new Set(),playlistBusy=new Set();
 const request=async(op,args={})=>{try{return await bridge.neteaseRequest(op,args);}catch(error){throw Error(String(error?.message||'网易云请求失败，请稍后重试').replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,''));}};
 const protectedPlaylist=item=>Number(item?.specialType)===5;
 const ownedPlaylist=item=>!!uid&&String(item?.creator?.userId||item?.userId)===uid;
 function syncLikes(){for(const b of sheet.querySelectorAll('[data-like-id]')){const liked=likesReady&&likedIds.has(b.dataset.likeId),busy=likeBusy.has(b.dataset.likeId);b.setAttribute('aria-pressed',likesReady||!accountLoggedIn?String(liked):'mixed');b.setAttribute('aria-busy',String(busy||accountLoggedIn&&!likesReady&&!likesError));b.disabled=busy||accountLoggedIn&&!likesReady&&!likesError;b.title=accountLoggedIn&&!likesReady?(likesError?'重新读取喜欢状态':'正在读取喜欢状态'):liked?'取消喜欢':'喜欢';b.setAttribute('aria-label',b.title);}}
 async function readLikes(generation=accountSerial,user=uid){
  if(!user||!accountLoggedIn)return;likesError=false;syncLikes();
  try{const data=await request('likes',{uid:user});if(generation!==accountSerial)return;const ids=data.ids||data.data?.ids;if(!Array.isArray(ids))throw Error('喜欢列表暂未返回');likedIds=new Set(ids.map(String));likesReady=true;}
  catch(e){if(generation!==accountSerial)return;likesError=true;host.status('喜欢状态读取失败，可点击爱心重试。',true);}
  finally{if(generation===accountSerial)syncLikes();}
 }
 async function toggleLike(track){
  if(!accountLoggedIn){account.click();return;}if(likeBusy.has(track.id))return;
  if(!likesReady){await readLikes();return;}
  const generation=accountSerial,wanted=!likedIds.has(track.id);likeBusy.add(track.id);syncLikes();
  try{await request('like',{id:track.id,like:wanted});if(generation!==accountSerial)return;wanted?likedIds.add(track.id):likedIds.delete(track.id);host.status(wanted?'已加入我喜欢的音乐':'已取消喜欢');}
  catch(e){if(generation===accountSerial)throw e;}
  finally{if(generation===accountSerial){likeBusy.delete(track.id);syncLikes();}}
 }
 function syncPlaylistButton(){
  const state=activePlaylist;if(!state||!state.button.isConnected)return;const {item,detail,button}=state,metadata={...item,...detail},owned=ownedPlaylist(metadata),special=protectedPlaylist(metadata);
  state.subscribed=accountLoggedIn&&(cloudPlaylists.some(p=>String(p.id)===String(item.id))||state.generation===accountSerial&&detail.subscribed===true);
  button.textContent=owned?(special?'我喜欢的音乐':'删除歌单'):state.subscribed?'已添加':'添加歌单';button.disabled=playlistBusy.has(String(item.id))||owned&&special||accountLoggedIn&&!uid;
  button.setAttribute('aria-busy',String(playlistBusy.has(String(item.id))));if(owned)button.removeAttribute('aria-pressed');else button.setAttribute('aria-pressed',String(state.subscribed));
  button.title=owned?(special?'用歌曲旁的爱心管理喜欢的音乐':'删除自己创建的云歌单'):state.subscribed?'点击取消添加':'添加到我的网易云歌单';
 }
 function renderCloudPlaylists(){
  cloudList.replaceChildren();
  for(const item of cloudPlaylists){const button=action('',async()=>{for(const b of tabs.querySelectorAll('button'))b.classList.toggle('active',b===button);return playlist(item,0,true);});button.dataset.cloudId=String(item.id);button.append(image(item.coverImgUrl||item.picUrl),el('span','',item.name||'未命名歌单'));button.title=item.name||'未命名歌单';button.classList.toggle('active',String(activePlaylist?.item.id)===String(item.id));button.oncontextmenu=e=>{e.preventDefault();showPlaylistMenu(item,e.clientX,e.clientY);};cloudList.append(button);}
  if(!cloudPlaylists.length)cloudList.append(el('p','mu-cloud-hint','暂无网易云歌单'));syncPlaylistButton();
 }
 function confirmDelete(item){return new Promise(resolve=>{const d=el('dialog','mu-tools-dialog mu-delete-playlist');d.append(el('h2','','删除歌单'),el('p','','确定从网易云账号删除“'+(item.name||'这个歌单')+'”吗？歌曲和本地下载会保留。'));const buttons=el('div','mu-confirm-actions'),cancel=el('button','','取消'),confirm=el('button','','删除歌单');cancel.type=confirm.type='button';cancel.dataset.cancel='';confirm.dataset.confirm='';cancel.onclick=()=>d.close();confirm.onclick=()=>d.close('delete');buttons.append(cancel,confirm);d.append(buttons);d.addEventListener('close',()=>{const yes=d.returnValue==='delete';d.remove();resolve(yes);},{once:true});document.body.append(d);d.showModal();});}
 async function changeCollection(item,wanted,{fromMenu=false,detail=null}={}){
  if(!accountLoggedIn){account.click();return;}const generation=accountSerial,id=String(item.id),metadata={...item,...detail},owned=ownedPlaylist(metadata);if(playlistBusy.has(id)||protectedPlaylist(metadata)&&owned)return;
  playlistBusy.add(id);syncPlaylistButton();
  try{
   if(owned&&!await confirmDelete({...item,...detail}))return;
   if(generation!==accountSerial)return;
   await request(owned?'deletePlaylist':'subscribe',owned?{id}:{id,subscribe:wanted});if(generation!==accountSerial)return;
   if(wanted&&!owned){if(!cloudPlaylists.some(p=>String(p.id)===id))cloudPlaylists.push({...item,...detail,id});}
   else cloudPlaylists=cloudPlaylists.filter(p=>String(p.id)!==id);
   if(activePlaylist&&String(activePlaylist.item.id)===id){activePlaylist.detail.subscribed=wanted&&!owned;activePlaylist.generation=generation;}
   renderCloudPlaylists();host.status(owned?'已删除歌单':wanted?'已添加到我的网易云歌单':'已取消添加歌单');
   if((owned||fromMenu)&&String(activePlaylist?.item.id)===id)await home();
  }catch(e){if(generation===accountSerial)throw e;}
  finally{if(generation===accountSerial){playlistBusy.delete(id);syncPlaylistButton();}}
 }
 function showPlaylistMenu(item,x,y){
  closePlaylistMenu();const generation=accountSerial,owned=ownedPlaylist(item),special=owned&&protectedPlaylist(item),menu=el('div','mu-playlist-menu');menu.setAttribute('role','menu');const button=action(special?'喜欢的音乐请用爱心管理':owned?'删除歌单':'取消添加',()=>{closePlaylistMenu();if(generation===accountSerial)return changeCollection(item,false,{fromMenu:true});});button.setAttribute('role','menuitem');button.disabled=special||playlistBusy.has(String(item.id));menu.append(button);document.body.append(menu);const b=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x,innerWidth-b.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-b.height-8))+'px';
  const outside=e=>{if(!menu.contains(e.target))closePlaylistMenu();};const escape=e=>{if(e.key==='Escape')closePlaylistMenu();};closePlaylistMenu=()=>{menu.remove();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape);closePlaylistMenu=()=>{};};document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape);button.focus();
 }
 bridge.onDownloadTask?.(task=>{for(const b of document.querySelectorAll('[data-download-id]'))if(b.disabled&&b.dataset.downloadId===String(task.id)){const p=Number(task.progress?.percent);b.textContent=task.status==='queued'?'排队中':task.status==='running'&&Number.isFinite(p)?Math.round(Math.max(0,Math.min(100,p)))+'%':task.status==='running'?'下载中':b.textContent;}});
 const song=s=>({id:String(s.id),name:s.name||'未命名歌曲',artists:(s.ar||s.artists||[]).map(x=>x.name).join(' / '),cover_url:s.al?.picUrl||s.album?.picUrl||'',duration_seconds:(s.dt||s.duration||0)/1000});
 const run=fn=>async()=>{let token=serial;try{const pending=fn();token=serial;await pending;}catch(e){if(token!==serial)return;host.status(e.message,true);const p=el('p','netease-error',e.message);sheet.append(p);}};
 function begin(title,local=false,accountPrivate=false,reveal=true){closePlaylistMenu();activePlaylist=null;const token=++serial;privateView=accountPrivate;if(reveal)host.show();sheet.dataset.localView=String(local);sheet.classList.remove('home-view','mu-playlist-page','mu-downloads-page','mu-daily-page');sheet.replaceChildren();const header=el('div','sheet-heading');header.append(el('h2','',title));const back=action('',()=>{if(current===home){serial++;if(host.hide)host.hide();else bridge.panelAction({type:'collapse'});}else return home();});back.className='mu-page-back';back.title='返回 / 收起';back.setAttribute('aria-label',back.title);const ink=el('span','mu-glyph mu-fontello-font','\ue003');ink.setAttribute('aria-hidden','true');back.append(ink);header.append(back);sheet.append(header);sheet.append(el('p','netease-loading',local?'正在读取下载目录…':'正在获取网易云内容…'));return token;}
 function ready(token){if(token!==serial)return false;sheet.querySelector('.netease-loading')?.remove();return true;}
 function image(url){const i=el('img','');const cover=host.cover(url);i.src=cover==='../assets/avatar.png'?'../assets/placeholder-cover.svg':cover;i.alt='';i.loading='lazy';i.onerror=()=>{i.onerror=null;i.src='../assets/placeholder-cover.svg';};return i;}
 function action(label,fn){const b=el('button','quiet-button',label);b.type='button';b.onclick=run(fn);return b;}
 function message(text){sheet.append(el('p','empty',text));}
 function songs(items,{play=null,title='歌曲',container=null,showPlayAll=true}={}){
  const tracks=items.map(song);if(!tracks.length){if(container)container.append(el('p','empty','暂时没有歌曲。'));else message('暂时没有歌曲。');return container;}
  if(showPlayAll&&!container)sheet.append(action('播放全部',()=>play?play(0):host.play(tracks)));
  const list=container||el('div','netease-tracks'),base=list.children.length;
  tracks.forEach((s,index)=>{const row=el('article','track-row'),button=el('button','row-play');row.dataset.key='online:'+s.id;button.append(el('span','row-number',String(base+index+1)),image(s.cover_url));const info=el('span','row-info');info.append(el('strong','',s.name),el('small','',s.artists));button.append(info);button.onclick=run(()=>play?play(index):host.play(tracks,index));row.append(button);
   const add=action('',()=>chooseCloudPlaylist(s));add.title='加入网易云歌单';add.setAttribute('aria-label',add.title);add.classList.add('mu-add-song');add.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18m-9 3v6m-3-3h6"/></svg>';row.append(add);
   const like=action('',()=>toggleLike(s));like.classList.add('mu-like-button');like.dataset.likeId=s.id;like.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';row.append(like);
   const download=action('下载',async()=>{download.disabled=true;download.textContent='准备中';host.status('正在准备下载 · '+s.name);try{const prefs=await bridge.getSettings(),label={mp3:'MP3',lossless:'FLAC',best:'最高可用'}[prefs.quality]||'最高可用';download.title='正在下载 '+label;download.textContent='下载中';host.status('下载 '+label+' · '+s.name);const result=await host.download(s);if(result?.ok===false)throw Error('未能获得 '+label+'：'+(result.results?.find(x=>!x.ok)?.error||'下载失败'));download.textContent='已下载';const item=result?.results?.[0];host.status('下载完成 · '+s.name+(item?.format?' · '+String(item.format).toUpperCase():''));}catch(e){download.textContent='重试';throw e;}finally{download.disabled=false;}});download.dataset.downloadId=s.id;download.classList.add('mu-download-action');download.title='下载到本机';row.append(download);
   const seconds=Math.max(0,Math.floor(s.duration_seconds||0));row.append(el('span','mu-track-duration',String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')));list.append(row);});if(!container)sheet.append(list);syncLikes();return list;
 }
 function cards(items,onOpen,container=null){const list=container||el('div','netease-cards');for(const item of items){const b=el('button','netease-card');b.append(image(item.coverImgUrl||item.picUrl||item.coverUrl||item.album?.picUrl),el('strong','',item.name||item.nickname||'未命名'),el('small','',item.trackCount?item.trackCount+' 首歌曲':item.description||item.creator?.nickname||''));b.onclick=run(()=>onOpen(item));list.append(b);}if(!container)sheet.append(list);if(!items.length&&!container)message('暂时没有内容。');return list;}
 function paging(offset,more,load){const bar=el('div','netease-pagination');if(offset>0)bar.append(action('上一页',()=>load(Math.max(0,offset-30))));if(more)bar.append(action('下一页',()=>load(offset+30)));sheet.append(bar);}
 async function home({reveal=true}={}){
  current=home;const token=begin('推荐歌单',false,false,reveal);
  for(const button of tabs.querySelectorAll('button'))button.classList.toggle('active',button===homeButton);
  sheet.classList.add('home-view');
  const heading=sheet.querySelector('.sheet-heading'),refresh=action('',()=>home());refresh.className='mu-home-refresh';refresh.title='刷新推荐歌单';refresh.setAttribute('aria-label',refresh.title);refresh.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/></svg>';heading.append(refresh);
  const results=await Promise.allSettled([request('personalized',{limit:30}),request('popular',{limit:50,offset:0})]);
  if(!ready(token))return;
  const recommendations=results[0].status==='fulfilled'?(results[0].value.result||results[0].value.playlists||[]):[];
  const popular=results[1].status==='fulfilled'?(results[1].value.playlists||[]):[];
  const seen=new Set(),selected=[...recommendations,...popular].filter(item=>{const id=String(item.id);if(seen.has(id))return false;seen.add(id);return true;});
  if(!selected.length){message('暂时未能获取歌单。');sheet.append(action('重试',home));return;}
  const grid=cards(selected,playlist);let offset=50,loading=false,complete=popular.length<50;
  grid.addEventListener('scroll',async()=>{if(loading||complete||token!==serial||seen.size>=240||grid.scrollTop+grid.clientHeight<grid.scrollHeight-100)return;loading=true;try{const data=await request('popular',{limit:50,offset});if(token!==serial)return;const page=data.playlists||[];offset+=50;complete=page.length<50;const added=page.filter(item=>{const key=String(item.id);if(seen.has(key))return false;seen.add(key);return true;});cards(added,playlist,grid);}catch(e){host.status(e.message,true);}finally{loading=false;}});
 }
 homeButton.onclick=run(home);window.NeteaseHome=run(home);
 async function playlist(item,offset=0,accountPrivate=false){
  current=()=>playlist(item,offset,accountPrivate);const token=begin(item.name||'网易云歌单',false,accountPrivate);const data=await request('playlist',{id:item.id});if(!ready(token))return;
  sheet.classList.add('mu-playlist-page');
  const detail=data.playlist||{},ids=(detail.trackIds||[]).map(x=>x.id),first=detail.tracks||[],total=Number(detail.trackCount)||ids.length||first.length;
  sheet.querySelector('.sheet-heading h2').textContent='';
  const title=el('div','mu-playlist-hero');title.append(image(detail.coverImgUrl||item.picUrl||item.coverImgUrl));const copy=el('div','mu-playlist-heading');copy.append(el('h2','',detail.name||item.name||'网易云歌单'),el('p','mu-playlist-meta',total+' 首歌曲'),el('p','mu-playlist-creator',detail.creator?.nickname||item.creator?.nickname||'网易云音乐'));
  const actions=el('div','mu-playlist-actions'),playAll=action('播放歌单',()=>play(0)),generation=accountSerial;
  const add=action('添加歌单',()=>{if(!accountLoggedIn){account.click();return;}return changeCollection(item,!activePlaylist?.subscribed,{detail});});add.classList.add('mu-subscribe-button');activePlaylist={item,detail,button:add,generation};
  playAll.disabled=true;actions.append(playAll,add);copy.append(actions);title.append(copy);sheet.append(title);syncPlaylistButton();
  async function page(start,limit=30){const selected=ids.slice(start,start+limit);if(!selected.length)return first.slice(start,start+limit);const out=await request('songDetail',{ids:selected});const by=new Map((out.songs||[]).map(s=>[String(s.id),s]));return selected.map(id=>by.get(String(id))).filter(Boolean);}
  const batch=await page(offset);if(token!==serial)return;
  const play=async index=>{const initial=batch.map(song).map(s=>({...s,key:'online:'+s.id}));const queue=window.MusicDiscoveryQueue.createDiscoveryQueue({initialOffset:offset,initialRows:initial,selectedKey:initial[index].key,selectedRow:initial[index],fetchPage:async({offset:start,limit})=>({tracks:(await page(start,limit)).map(song).map(s=>({...s,key:'online:'+s.id})),total,complete:true})});return host.play(batch.map(song),index,{extendQueue:async context=>{const expanded=await queue.extend(context.direction);return context.isCurrent()&&context.updateQueue(expanded);}});};
  playAll.disabled=!batch.length;const list=songs(batch,{play,showPlayAll:false});let loading=false;
  if(list)list.addEventListener('scroll',async()=>{if(loading||token!==serial||offset+batch.length>=total||list.scrollTop+list.clientHeight<list.scrollHeight-100)return;loading=true;try{const base=batch.length,next=await page(offset+base);if(token!==serial)return;batch.push(...next);songs(next,{play:index=>play(base+index),container:list,showPlayAll:false});}catch(e){host.status(e.message,true);}finally{loading=false;}});
 }
 async function album(item){current=()=>album(item);const token=begin(item.name||'专辑');const data=await request('album',{id:item.id});if(ready(token))songs(data.songs||[]);}
 async function loadSongs(title,op,args={}){current=()=>loadSongs(title,op,args);const token=begin(title);const data=await request(op,args);if(!ready(token))return;songs(data.data?.dailySongs||data.data?.list?.map(x=>x.data)||data.data||data.songs||[]);}
 async function search(keyword='',type=1,offset=0){current=()=>search(keyword,type,offset);const token=begin('网易云搜索');const form=el('form','searchbox'),input=el('input',''),select=el('select','');input.type='search';input.placeholder='搜索歌曲、歌单、专辑或歌手';input.value=keyword;
  for(const [id,name]of [[1,'歌曲'],[1000,'歌单'],[10,'专辑'],[100,'歌手']]){const o=el('option','',name);o.value=id;o.selected=Number(type)===id;select.append(o);}const go=el('button','','搜索');form.append(input,select,go);form.onsubmit=e=>{e.preventDefault();void run(()=>search(input.value,Number(select.value)))();};sheet.insertBefore(form,sheet.querySelector('.netease-loading'));
  if(!keyword){ready(token);return;}const data=await request('search',{keyword,type,limit:30,offset});if(!ready(token))return;const result=data.result||{};if(type===1)songs(result.songs||[]);else if(type===1000)cards(result.playlists||[],playlist);else if(type===10)cards(result.albums||[],album);else cards(result.artists||[],item=>search(item.name,1));const count=result.songCount||result.playlistCount||result.albumCount||result.artistCount||0;paging(offset,offset+30<count,next=>search(keyword,type,next));
 }

 async function downloads(){
  current=downloads;const token=begin('已下载音乐',true);sheet.classList.add('mu-downloads-page');
  const toolbar=el('div','mu-downloads-toolbar');toolbar.append(action('打开下载目录',()=>host.openDownloads()));if(host.importDownloads)toolbar.append(action('导入音乐',async()=>{await host.importDownloads();return downloads();}));sheet.append(toolbar);
  const tracks=await host.downloadedTracks();if(!ready(token))return;
  if(!tracks.length){message('将音乐放入下载目录，或点击“导入音乐”。已下载音乐无需登录即可播放。');return;}
  const list=el('div','netease-tracks');toolbar.prepend(action('播放全部',()=>host.playRow(tracks[0],tracks)));
  tracks.forEach((track,index)=>{const row=el('article','track-row'),button=el('button','row-play');row.dataset.key=track.key;row.classList.toggle('current',host.state().track?.key===track.key);const info=el('span','row-info');info.append(el('strong','',track.name),el('small','',track.artists||'本地音乐'));const cover=image(track.cover_url);cover.classList.add('local-cover');cover.dataset.file=track.file;button.append(el('span','row-number',String(index+1)),cover,info);const play=run(()=>host.playRow(track,tracks));button.onclick=play;button.ondblclick=play;row.append(button);const seconds=Math.max(0,Math.floor(track.duration_seconds||0));row.append(el('span','mu-track-duration',String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')));list.append(row);});sheet.append(list);
 }
 const cloudList=el('div','mu-cloud-playlists');cloudList.id='mu-cloud-playlists';nav.append(cloudList);
 function guest(){const login=action('登录后显示网易云歌单',()=>account.click());login.className='mu-cloud-login';cloudList.append(login);}
 async function refreshAccount(value){
  const token=++accountSerial;uid=null;cloudPlaylists=[];accountLoggedIn=!!value?.loggedIn;likedIds=new Set();likesReady=false;likesError=false;likeBusy.clear();playlistBusy.clear();cloudList.replaceChildren();syncLikes();syncPlaylistButton();
  if(!accountLoggedIn){guest();return;}
  cloudList.append(el('p','mu-cloud-hint','正在读取云歌单…'));
  try{
   let id=value.userId;if(!id){const profile=await request('profile');if(token!==accountSerial)return;id=profile.profile?.userId;}if(!id)throw Error('无法读取网易云用户编号');uid=String(id);void readLikes(token,uid);
   const collected=[];for(let offset=0;offset<3000;offset+=100){const data=await request('userPlaylists',{uid,offset,limit:100});if(token!==accountSerial)return;const page=data.playlist||data.playlists||[];collected.push(...page);if(!data.more||!page.length)break;}
   if(token!==accountSerial)return;cloudPlaylists=collected;renderCloudPlaylists();
  }catch(e){if(token!==accountSerial)return;cloudList.replaceChildren(el('p','mu-cloud-hint',e.message));cloudList.append(action('重新读取',()=>refreshAccount(value)));}
 }
 async function chooseCloudPlaylist(track){
  if(!accountLoggedIn){account.click();return;}
  const generation=accountSerial,user=uid,writable=cloudPlaylists.filter(p=>String(p.creator?.userId||p.userId)===user&&!protectedPlaylist(p));
  const dialog=el('dialog','mu-tools-dialog mu-cloud-picker');dialog.append(el('h2','','加入网易云歌单'),el('p','','选择歌单后加入：'+track.name));
  if(!writable.length)dialog.append(el('p','','当前账号暂无自建歌单；使用爱心可加入我喜欢的音乐。'));
  for(const item of writable){const button=el('button','mu-cloud-choice');button.type='button';button.append(image(item.coverImgUrl||item.picUrl),el('span','',item.name||'未命名歌单'));button.onclick=async()=>{if(generation!==accountSerial||!accountLoggedIn){dialog.close();return;}for(const b of dialog.querySelectorAll('button'))b.disabled=true;try{await request('playlistTracks',{id:item.id,ids:[track.id],remove:false});if(generation===accountSerial)host.status('已加入网易云歌单 · '+item.name);dialog.close();}catch(e){host.status(e.message,true);for(const b of dialog.querySelectorAll('button'))b.disabled=false;}};dialog.append(button);}
  const cancel=el('form','');cancel.method='dialog';cancel.append(el('button','','取消'));dialog.append(cancel);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
 }
 async function fm({reveal=true}={}){
  current=fm;const token=begin('每日好歌推荐',false,true,reveal);sheet.classList.add('mu-daily-page');if(!accountLoggedIn){ready(token);message('登录网易云后获取每日好歌推荐；已下载音乐可直接播放。');sheet.append(action('登录网易云',()=>account.click()));return;}
  const generation=accountSerial,data=await request('fm');if(!ready(token)||generation!==accountSerial)return;const tracks=(data.data||data.songs||[]).map(song),seen=new Set(tracks.map(s=>s.id));let pool=tracks.map(s=>({...s,key:'online:'+s.id}));
  const play=index=>host.play(tracks,index,{extendQueue:async context=>{if(context.direction<0||generation!==accountSerial)return false;const more=await request('fm');if(generation!==accountSerial||!context.isCurrent())return false;const next=(more.data||more.songs||[]).map(song).filter(s=>!seen.has(s.id));next.forEach(s=>seen.add(s.id));pool.push(...next.map(s=>({...s,key:'online:'+s.id})));return next.length?context.updateQueue(pool):false;}});
  const actions=el('div','mu-daily-actions');actions.append(action('播放全部',()=>play(0)),action('换一批',fm));sheet.append(actions);songs(data.data||data.songs||[],{play,showPlayAll:false});
 }
 const fmButton=action('每日好歌推荐',fm);fmButton.dataset.view='fm';nav.prepend(fmButton);
 window.NeteaseViews={downloads:()=>run(downloads)(),home:()=>run(home)(),search:(q,type=1)=>run(()=>search(q,type))(),refresh:()=>run(current||home)(),cancel:()=>{serial++;},open:title=>title==='私人 FM'?run(fm)():run(home)()};
 function accountChanged(value){closePlaylistMenu();document.querySelector('.mu-delete-playlist')?.close();const reload=privateView?(current===fm?fm:home):null,reveal=!sheet.hidden;if(reload)serial++;document.querySelector('.mu-cloud-picker')?.close();void refreshAccount(value);if(reload)void run(()=>reload({reveal}))();}
 bridge.onAccountStatus?.(accountChanged);
 const initialAccountSerial=accountSerial;Promise.resolve(bridge.accountStatus?.()).then(value=>{if(initialAccountSerial===accountSerial)return accountChanged(value);}).catch(()=>{if(initialAccountSerial===accountSerial)guest();});
})();
