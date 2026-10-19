'use strict';
const {readJSON,writeJSONAtomic}=require('./durable_json');
const {normalizeSong,normalizePlaylist,dayStamp,createDiscoveryService}=require('./discovery_service');
const seed=(title,artist='')=>({title,artist,query:[title,artist].filter(Boolean).join(' ')});
// Search terms, not invented song IDs or a downloaded song catalog.
const PROFILES=Object.freeze({
  vocaloid:{label:'术力口 / 虚拟歌手',related:'初音ミク',lists:['术力口','VOCALOID','洛天依'],seeds:[
    seed('千本桜','黒うさP'),seed('普通DISCO','ilem'),seed('メズマライザー','サツキ'),seed('ラビットホール','DECO*27'),
    seed('达拉崩吧','ilem'),seed('勾指起誓','ilem'),seed('白日妄想家','Magens'),seed('感官过载')]},
  bilibili:{label:'B站 / 二创小曲',related:'69岁牢二次元',lists:['B站热门','二创','小曲'],seeds:[
    seed('unhappy','69岁牢二次元'),seed('感官过载'),seed('Monody','TheFatRat'),seed('Astronomia','Tony Igy'),
    seed('Buttercup','Jack Stauber'),seed('The Spectre','Alan Walker'),seed('Unity','TheFatRat'),seed('白日妄想家','Magens')]},
  cantonese:{label:'粤语',related:'Beyond',lists:['粤语经典','Beyond','粤语'],seeds:[
    seed('海阔天空','Beyond'),seed('光辉岁月','Beyond'),seed('红日','李克勤'),seed('喜欢你','Beyond'),
    seed('富士山下','陈奕迅'),seed('月半小夜曲','李克勤'),seed('浮夸','陈奕迅'),seed('千千阙歌','陈慧娴')]},
  electronic:{label:'欧美 / 电音',related:'Alan Walker',lists:['Alan Walker','欧美电音','TheFatRat'],seeds:[
    seed('Faded','Alan Walker'),seed('Alone','Alan Walker'),seed('Darkside','Alan Walker'),seed('On My Way','Alan Walker'),
    seed('The Spectre','Alan Walker'),seed('Ignite','K-391'),seed('Monody','TheFatRat'),seed('Wake Me Up','Avicii')]},
  chinese:{label:'华语流行',related:'于果',lists:['华语流行','侧脸','华语热门'],seeds:[
    seed('侧脸','于果'),seed('坠落'),seed('起风了','买辣椒也用券'),seed('晴天','周杰伦'),
    seed('七里香','周杰伦'),seed('偏爱','张芸京'),seed('小半','陈粒'),seed('说散就散','袁娅维')]}
});
const CATEGORIES=Object.freeze({all:'合口味',...Object.fromEntries(Object.entries(PROFILES).map(([k,p])=>[k,p.label]))});
const VERSION=1,DEFAULT_BASES=['https://music.163.com/api'];
const compact=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const unwanted=s=>/伴奏|铃声|钢琴版|纯音乐版|翻唱|karaoke|instrumental|music box/i.test(s);
const signature=s=>compact(s.name.replace(/[（(][^）)]*[）)]/g,''))+'|'+compact(s.artists);
function familiarRows(raw,anchor,taste){
  const rows=raw.map(normalizeSong).filter(Boolean).filter(s=>!unwanted(s.name));
  const title=compact(anchor.title),artist=compact(anchor.artist);
  return rows.filter(s=>compact(s.name).includes(title)&&(!artist||compact(s.artists).includes(artist)))
    .sort((a,b)=>Number(compact(b.name)===title)-Number(compact(a.name)===title))
    .slice(0,2).map(s=>({...s,taste,familiar:true,reason:PROFILES[taste].label+' · '+anchor.title}));
}
function createTasteDiscoveryService({getFile,getBases=()=>[],fetchJSON,now=Date.now}){
  let saved;const queries=new Map(),queryPending=new Map(),pending=new Map();
  const actualBases=()=>{const v=getBases();return Array.isArray(v)&&v.length?v.slice(0,3):DEFAULT_BASES;};
  const context=()=>({bases:actualBases(),key:JSON.stringify(actualBases())});
  function read(){if(saved)return saved;try{const v=readJSON(getFile(),{});saved=v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{saved={};}return saved;}
  async function search(term,type,ctx,day,force,deadline){
    const key=ctx.key+'|'+day+'|'+type+'|'+term;
    if(!force&&queries.has(key))return queries.get(key);
    if(queryPending.has(key))return queryPending.get(key);
    const task=(async()=>{
      for(const base of ctx.bases){
        if(Date.now()>=deadline)break;
        try{
          const direct=base.replace(/\/+$/,'')==='https://music.163.com/api';
          const args=new URLSearchParams({[direct?'s':'keywords']:term,type:String(type),limit:type===1?'12':'8',offset:'0'});
          const url=base.replace(/\/+$/,'')+(direct?(type===1?'/cloudsearch/pc':'/search/get'):'/search')+(direct?'':'?'+args);
          const options={credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(6000,deadline-Date.now()))),
            ...(direct?{method:'POST',body:args.toString(),headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':'https://music.163.com/'}}:{})};
          const data=await fetchJSON(url,options);
          if(data?.code&&data.code!==200)continue;
          const rows=data?.result?.[type===1?'songs':'playlists'];
          if(!Array.isArray(rows))continue;
          queries.set(key,rows.slice(0,12));while(queries.size>160)queries.delete(queries.keys().next().value);
          return rows;
        }catch{/* Do not substitute unrelated global recommendations. */}
      }
      return null;
    })();queryPending.set(key,task);try{return await task;}finally{queryPending.delete(key);}
  }
  async function build(category,batch,day,ctx,force){
    const lanes=category==='all'?Object.keys(PROFILES):[category],jobs=[],groups=new Map(),deadline=Date.now()+26000;
    for(const taste of lanes){
      const p=PROFILES[taste],count=category==='all'?({vocaloid:3,bilibili:2}[taste]||1):6;
      const group={familiar:[],related:[],lists:[],received:false};groups.set(taste,group);
      for(let i=0;i<count;i++){
        const anchor=p.seeds[(batch*count+i)%p.seeds.length];
        jobs.push(async()=>{const rows=await search(anchor.query,1,ctx,day,force,deadline);if(rows!==null)group.received=true;group.familiar[i]=familiarRows(rows||[],anchor,taste);});
      }
      if(category!=='all'||['vocaloid','bilibili'].includes(taste))jobs.push(async()=>{
        const rows=await search(p.related,1,ctx,day,force,deadline);if(rows!==null)group.received=true;
        group.related=(rows||[]).map(normalizeSong).filter(s=>s&&!unwanted(s.name)).map(s=>({...s,taste,familiar:false,reason:p.label+' · '+p.related+' 相关'}));
      });
      jobs.push(async()=>{
        const term=p.lists[batch%p.lists.length],rows=await search(term,1000,ctx,day,force,deadline);if(rows!==null)group.received=true;
        group.lists=(rows||[]).map(raw=>({raw,list:normalizePlaylist(raw)})).filter(x=>x.list)
          .sort((a,b)=>(Number(b.raw.playCount)||0)-(Number(a.raw.playCount)||0)).map(({list})=>({...list,taste,reason:p.label+' · '+term}));
      });
    }
    let index=0;
    await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{while(index<jobs.length){const job=jobs[index++];await job();}}));
    const songs=[],playlists=[],seen=new Set(),fingerprints=new Set(),listIDs=new Set();
    function add(song){if(!song||seen.has(song.id)||fingerprints.has(signature(song)))return false;seen.add(song.id);fingerprints.add(signature(song));songs.push(song);return true;}
    for(const taste of lanes){
      const group=groups.get(taste),quota=category==='all'?({vocaloid:3,bilibili:2}[taste]||1):8;
      // First take a different seed title from each search, not many covers of one song.
      const anchors=group.familiar.map(rows=>rows?.[0]).filter(Boolean),related=group.related.filter(s=>!anchors.some(a=>compact(a.name)===compact(s.name)));
      let added=0;const familiarQuota=quota>2?quota-1:quota;
      for(const song of anchors){if(added>=familiarQuota)break;if(add(song))added++;}
      for(const song of related){if(added>=quota)break;if(add(song))added++;}
      for(const song of anchors){if(added>=quota)break;if(add(song))added++;}
      for(const list of group.lists){if(!listIDs.has(list.id)){listIDs.add(list.id);playlists.push(list);break;}}
    }
    if(!songs.length&&!playlists.length)throw Error('暂未取得匹配口味的歌曲');
    return {version:VERSION,settingsKey:ctx.key,day,batch,songs,playlists,fetchedAt:now(),partial:[...groups.values()].some(g=>!g.received)};
  }
  async function get(options={}){
    const {category='all',batch=0,force=false,excludeIds=[]}=options;
    if(!Object.hasOwn(CATEGORIES,category))throw Error('推荐分类无效');
    if(!Number.isInteger(batch)||batch<0||batch>10000)throw Error('推荐批次无效');
    if(!Array.isArray(excludeIds)||excludeIds.length>1000||excludeIds.some(id=>!/^\d{1,20}$/.test(String(id))))throw Error('忽略歌曲列表无效');
    const day=dayStamp(now()),ctx=context(),stored=read()['taste:'+category];
    let data=stored?.version===VERSION&&stored.settingsKey===ctx.key&&Array.isArray(stored.songs)&&Array.isArray(stored.playlists)?stored:null,offline=false;
    if(force||!data||data.day!==day||data.batch!==batch){
      const key=ctx.key+'|'+day+'|'+category+'|'+batch;
      if(!pending.has(key))pending.set(key,build(category,batch,day,ctx,force).then(value=>{
        if(context().key===ctx.key){read()['taste:'+category]=value;try{writeJSONAtomic(getFile(),saved);}catch{}}
        return value;
      }).finally(()=>pending.delete(key)));
      try{data=await pending.get(key);}catch{offline=true;}
    }
    const excluded=new Set(excludeIds.map(String));
    return {ok:!!data,category,label:CATEGORIES[category],personalized:false,tasteBased:true,requestedDay:day,day:data?.day||day,offline,partial:!!data?.partial,
      songs:(data?.songs||[]).filter(s=>!excluded.has(s.id)),playlists:data?.playlists||[],poolSize:data?.songs?.length||0,fetchedAt:data?.fetchedAt,
      message:offline?(data?`当前展示 ${data.day} 的缓存选曲；新一批暂未取得。`:'暂时找不到匹配口味的歌曲，请重试或搜索；不会用陌生大类歌单凑数。'):
        '按术力口、二创、粤语、电音与华语口味选曲，熟悉优先，搭配少量相关探索。不是平台私人日推或实时B站榜单。'+(data?.partial?' 部分分类暂未取得。':'')};
  }
  const legacy=createDiscoveryService({getFile,getBases,fetchJSON,now});
  return {get,playlist:legacy.playlist};
}
module.exports={createTasteDiscoveryService,PROFILES,CATEGORIES,familiarRows};
