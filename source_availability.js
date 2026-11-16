'use strict';
const QUALITY_LEVELS=['standard','higher','exhigh','lossless','hires'];
function normalizeQuality(value='standard'){
  if(!QUALITY_LEVELS.includes(value))throw Error('无效音质');return value;
}
function qualityMetadata(row,requestedQuality){
  const type=String(row.type||row.encodeType||'').toLowerCase(),bitrate=Number(row.br||row.bitrate)||null;
  // A requested level is not evidence of the format actually returned.
  const lossless=type==='flac'||type==='alac';
  let actualQuality=null;
  if(lossless)actualQuality=row.level==='hires'?'hires':'lossless';
  else if(bitrate>0)actualQuality=bitrate<=128000?'standard':bitrate<=192000?'higher':'exhigh';
  else if(['standard','higher','exhigh'].includes(row.level))actualQuality=row.level;
  return {requestedQuality,actualQuality,lossless,bitrate,format:type||null,qualityFallback:actualQuality!==requestedQuality};
}
// Short-lived metadata only. Never fetches, buffers or saves audio bytes.
function createSourceAvailability({json, getBases, trusted, now=Date.now, getAuthState=()=>({enabled:false,revision:0}), authLookup=null}) {
  const cache=new Map(),pending=new Map();
  const validID=value=>{const id=String(value);if(!/^\d{1,20}$/.test(id))throw Error('无效歌曲 ID');return id;};
  function context(){const bases=getBases(),auth=getAuthState();return {bases,auth,key:JSON.stringify([bases,!!auth?.enabled,auth?.revision||0])};}
  function remember(key,row){
    cache.set(key,row);while(cache.size>256)cache.delete(cache.keys().next().value);return row;
  }
  async function lookup(ids,ctx,signal,extended=false,quality='standard'){
    const result=new Map(ids.map(id=>[id,{id,state:'unknown',reason:'音源检测失败，可重试',checkedAt:now()}]));
    function apply(id,row){
      if(!row)return;
      let url=row.url;
      if(typeof url==='string'&&url.startsWith('http://')){try{if(/(^|\.)music\.126\.net$/.test(new URL(url).hostname))url=url.replace(/^http:/,'https:');}catch{url=null;}}
      const trial=!!row.freeTrialInfo||!!row.trialInfo||row.freeTrialPrivilege?.resConsumable===true&&row.freeTrialPrivilege?.userConsumable===false;
      const available=!trial&&trusted(url),trialAvailable=trial&&trusted(url),segment=row.freeTrialInfo||row.trialInfo;
      const span=segment?Number(segment.end)-Number(segment.start):0;
      const trialSeconds=Number.isFinite(span)&&span>0?Math.min(600,span<=600?span:span/1000):0;
      const metadata=qualityMetadata(row,quality),previous=result.get(id);
      if(previous.state==='available'&&(!available||previous.actualQuality===quality||metadata.actualQuality!==quality))return;
      if(result.get(id).trialAvailable&&!available&&!trialAvailable)return;
      result.set(id,{id,state:available?'available':'unavailable',reason:available?'当前接口提供完整音源':trialAvailable?'仅提供试听片段':trial?'接口标记有试听权限，但未提供可播放地址':'当前在线播放接口未返回可用地址（不代表无法下载）',checkedAt:now(),...(available?{url}:{}),ttl:available?Math.min(120000,Math.max(1000,Number(row.expi||180)*1000-30000)):60000});
      if(trialAvailable)Object.assign(result.get(id),{trialAvailable:true,trialUrl:url,trialSeconds});
      Object.assign(result.get(id),metadata);
    }
    const levels=quality==='standard'?(extended?QUALITY_LEVELS:['standard']):[quality,...QUALITY_LEVELS.slice(0,QUALITY_LEVELS.indexOf(quality)).reverse()];
    for(const [index,level] of levels.entries()){
     const satisfied=id=>result.get(id).state==='available'&&(quality==='standard'||index>0||result.get(id).actualQuality===quality);
     if(ctx.auth?.enabled&&typeof authLookup==='function'){
      let cursor=0;const workers=Array.from({length:Math.min(3,ids.length)},async()=>{while(cursor<ids.length){const id=ids[cursor++];if(satisfied(id))continue;if(signal?.aborted)throw Error('已切换歌曲');try{const data=await authLookup(id,level,signal);if(data?.code&&data.code!==200||!Array.isArray(data?.data))continue;apply(id,data.data.find(x=>x&&String(x.id)===id));}catch(e){if(signal?.aborted)throw e;}}});
      await Promise.all(workers);if(context().key!==ctx.key)throw Error('账号状态已变化，请重试');
     }
     const endpoints=ctx.bases.map(b=>b.replace(/\/$/,'')+'/song/url/v1?id='+ids.join(',')+'&level='+level);
     if(level==='standard')endpoints.push('https://music.163.com/api/song/enhance/player/url?ids='+encodeURIComponent('['+ids.join(',')+']')+'&br=128000');
     for(const endpoint of endpoints){
      if(ids.every(satisfied))break;
      if(signal?.aborted)throw Error('已切换歌曲');
      try{
        const data=await json(endpoint,signal);if(data?.code&&data.code!==200||!Array.isArray(data?.data))continue;
        for(const id of ids){
          if(satisfied(id))continue;
          const row=data.data.find(x=>x&&(String(x.id)===id||ids.length===1&&!x.id));if(!row)continue;
          apply(id,row);
        }
      }catch(e){if(signal?.aborted)throw e;}
     }
     if([...result.values()].every(x=>x.state==='available'))break;
    }
    if(context().key!==ctx.key)throw Error('账号状态已变化，请重试');
    const rows=[...result.values()];
    if(context().key===ctx.key&&!signal?.aborted)for(const row of rows)remember(ctx.key+':'+quality+':'+row.id,{...row,expiresAt:now()+(row.ttl||5000)});
    return rows;
  }
  async function get(ids,{force=false,signal,quality='standard'}={}){
    quality=normalizeQuality(quality);
    if(!Array.isArray(ids)||ids.length>40)throw Error('每次最多检测 40 首歌曲');
    const unique=[...new Set(ids.map(validID))],ctx=context(),missing=[],found=new Map();
    for(const id of unique){const hit=cache.get(ctx.key+':'+quality+':'+id);if(!force&&hit&&hit.expiresAt>now())found.set(id,hit);else missing.push(id);}
    if(missing.length){
      const key=ctx.key+':'+quality+':'+force+':'+[...missing].sort().join(',');let rows;
      // Playback owns its own abort signal; card probes never cancel the player.
      if(signal)rows=await lookup(missing,ctx,signal,force,quality);
      else {
        if(!pending.has(key))pending.set(key,lookup(missing,ctx,undefined,force,quality).finally(()=>pending.delete(key)));
        rows=await pending.get(key);
      }
      for(const row of rows)found.set(row.id,row);
    }
    return unique.map(id=>found.get(id));
  }
  return {
    async resolve(id,signal,{quality='standard'}={}){return (await get([id],{signal,force:true,quality}))[0];},
    async check(ids,options){return (await get(ids,options)).map(({id,state,reason,checkedAt,trialAvailable,trialSeconds})=>({id,state,reason,checkedAt,...(trialAvailable?{trialAvailable,trialSeconds}:{})}));},
    clear(){cache.clear();}
  };
}
module.exports={createSourceAvailability,normalizeQuality,qualityMetadata};
