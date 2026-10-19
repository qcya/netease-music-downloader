'use strict';
(function(root){
  function create({document:doc,bridge,onSong,onDownload,onPlaylist,onLocalRandom,notify,availability}){
    const get=id=>doc.getElementById(id);
    let storage;try{storage=root.localStorage;}catch{storage={getItem:()=>null,setItem:()=>{}};}
    const read=(key,fallback)=>{try{return JSON.parse(storage.getItem(key))??fallback;}catch{return fallback;}};
    const save=(key,value)=>{try{storage.setItem(key,JSON.stringify(value));}catch{}};
    let category=read('discovery-category','all'),batch=0,serial=0,initialized=false;
    if(!['all','vocaloid','bilibili','cantonese','electronic','chinese'].includes(category))category='all';
    let excluded=read('discovery-excluded',[]);if(!Array.isArray(excluded))excluded=[];
    excluded=excluded.filter(x=>/^\d{1,20}$/.test(String(x))).map(String).slice(-500);
    const el=(tag,cls,text)=>{const e=doc.createElement(tag);e.className=cls||'';if(text!==undefined)e.textContent=text;return e;};
    function artwork(url,label){
      const box=el('span','discovery-art');box.textContent='♪';
      if(url){const img=el('img');img.alt=label;img.loading='lazy';img.src=url;img.addEventListener('error',()=>img.remove(),{once:true});box.append(img);}
      return box;
    }
    function render(data){
      const songs=get('discovery-songs'),lists=get('discovery-playlists');songs.replaceChildren();lists.replaceChildren();
      get('discovery-date').textContent=data.day||'';
      get('discovery-state').textContent=data.message||'推荐暂时不可用';
      get('discovery-state').classList.toggle('is-offline',!!data.offline);
      get('discovery-pool').textContent=`候选 ${data.poolSize||0} 首 · 最近已展示 ${data.seenCount||0} 首 · 第 ${batch+1} 批`; 
      for(const song of data.songs||[]){
        const card=el('article','discovery-song');card.dataset.songId=song.id;
        const info=el('div','discovery-song-info'),name=el('strong','',song.name);name.title=song.name;
        info.append(name,el('span','',song.artists||'歌手信息暂缺'));
        if(song.reason)info.append(el('small','discovery-reason',song.reason));
        const play=el('span');
        availability.bind(play,song,{className:'discovery-play',onPlay:()=>onSong(song,data.songs)});
        const skip=el('button','discovery-dismiss','×');skip.type='button';skip.title='暂时不再推荐这首';skip.setAttribute('aria-label','不感兴趣：'+song.name);
        skip.onclick=()=>{excluded=[...new Set([...excluded,song.id])].slice(-500);save('discovery-excluded',excluded);void load();};
        const download=el('button','discovery-download','↓');download.type='button';download.title='下载到本地';download.setAttribute('aria-label','下载 '+song.name);download.onclick=async()=>{download.disabled=true;try{await onDownload(song);}finally{download.disabled=false;}};
        card.append(artwork(song.cover_url,''),info,play,download,skip);songs.append(card);
      }
      if(!songs.children.length)songs.append(el('p','discovery-empty','暂时没有符合口味的歌曲。试试其他分类，或从本地随机听一首。'));
      for(const list of data.playlists||[]){
        const card=el('button','discovery-playlist');card.type='button';card.dataset.playlistId=list.id;card.title=list.description||list.name;
        card.append(artwork(list.cover_url,''),el('strong','',list.name),el('span','discovery-playlist-meta',list.trackCount?`${list.trackCount} 首 · 查看歌曲`:'查看歌曲'));
        if(list.reason)card.append(el('span','discovery-reason',list.reason));
        card.onclick=()=>onPlaylist(list);lists.append(card);
      }
      if(!lists.children.length)lists.append(el('p','discovery-empty','推荐歌单暂未载入；重试不会影响本地播放。'));
    }
    async function load(force=false){
      const request=++serial;get('discovery-refresh').disabled=true;get('discovery-next').disabled=true;
      get('discovery-state').textContent='正在按你的口味找歌…';get('discovery-panel').setAttribute('aria-busy','true');
      for(const button of get('discovery-categories').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.category===category));
      try{
        const data=await bridge.discovery({category,batch,force,excludeIds:excluded});
        if(request!==serial)return;
        render(data||{offline:true,message:'推荐接口没有返回数据。',songs:[],playlists:[]});
      }catch(e){if(request===serial)render({offline:true,message:'推荐暂不可用：'+(e.message||String(e)),songs:[],playlists:[]});}
      finally{if(request===serial){get('discovery-refresh').disabled=false;get('discovery-next').disabled=false;get('discovery-panel').setAttribute('aria-busy','false');}}
    }
    get('discovery-refresh').onclick=()=>{batch=(batch+1)%10000;void load(true);};
    get('discovery-next').onclick=()=>{batch=(batch+1)%10000;void load();};
    get('discovery-local').onclick=()=>{void onLocalRandom();};
    get('discovery-reset').onclick=()=>{excluded=[];save('discovery-excluded',[]);batch=0;void load();};
    for(const button of get('discovery-categories').querySelectorAll('button'))button.onclick=()=>{category=button.dataset.category;save('discovery-category',category);batch=0;void load();};
    return {init(){if(initialized)return;initialized=true;return load();},reload:()=>load(true)};
  }
  root.MusicDiscovery={create};
})(window);
