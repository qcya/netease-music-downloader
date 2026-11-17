/* Layout and icon adapter for MuoniumPlayer NCMScreen / NavigateBar /
 * ControlsBar at 9b4cc7e7. Apache-2.0. Geometry uses the upstream logical units.
 * The desktop window replaces the Minecraft viewport; our lyric engine stays. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),root=document.querySelector('.panel'),tabs=document.querySelector('.tabs'),host=window.NeteaseDesktopHost,views=window.NeteaseViews;
 const make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
 root.classList.add('mu-restored');
 const titlebar=document.querySelector('header');titlebar.hidden=true;
 const scroll=make('div','mu-navigation-scroll');
 const search=$('search-form');tabs.prepend(search);search.classList.add('mu-sidebar-search');$('query').placeholder='搜索歌曲…';$('query').setAttribute('aria-label','搜索网易云');
 const modes=make('div','mu-search-modes');let searchType=1;
 for(const [type,label]of [[1,'歌曲'],[1000,'歌单']]){const b=make('button',type===1?'selected':'',label);b.type='button';b.onclick=()=>{searchType=type;for(const x of modes.children)x.classList.toggle('selected',x===b);$('query').placeholder=type===1?'搜索歌曲…':'搜索歌单…';};modes.append(b);}search.append(modes);
 search.onsubmit=e=>{e.preventDefault();const text=$('query').value.trim();if(text)void views.search(text,searchType);};
 const appTitle=make('h1','mu-app-title'),appIcon=make('img','mu-app-icon');appIcon.src='../assets/avatar.png';appIcon.alt='';appTitle.append(appIcon,make('span','mu-app-name','青春沿岸の音乐播放器'));tabs.prepend(appTitle);
 const home=$('home-button');scroll.append(home);home.prepend(make('span','mu-glyph mu-music-font','A'));
 const netNav=document.querySelector('.mu-net-nav');
 const navIcon=path=>{const n=make('span','mu-nav-icon');n.setAttribute('aria-hidden','true');n.innerHTML='<svg viewBox="0 0 24 24">'+path+'</svg>';return n;};
 const fm=[...netNav.querySelectorAll('button')].find(n=>n.dataset.view==='fm');if(fm){fm.prepend(navIcon('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'));scroll.append(fm);}
 const downloads=make('button','mu-nav-playlist','已下载音乐');downloads.type='button';downloads.dataset.view='downloads';downloads.prepend(navIcon('<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>'));downloads.onclick=()=>{void views.downloads();for(const button of scroll.querySelectorAll('button'))button.classList.toggle('active',button===downloads);};scroll.append(downloads);
 scroll.append(make('div','mu-nav-heading','我的网易云歌单'),$('mu-cloud-playlists'));netNav.remove();tabs.append(scroll);
 // Local playlist management remains in the downloaded music view.
 $('mu-nav-playlists').hidden=true;for(const key of ['local','recent','search']){const button=tabs.querySelector('[data-tab='+key+']');if(button)button.hidden=true;}
 const account=$('account-entry');tabs.append(account);
 const picture=make('span','mu-account-picture');for(const id of ['account-avatar','account-placeholder'])picture.append($(id));const settingsHint=make('span','mu-settings-hint','打开\n设置');settingsHint.setAttribute('aria-hidden','true');picture.append(settingsHint);account.prepend(picture);
 root.dataset.theme='dark';
 const close=make('button','mu-window-close');close.type='button';close.title='关闭播放器界面';close.setAttribute('aria-label',close.title);close.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>';close.onclick=()=>host.hide();root.append(close);
 const sharedBar=window.MusicPlayerBar.mount(host);
 // The band describes geometry only: it must never cover search, refresh,
 // back, artwork or a dialog. Delegate blank-space hits to the real root.
 const drag=make('div','mu-window-drag');drag.setAttribute('aria-hidden','true');root.append(drag);let held=false;
 const noDrag='button,input,select,textarea,a,dialog,form,[role="button"],[contenteditable="true"],.netease-card,.track-row,.mu-playlist-hero>img';
 function canDrag(e){const b=drag.getBoundingClientRect();return !e.target.closest(noDrag)&&e.clientX>=b.left&&e.clientX<b.right&&e.clientY>=b.top&&e.clientY<b.bottom;}
 root.addEventListener('pointerdown',e=>{if(e.button!==0||e.defaultPrevented||!canDrag(e))return;e.preventDefault();e.stopPropagation();held=true;root.setPointerCapture(e.pointerId);window.musicBridge.panelAction({type:'begin',kind:'move',native:true});},true);
 root.addEventListener('pointermove',e=>{root.classList.toggle('mu-can-drag',held||canDrag(e));});
 root.addEventListener('pointerleave',()=>{if(!held)root.classList.remove('mu-can-drag');});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])root.addEventListener(name,()=>{if(held){held=false;root.classList.remove('mu-can-drag');window.musicBridge.panelAction({type:'end'});}});
 function geometry(){const unit=Math.max(.9,Math.min(2.3,root.clientWidth/835));root.style.setProperty('--mu-unit',unit);root.style.setProperty('--mu-controls-height',Math.max(96,48*unit)+'px');root.style.setProperty('--mu-corner',window.MusicWindowShape.radius+'px');}
 new ResizeObserver(geometry).observe(root);geometry();

})();
