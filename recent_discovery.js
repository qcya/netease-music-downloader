'use strict';
const {normalizeSong,dayStamp}=require('./discovery_service');
const {readJSON,writeJSONAtomic}=require('./durable_json');
function createRecentDiscovery({getFile,getBases=()=>[],fetchJSON,now=Date.now}){
 const pending=new Map();
 async function get({batch=0,force=false,excludeIds=[]}={}){
  if(!Number.isInteger(batch)||batch<0||batch>10000||!Array.isArray(excludeIds)||excludeIds.length>1000)throw Error('推荐参数无效');
  const bases=[...getBases().slice(0,3),'https://music.163.com/api'];
  const key=JSON.stringify(bases),day=dayStamp(now());
  let stored=readJSON(getFile(),{}),data=stored?.key===key?stored:null,offline=false;
  if(force||!data||data.day!==day){
   if(!pending.has(key))pending.set(key,(async()=>{
    for(const base of bases){
     const direct=base.replace(/\/+$/,'')==='https://music.163.com/api';
     try{
      const raw=await fetchJSON(base.replace(/\/+$/,'')+(direct?'/v1/discovery/new/songs?areaId=0':'/top/song?type=0'),{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(6500)});
      if(raw.code&&raw.code!==200)continue;
      const rows=raw.data||raw.songs||raw.result;if(!Array.isArray(rows))continue;
      const ids=new Set(),songs=rows.map(normalizeSong).filter(s=>s&&s.publishedAt>0&&s.publishedAt<=now()&&now()-s.publishedAt<=365*86400000&&!ids.has(s.id)&&ids.add(s.id)).sort((a,b)=>b.publishedAt-a.publishedAt);
      if(!songs.length)continue;
      const result={key,day,fetchedAt:now(),songs};try{writeJSONAtomic(getFile(),result);}catch{}
      return result;
     }catch{}
    }
    throw Error('新歌接口未返回有日期的新歌');
   })().finally(()=>pending.delete(key)));
   try{data=await pending.get(key);}catch{offline=true;}
  }
  const excluded=new Set(excludeIds.map(String)),songs=(data?.songs||[]).filter(s=>!excluded.has(s.id));
  const start=batch*8;
  return {ok:!!data,category:'recent',label:'近期新歌',day:data?.day||day,requestedDay:day,offline,poolSize:songs.length,seenCount:Math.min(start,songs.length),
   songs:songs.slice(start,start+8).map(s=>({...s,reason:'发行于 '+dayStamp(s.publishedAt)})),playlists:[],
   message:offline?(data?`当前展示 ${data.day} 的缓存新歌；在线刷新失败。`:'暂时没有取得近期新歌，不用经典老歌填充。'):
    start>=songs.length?'本轮新歌已看完；可以回到第一批，或稍后刷新。':'近一年发行的新歌，按发行时间排序；不是私人日推。'};
 }
 return {get};
}
module.exports={createRecentDiscovery};
