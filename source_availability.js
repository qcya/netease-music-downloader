'use strict';
// Short-lived metadata only. Never fetches, buffers or saves audio bytes.
function createSourceAvailability({json, getBases, trusted, now=Date.now}) {
  const cache=new Map(),pending=new Map();
  const validID=value=>{const id=String(value);if(!/^\d{1,20}$/.test(id))throw Error('无效歌曲 ID');return id;};
  function context(){const bases=getBases();return {bases,key:JSON.stringify(bases)};}
  function remember(key,row){
    cache.set(key,row);while(cache.size>256)cache.delete(cache.keys().next().value);return row;
  }
  async function lookup(ids,ctx,signal){
    const result=new Map(ids.map(id=>[id,{id,state:'unknown',reason:'音源检测失败，可重试',checkedAt:now()}]));
    const endpoints=ctx.bases.length?ctx.bases.map(b=>b.replace(/\/$/,'')+'/song/url/v1?id='+ids.join(',')+'&level=standard'):
      ['https://music.163.com/api/song/enhance/player/url?ids='+encodeURIComponent('['+ids.join(',')+']')+'&br=128000'];
    for(const endpoint of endpoints){
      if(signal?.aborted)throw Error('已切换歌曲');
      try{
        const data=await json(endpoint,signal);if(data?.code&&data.code!==200||!Array.isArray(data?.data))continue;
        for(const id of ids){
          if(result.get(id).state==='available')continue;
          const row=data.data.find(x=>x&&(String(x.id)===id||ids.length===1&&!x.id));if(!row)continue;
          let url=row.url;
          if(typeof url==='string'&&url.startsWith('http://')){
            try{if(/(^|\.)music\.126\.net$/.test(new URL(url).hostname))url=url.replace(/^http:/,'https:');}catch{url=null;}
          }
          const trial=!!row.freeTrialInfo||!!row.trialInfo||row.freeTrialPrivilege?.resConsumable===true&&row.freeTrialPrivilege?.userConsumable===false;
          const available=!trial&&trusted(url);
          result.set(id,{id,state:available?'available':'unavailable',reason:available?'当前接口提供完整音源':trial?'仅提供试听片段':'暂无完整在线播放音源',checkedAt:now(),...(available?{url}:{}),ttl:available?Math.min(120000,Math.max(1000,Number(row.expi||180)*1000-30000)):60000});
        }
      }catch(e){if(signal?.aborted)throw e;}
      if([...result.values()].every(x=>x.state==='available'))break;
    }
    const rows=[...result.values()];
    if(context().key===ctx.key&&!signal?.aborted)for(const row of rows)remember(ctx.key+':'+row.id,{...row,expiresAt:now()+(row.ttl||5000)});
    return rows;
  }
  async function get(ids,{force=false,signal}={}){
    if(!Array.isArray(ids)||ids.length>40)throw Error('每次最多检测 40 首歌曲');
    const unique=[...new Set(ids.map(validID))],ctx=context(),missing=[],found=new Map();
    for(const id of unique){const hit=cache.get(ctx.key+':'+id);if(!force&&hit&&hit.expiresAt>now())found.set(id,hit);else missing.push(id);}
    if(missing.length){
      const key=ctx.key+':'+[...missing].sort().join(',');let rows;
      // Playback owns its own abort signal; card probes never cancel the player.
      if(signal)rows=await lookup(missing,ctx,signal);
      else {
        if(!pending.has(key))pending.set(key,lookup(missing,ctx).finally(()=>pending.delete(key)));
        rows=await pending.get(key);
      }
      for(const row of rows)found.set(row.id,row);
    }
    return unique.map(id=>found.get(id));
  }
  return {
    async resolve(id,signal){return (await get([id],{signal}))[0];},
    async check(ids,options){return (await get(ids,options)).map(({id,state,reason,checkedAt})=>({id,state,reason,checkedAt}));},
    clear(){cache.clear();}
  };
}
module.exports={createSourceAvailability};
