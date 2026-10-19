'use strict';
/** Read metadata beyond the ten-track preview. Never requests or saves audio. */
function createPlaylistReader({getBases,fetchJSON,normalizeSong,now=Date.now}) {
  const cache=new Map(),pending=new Map();
  const valid=id=>/^\d{1,20}$/.test(String(id));
  async function read(id,options={}) {
    if(typeof id!=='string'||!valid(id))throw Error('歌单 ID 无效');
    const limit=options.limit??10000,offset=options.offset??0;
    if(!Number.isInteger(limit)||limit<1||limit>10000||!Number.isInteger(offset)||offset<0||offset>100000)throw Error('歌单分页参数无效');
    const supplied=getBases?.(),bases=Array.isArray(supplied)&&supplied.length?supplied.slice(0,3):['https://music.163.com/api'];
    const key=JSON.stringify([bases,id,offset,limit]);
    const hit=cache.get(key);if(hit&&now()-hit.time<120000)return hit.value;
    if(pending.has(key))return pending.get(key);
    const task=load(id,bases,{limit,offset}).then(value=>{if(!value.possibly_incomplete){cache.set(key,{time:now(),value});while(cache.size>12)cache.delete(cache.keys().next().value);}return value;}).finally(()=>pending.delete(key));
    pending.set(key,task);return task;
  }
  async function load(id,bases,{limit,offset}) {
    const deadline=Date.now()+35000;let best=null;
    for(const base of bases){
      const direct=base.replace(/\/+$/,'')==='https://music.163.com/api';
      let callCount=0;
      async function request(endpoint,params){
        if(Date.now()>=deadline||++callCount>80)return null;
        try{
          const u=new URL(base.replace(/\/+$/,'')+endpoint);if(!['http:','https:'].includes(u.protocol))return null;
          for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));
          const data=await fetchJSON(u.href,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(6000,deadline-Date.now())))});
          return data&&(!data.code||data.code===200)?data:null;
        }catch{return null;}
      }
      let details=await request('/playlist/detail',{id,n:100000,s:0});
      let detail=details?.playlist||details?.result;
      const tracks=new Map(),ids=[];let total=0;
      function absorbDetail(d){
        if(!d||typeof d!=='object')return;
        for(const raw of d.tracks||[]){const s=normalizeSong(raw);if(s)tracks.set(s.id,s);}
        const listed=(d.trackIds||[]).map(x=>String(typeof x==='object'?x.id:x)).filter(valid);
        if(listed.length>ids.length){ids.length=0;ids.push(...new Set(listed));}
        total=Math.max(total,Number(d.trackCount)||0,listed.length,tracks.size);
      }
      absorbDetail(detail);
      // The classic endpoint often only contains a preview. v3/v6 expose its ID catalog.
      if(direct&&total>tracks.size&&ids.length<total){
        for(const endpoint of ['/v6/playlist/detail','/v3/playlist/detail']){
          const d=await request(endpoint,{id,n:100000,s:0});absorbDetail(d?.playlist||d?.result);
          if(ids.length>=total)break;
        }
      }
      if(ids.length){
        const wanted=ids.slice(offset,offset+limit),missing=wanted.filter(x=>!tracks.has(x)),batches=[];
        for(let i=0;i<missing.length;i+=200)batches.push(missing.slice(i,i+200));
        let index=0;
        await Promise.all(Array.from({length:Math.min(3,batches.length)},async()=>{
          while(index<batches.length){
            const batch=batches[index++];
            const d=await request('/song/detail',{ids:direct?JSON.stringify(batch):batch.join(',')});
            for(const raw of d?.songs||[]){const s=normalizeSong(raw);if(s&&batch.includes(s.id))tracks.set(s.id,s);}
            const remaining=batch.filter(x=>!tracks.has(x));
            if(direct&&remaining.length){
              const alternate=await request('/v3/song/detail',{c:JSON.stringify(remaining.map(id=>({id}))),ids:JSON.stringify(remaining)});
              for(const raw of alternate?.songs||[]){const s=normalizeSong(raw);if(s&&remaining.includes(s.id))tracks.set(s.id,s);}
            }
          }
        }));
        const rows=wanted.map(x=>tracks.get(x)).filter(Boolean),target=Math.min(limit,Math.max(0,total-offset));
        const result={tracks:rows,total,source:base+'/playlist/detail',possibly_incomplete:rows.length<target||offset+limit<total,missingCount:Math.max(0,wanted.length-rows.length),loadedCount:rows.length,offset,limit,hasMore:offset+limit<total};
        if(!best||rows.length>best.tracks.length)best=result;
        if(!result.possibly_incomplete||rows.length===target)return result;
      }else if(!direct){
        // Some providers expose all-track pagination but omit the catalog IDs.
        const paged=new Map();let cursor=offset,knownTotal=total,stalled=false;
        while(paged.size<limit&&Date.now()<deadline){
          const d=await request('/playlist/track/all',{id,limit:Math.min(200,limit-paged.size),offset:cursor});
          const raw=Array.isArray(d?.songs)?d.songs:[];
          if(!raw.length)break;
          knownTotal=Math.max(knownTotal,Number(d.total)||0,Number(d.totalCount)||0);
          const before=paged.size;for(const item of raw){const s=normalizeSong(item);if(s)paged.set(s.id,s);}
          cursor+=raw.length;
          if(paged.size===before){stalled=true;break;}
          if(knownTotal&&cursor>=knownTotal)break;
        }
        const rows=[...paged.values()].slice(0,limit),expected=knownTotal||cursor;
        if(rows.length){const result={tracks:rows,total:expected,source:base+'/playlist/track/all',possibly_incomplete:stalled||rows.length<Math.min(limit,Math.max(0,expected-offset))||offset+limit<expected,offset,limit,hasMore:offset+limit<expected};if(!best||rows.length>best.tracks.length)best=result;if(!result.possibly_incomplete)return result;}
      }
      if(!best&&tracks.size){const rows=[...tracks.values()].slice(offset,offset+limit);best={tracks:rows,total,source:base+'/playlist/detail',possibly_incomplete:rows.length<total,offset,limit,hasMore:offset+limit<total};}
      if(best&&!best.possibly_incomplete)return best;
    }
    if(best)return best;
    throw Error('歌单曲目暂未取得，请重试；不会把前十首预览当作完整歌单。');
  }
  return {read};
}
module.exports={createPlaylistReader};
