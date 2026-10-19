'use strict';
const {createHash} = require('node:crypto');
const {readJSON, writeJSONAtomic} = require('./durable_json');
const CATEGORIES = Object.freeze({all:'全部',chinese:'华语',japanese:'日语',acg:'ACG',instrumental:'轻音乐'});
const DEFAULT_BASES = ['https://music.163.com/api'];
const isPublicBase = base => base.replace(/\/+$/,'')==='https://music.163.com/api';
const text = (value, limit=160) => typeof value === 'string' ? value.trim().slice(0,limit) : '';
function cover(value) {
  try {
    const u=new URL(value);
    if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!/(^|\.)music\.(126|163)\.net$/.test(u.hostname))return '';
    u.protocol='https:';return u.href;
  } catch { return ''; }
}
function normalizeSong(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const item=raw.song&&typeof raw.song==='object'?{...raw,...raw.song}:raw;
  const id=String(item.id||''),name=text(item.name||item.title);
  if(!/^\d{1,20}$/.test(id)||!name||item.freeTrialInfo||item.trialInfo)return null;
  const duration=Number(item.duration_seconds||0)||Number(item.dt||item.duration||0)/1000;
  if(duration>0&&duration<=20)return null;
  const album=item.al||item.album||{},artists=item.ar||item.artists;
  return {id,name,artists:Array.isArray(artists)?artists.map(a=>text(a?.name,80)).filter(Boolean).join(' / '):text(item.artists||item.artist,120),
    album:text(album.name),duration_seconds:Number.isFinite(duration)?Math.max(0,Math.round(duration)):0,
    cover_url:cover(album.picUrl||item.picUrl||item.coverUrl)};
}
function normalizePlaylist(item) {
  if(!item||typeof item!=='object')return null;
  const id=String(item.id||''),name=text(item.name);
  if(!/^\d{1,20}$/.test(id)||!name)return null;
  return {id,name,cover_url:cover(item.coverImgUrl||item.picUrl),description:text(item.description||item.copywriter,260),
    trackCount:Math.max(0,Math.min(100000,Number(item.trackCount)||0)),creator:text(typeof item.creator==='string'?item.creator:item.creator?.nickname,80)};
}
function unique(rows,normalize) { const seen=new Set();return rows.map(normalize).filter(x=>x&&!seen.has(x.id)&&seen.add(x.id)); }
function dayStamp(value) {const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function ranked(rows,seed) {return [...rows].map(row=>({row,key:createHash('sha256').update(seed+'|'+row.id).digest('hex')})).sort((a,b)=>a.key.localeCompare(b.key)).map(x=>x.row);}
function page(rows,count,batch){if(rows.length<=count)return rows;const start=(batch%Math.ceil(rows.length/count))*count;return rows.slice(start,start+count);}
function createDiscoveryService({getFile,getBases=()=>DEFAULT_BASES,fetchJSON,now=Date.now}) {
  let cache;const pending=new Map();
  function read(){if(cache)return cache;try{const raw=readJSON(getFile(),{});cache=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};}catch{cache={};}return cache;}
  async function load(category,day) {
    const start=now(),deadline=Date.now()+25000;
    const bases=(getBases()?.length?getBases():DEFAULT_BASES).slice(0,3);
    let calls=0;
    async function request(base,endpoint,params) {
      if(++calls>8||Date.now()>=deadline)return null;
      try{
        const url=new URL(base.replace(/\/+$/,'')+endpoint);
        if(!['http:','https:'].includes(url.protocol))return null;
        for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
        const result=await fetchJSON(url.href,{credentials:'omit',signal:AbortSignal.timeout(Math.max(1,Math.min(6500,deadline-Date.now())))});
        return result&&typeof result==='object'&&(!result.code||result.code===200)?result:null;
      }catch{return null;}
    }
    let playlists=[],songs=[];
    for(const base of bases){
      const direct=isPublicBase(base);
      const data=await request(base,direct?'/playlist/list':'/top/playlist',{cat:CATEGORIES[category],order:'hot',limit:48,offset:0});
      playlists=unique(Array.isArray(data?.playlists)?data.playlists:[],normalizePlaylist);
      if(!playlists.length&&category==='all'){
        const fallback=await request(base,direct?'/personalized/playlist':'/personalized',{limit:48});
        playlists=unique(Array.isArray(fallback?.result)?fallback.result:[],normalizePlaylist);
      }
      if(playlists.length){
        const selected=ranked(playlists,day+'|'+category).slice(0,2);
        for(const list of selected){
          const data=direct?null:await request(base,'/playlist/track/all',{id:list.id,limit:60,offset:0});
          let rows=Array.isArray(data?.songs)?data.songs:[];
          if(!rows.length){const detail=await request(base,'/playlist/detail',{id:list.id});const result=direct?detail?.result:detail?.playlist;rows=Array.isArray(result?.tracks)?result.tracks.slice(0,60):[];}
          songs.push(...rows);
        }
        if(songs.length)break;
      }
      if(!direct&&category==='all'&&!songs.length){
        const fresh=await request(base,'/personalized/newsong',{limit:60});
        songs.push(...(Array.isArray(fresh?.result)?fresh.result:[]));
      }
      if(playlists.length||songs.length)break;
    }
    const tracks=unique(songs,normalizeSong).slice(0,120);
    if(!playlists.length&&!tracks.length)throw new Error('公开推荐接口暂不可用');
    return {day,fetchedAt:start,playlists:playlists.slice(0,48),songs:tracks};
  }
  async function get(options={}) {
    const {category='all',batch=0,force=false,excludeIds=[]}=options;
    if(!Object.hasOwn(CATEGORIES,category))throw new Error('推荐分类无效');
    if(!Number.isInteger(batch)||batch<0||batch>10000)throw new Error('推荐批次无效');
    if(!Array.isArray(excludeIds)||excludeIds.length>1000||excludeIds.some(x=>!/^\d{1,20}$/.test(String(x))))throw new Error('忽略歌曲列表无效');
    const requestedDay=dayStamp(now()),key=category,settingsKey=JSON.stringify(getBases()),stored=read()[key];
    const valid=stored&&stored.settingsKey===settingsKey&&Array.isArray(stored.songs)&&Array.isArray(stored.playlists);
    let data=valid?stored:null,offline=false;
    if(force||!data||data.day!==requestedDay){
      const requestKey=category+'|'+requestedDay+'|'+settingsKey;
      if(!pending.has(requestKey))pending.set(requestKey,load(category,requestedDay).then(result=>{
        const value={...result,settingsKey};
        if(JSON.stringify(getBases())===settingsKey){
          read()[key]=value;
          try{writeJSONAtomic(getFile(),cache);}catch{/* A failed cache write must not block valid online recommendations. */}
        }
        return value;
      }).finally(()=>pending.delete(requestKey)));
      try{data=await pending.get(requestKey);}catch{offline=true;}
    }
    const base={ok:!!data,category,label:CATEGORIES[category],personalized:false,requestedDay,offline};
    if(!data)return {...base,day:requestedDay,songs:[],playlists:[],poolSize:0,message:'暂时连不上推荐接口。可重试、搜索，或随机播放本地音乐。'};
    const excluded=new Set(excludeIds.map(String));
    const tracks=unique(data.songs,s=>normalizeSong({...s,al:{name:s.album,picUrl:s.cover_url}})).filter(s=>!excluded.has(s.id));
    const lists=unique(data.playlists,p=>normalizePlaylist({...p,picUrl:p.cover_url}));
    return {...base,day:data.day,fetchedAt:data.fetchedAt,poolSize:tracks.length,
      songs:page(ranked(tracks,data.day+'|'+category+'|songs'),8,batch),
      playlists:page(ranked(lists,data.day+'|'+category+'|lists'),6,batch),
      message:offline?`当前展示 ${data.day} 的缓存推荐，不是今天的在线结果。`:'来自公开精选歌单；不是网易云账号的私人日推。音源能否完整下载以实际结果为准。'};
  }
  const playlistReader=require('./playlist_reader').createPlaylistReader({getBases,fetchJSON,normalizeSong,now});
  const playlist=(id,options)=>playlistReader.read(id,options);
  return {get,playlist};
}
module.exports={createDiscoveryService,normalizeSong,normalizePlaylist,dayStamp,CATEGORIES};
