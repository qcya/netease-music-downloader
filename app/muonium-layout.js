/*
 * MuoniumPlayer desktop layout adaptation.
 * Copyright 2026 MuoniumPlayer Team, Apache License 2.0.
 * Adapted from NCMScreen.layout/getPlayerCornerRadius and
 * panels/NavigateBar.layout, PlaylistPanel.layout. Original Java sources,
 * LICENSE and NOTICE are retained in app/vendor/muonium. The Minecraft/Skija
 * runtime is replaced by DOM layout and Windows desktop composition.
 */
(function(){
 'use strict';
 const panel=document.querySelector('.panel');
 if(!panel)return;
 function update(){
  const w=panel.clientWidth,h=panel.clientHeight;
  // NavigateBar.java: responsiveMinimum=min(92,panelWidth*.30),
  // width=max(panelWidth*.15,responsiveMinimum).
  const nav=Math.max(w*.15,Math.min(92,w*.30));
  // NCMScreen.java: controlsHeight=min(height,max(28,height*.07)).
  const controls=Math.min(h,Math.max(28,h*.07));
  const radius=Math.max(8,Math.min(18,h*.028));
  panel.style.setProperty('--mu-nav-width',`${nav}px`);
  panel.style.setProperty('--mu-controls-height',`${controls}px`);
  panel.style.setProperty('--mu-corner',`${radius}px`);
 }
 new ResizeObserver(update).observe(panel);update();
 const title=document.getElementById('list-title'),count=document.getElementById('list-count');
 const back=document.getElementById('back-discovery'),hero=document.getElementById('mu-playlist-hero');
 const heroTitle=document.getElementById('mu-playlist-name'),heroInfo=document.getElementById('mu-playlist-info');
 if(!title||!back||!hero)return;
 function sync(){
  const local=hero.dataset.local==='true',visible=local||!back.hidden;hero.hidden=!visible;
  if(visible&&!local){heroTitle.textContent=title.textContent;heroInfo.textContent=count?.textContent||'';}
 }
 new MutationObserver(sync).observe(title,{childList:true,subtree:true,characterData:true});
 new MutationObserver(sync).observe(back,{attributes:true,attributeFilter:['hidden']});
 if(count)new MutationObserver(sync).observe(count,{childList:true,subtree:true,characterData:true});
 sync();
})();
