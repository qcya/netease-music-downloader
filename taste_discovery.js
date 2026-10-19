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
  const legacy=createDiscoveryService({getFile,getBases,fetchJSON,now});
  const memo=new Map(),pending=new Map();let saved,serial=Promise.resolve();
  const extra={vocaloid:['DECO*27','ピノキオピー','稲葉曇','いよわ','重音テト','洛天依','Magens','サツキ'],bilibili:['Magens','残像音阶','TheFatRat','鬼畜 remix','二创 小曲'],cantonese:['陈奕迅','李克勤','张国荣','陈慧娴','许冠杰'],electronic:['TheFatRat','Avicii','K-391','Marshmello','Martin Garrix'],chinese:['陈粒','周杰伦','张芸京','许嵩','薛之谦']};
  const actualBases=()=>{const v=getBases();return Array.isArray(v)&&v.length?v.slice(0,3):DEFAULT_BASES;};
  function read(){if(saved)return saved;try{const v=readJSON(getFile(),{});saved=v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{saved={};}return saved;}
  function store(ctx){
    const root=read();const old=root.tastePoolV2;
    if(old?.version===2&&old.key===ctx.key&&old.pools&&typeof old.pools==='object')return old;
    return {version:2,key:ctx.key,pools:{},recent:[],last:{}};
  }
  function persist(data,ctx){if(JSON.stringify(actualBases())!==ctx.key)return;read().tastePoolV2=data;try{writeJSONAtomic(getFile(),saved);}catch{}}
  async function search(term,type,offset,ctx,deadline){
    const key=JSON.stringify([ctx.key,term,type,offset]),old=memo.get(key);
    if(old&&now()-old.time<300000)return old.rows;
    for(const base of ctx.bases){
      if(Date.now()>=deadline)break;
      try{
        const direct=base.replace(/\/+$/,'')==='https://music.163.com/api';
        const args=new URLSearchParams({[direct?'s':'keywords']:term,type:String(type),limit:type===1?'60':'8',offset:String(offset)});
        const url=base.replace(/\/+$/,'')+(direct?(type===1?'/cloudsearch/pc':'/search/get'):'/search')+(direct?'':'?'+args);
        const options={credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(5000,deadline-Date.now()))),
          ...(direct?{method:'POST',body:args.toString(),headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':'https://music.163.com/'}}:{})};
        const d=await fetchJSON(url,options);if(d?.code&&d.code!==200)continue;
        const rows=d?.result?.[type===1?'songs':'playlists'];if(!Array.isArray(rows))continue;
        memo.set(key,{time:now(),rows:rows.slice(0,type===1?60:8)});while(memo.size>160)memo.delete(memo.keys().next().value);
        return rows;
      }catch{/* A failed search cannot manufacture candidates. */}
    }
    return null;
  }
  async function expand(pool,taste,ctx,deadline){
    const p=PROFILES[taste],round=pool.round||0,terms=[p.related,...extra[taste]],rows=[],lists=[];let received=false;
    const jobs=[];
    // Seed titles only bootstrap the first page. They are not the recommendation catalog.
    if(!pool.seeded){
      const count={vocaloid:3,bilibili:2}[taste]||1;
      for(const anchor of p.seeds.slice(0,count))jobs.push(async()=>{const found=await search(anchor.query,1,0,ctx,deadline);if(found!==null)received=true;rows.push(...familiarRows(found||[],anchor,taste).slice(0,1));});
    }
    const term=terms[round%terms.length],offset=Math.floor(round/terms.length)*60;
    jobs.push(async()=>{const found=await search(term,1,offset,ctx,deadline);if(found!==null)received=true;
      rows.push(...(found||[]).map(normalizeSong).filter(s=>s&&!unwanted(s.name)).map(s=>({...s,taste,familiar:false,sourceRank:2,reason:p.label+' · '+term+' 相关'})));});
    jobs.push(async()=>{const term=p.lists[round%p.lists.length],found=await search(term,1000,Math.floor(round/p.lists.length)*8,ctx,deadline);if(found!==null)received=true;
      lists.push(...(found||[]).map(raw=>({raw,list:normalizePlaylist(raw)})).filter(x=>x.list)
        .sort((a,b)=>(Number(b.raw.playCount)||0)-(Number(a.raw.playCount)||0)).map(x=>({...x.list,taste,reason:p.label+' · '+term})));});
    // Limit global network pressure: lanes run two at a time and each uses two requests at once.
    let index=0;await Promise.all(Array.from({length:Math.min(2,jobs.length)},async()=>{while(index<jobs.length)await jobs[index++]();}));
    const candidates=[...pool.lists,...lists];
    if(candidates.length&&Date.now()<deadline){
      const list=candidates[round%candidates.length],pages=Math.max(1,Math.ceil(list.trackCount/120));
      try{const data=await legacy.playlist(list.id,{limit:120,offset:(Math.floor(round/candidates.length)%pages)*120});
        received=true;rows.push(...data.tracks.filter(s=>!unwanted(s.name)).map(s=>({...s,taste,familiar:false,sourceRank:1,reason:p.label+' · 来自「'+list.name+'」'})));
      }catch{/* Preserve unseen candidates already available in memory. */}
    }
    const seen=new Set(pool.songs.map(s=>s.id)),signatures=new Set(pool.songs.map(signature));
    rows.sort((a,b)=>Number(b.familiar)-Number(a.familiar));
    for(const row of rows){if(seen.has(row.id)||signatures.has(signature(row)))continue;seen.add(row.id);signatures.add(signature(row));pool.songs.push(row);}
    const listIDs=new Set(pool.lists.map(l=>l.id));for(const list of lists)if(!listIDs.has(list.id)){listIDs.add(list.id);pool.lists.push(list);}
    pool.songs.sort((a,b)=>Number(b.familiar)-Number(a.familiar)||(a.sourceRank||0)-(b.sourceRank||0));
    pool.songs=pool.songs.slice(-1600);pool.lists=pool.lists.slice(-48);
    if(received){pool.round=round+1;pool.seeded=true;pool.day=dayStamp(now());}
    return received;
  }
  async function choose(options,ctx){
    const {category='all',batch=0,force=false,excludeIds=[]}=options,day=dayStamp(now()),data=store(ctx),last=data.last[category];
    const excluded=new Set(excludeIds.map(String));
    if(!force&&last?.day===day&&last.batch===batch)return {...last,songs:last.songs.filter(s=>!excluded.has(s.id)),fromPool:true};
    data.recent=Array.isArray(data.recent)?data.recent.slice(-2000):[];
    const seen=new Set(data.recent.map(x=>x.id)),seenNames=new Set(data.recent.map(x=>x.signature));
    const lanes=category==='all'?Object.keys(PROFILES):[category],quota=taste=>category==='all'?({vocaloid:3,bilibili:2}[taste]||1):8;
    const fresh=s=>!seen.has(s.id)&&!excluded.has(s.id)&&!seenNames.has(signature(s));
    let tried=false,received=false;
    const jobs=lanes.map(taste=>async()=>{
      const pool=data.pools[taste]??={songs:[],lists:[],round:0,seeded:false};
      if(pool.songs.filter(fresh).length<quota(taste)||pool.day!==day){
        tried=true;const deadline=Date.now()+20000;
        // At most two expansions per refresh. Exhaustion is visible, never a hidden seed loop.
        for(let attempt=0;attempt<2;attempt++){
          const ok=await expand(pool,taste,ctx,deadline);received=received||ok;
          if(!ok||pool.songs.filter(fresh).length>=quota(taste)||Date.now()>=deadline)break;
        }
      }
    });
    let index=0;await Promise.all(Array.from({length:Math.min(2,jobs.length)},async()=>{while(index<jobs.length)await jobs[index++]();}));
    if(tried&&!received&&last?.day!==day){
      if(last)return {...last,offline:true,requestedDay:day,message:`当前展示 ${last.day} 的缓存选曲；新一批未取得。`};
      return {ok:false,category,day,requestedDay:day,offline:true,songs:[],playlists:[],poolSize:0,message:'暂时连不上匹配口味的曲库。请重试或听本地音乐。'};
    }
    const songs=[],playlists=[],listIDs=new Set();
    function add(s){if(!fresh(s))return false;songs.push(s);seen.add(s.id);seenNames.add(signature(s));return true;}
    for(const taste of lanes){
      const pool=data.pools[taste];let added=0;
      for(const s of pool.songs){if(added>=quota(taste))break;if(add(s))added++;}
      const start=(batch%Math.max(1,pool.lists.length));
      const list=pool.lists[start];if(list&&!listIDs.has(list.id)){listIDs.add(list.id);playlists.push(list);}
    }
    // Fill a temporarily short lane from other expressed tastes, never unrelated global charts.
    for(const taste of lanes)for(const s of data.pools[taste].songs){if(songs.length>=8)break;add(s);}
    const poolSize=new Set(lanes.flatMap(t=>data.pools[t].songs.map(s=>s.id))).size;
    const result={ok:!!(songs.length||playlists.length),category,label:CATEGORIES[category],personalized:false,tasteBased:true,day,requestedDay:day,batch,
      songs,playlists,poolSize,seenCount:data.recent.length+songs.length,fetchedAt:now(),offline:tried&&!received,exhausted:songs.length<8,
      message:songs.length<8?'当前没有更多未展示的匹配歌曲；不会把看过的歌换个顺序冒充新推荐。可稍后重试或切换分类。':'从匹配歌手与相关歌单扩充候选池，本批避开最近展示的歌曲。不是私人日推或实时B站榜。'};
    if(result.offline)result.message='曲库暂时连接失败；本批来自之前保存的候选池。';
    data.recent.push(...songs.map(s=>({id:s.id,signature:signature(s)})));data.recent=data.recent.slice(-2000);
    data.last[category]=result;persist(data,ctx);return result;
  }
  async function get(options={}){
    const {category='all',batch=0,excludeIds=[]}=options;
    if(!Object.hasOwn(CATEGORIES,category))throw Error('推荐分类无效');
    if(!Number.isInteger(batch)||batch<0||batch>10000)throw Error('推荐批次无效');
    if(!Array.isArray(excludeIds)||excludeIds.length>1000||excludeIds.some(id=>!/^\d{1,20}$/.test(String(id))))throw Error('忽略歌曲列表无效');
    const bases=actualBases(),ctx={bases,key:JSON.stringify(bases)},key=JSON.stringify([ctx.key,options]);
    if(pending.has(key))return pending.get(key);
    const task=serial.then(()=>choose(options,ctx)).finally(()=>pending.delete(key));serial=task.catch(()=>{});pending.set(key,task);return task;
  }
  return {get,playlist:legacy.playlist};
}
module.exports={createTasteDiscoveryService,PROFILES,CATEGORIES,familiarRows};
