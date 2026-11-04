'use strict';
const {normalizePlaylist,normalizeSong}=require('./discovery_service');
const {createPlaylistReader}=require('./playlist_reader');
const BASE='https://music.163.com/api';
const HEADERS={'User-Agent':'Mozilla/5.0','Referer':'https://music.163.com/'};
// A playlist is a catalog: keep short or trial-marked entries visible so the
// separate availability probe can place unavailable tracks at the page end.
function normalizeListedSong(raw){
 if(!raw||typeof raw!=='object')return null;
 const source=raw.song&&typeof raw.song==='object'?{...raw,...raw.song}:raw;
 const duration=Number(source.duration_seconds||0)||Number(source.dt||source.duration||0)/1000;
 const short=Number.isFinite(duration)&&duration>0&&duration<=20;
 const candidate={...source,song:undefined,freeTrialInfo:null,trialInfo:null};
 if(short){candidate.duration_seconds=0;candidate.dt=0;candidate.duration=0;}
 const track=normalizeSong(candidate);
 if(track&&short)track.duration_seconds=Math.max(1,Math.round(duration));
 return track;
}
function createPopularPlaylists({fetchJSON,now=Date.now}){
 let refreshOffset=0;const cache=new Map(),pending=new Map();
 const fetcher=(url,options)=>fetchJSON(url,{...options,headers:HEADERS});
 const reader=createPlaylistReader({getBases:()=>[BASE],fetchJSON:fetcher,normalizeSong:normalizeListedSong,now});
 async function get({page=1,force=false}={}){
  if(!Number.isInteger(page)||page<1||page>100||typeof force!=='boolean')throw Error('热门歌单分页参数无效');
  const nextOffset=force?(refreshOffset+40)%200:refreshOffset;
  const offset=nextOffset+(page-1)*8,key=String(offset);
  let data=cache.get(key),offline=false;
  if(!data||force){
   if(!pending.has(key)){
    const url=new URL(BASE+'/playlist/list');for(const [k,v] of Object.entries({cat:'全部',order:'hot',limit:8,offset}))url.searchParams.set(k,String(v));
    const job=fetcher(url.href,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000)}).then(raw=>{
     if(!raw||raw.code!==200||!Array.isArray(raw.playlists))throw Error('热门歌单接口返回异常');
     const seen=new Set(),playlists=[];for(const row of raw.playlists){const list=normalizePlaylist(row);if(!list||seen.has(list.id))continue;seen.add(list.id);list.playCount=Math.max(0,Number(row.playCount)||0);playlists.push(list);}
     if(!playlists.length)throw Error('热门歌单接口没有返回歌单');
     const result={playlists,total:Math.max(0,Number(raw.total)||0),hasMore:typeof raw.more==='boolean'?raw.more:offset+8<(Number(raw.total)||0),fetchedAt:now()};
     cache.set(key,result);while(cache.size>30)cache.delete(cache.keys().next().value);return result;
    }).finally(()=>pending.delete(key));pending.set(key,job);
   }
   try{data=await pending.get(key);if(force)refreshOffset=nextOffset;}catch{offline=true;data=cache.get(String(refreshOffset+(page-1)*8))||null;}
  }
  if(!data)return {ok:false,playlists:[],page,hasMore:false,offline:true,message:'热门歌单暂时无法加载，请刷新重试。'};
  return {ok:true,...data,page,offline,message:offline?'网络暂不可用，显示之前加载的热门歌单。':'网易云热门歌单'};
 }
 async function playlist(id,{offset=0,limit=8}={}){
  if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0||offset>100000)throw Error('歌单分页参数无效');
  return reader.read(String(id),{offset,limit});
 }
 return {get,playlist};
}
module.exports={createPopularPlaylists};
