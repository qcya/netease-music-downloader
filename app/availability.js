'use strict';
(function(root){
  function create({document:doc,bridge,notify=()=>{}}){
    const states=new Map(),bindings=new Map(),queued=new Map();let timer=null,busy=false;
    const valid=id=>/^\d{1,20}$/.test(id);
    const observer=typeof root.IntersectionObserver==='function'?new root.IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){const id=entry.target.dataset.streamId;request(id);}
    },{rootMargin:'120px'}):null;
    function prune(){for(const [id,set] of bindings){for(const b of set)if(!b.host.isConnected){observer?.unobserve(b.host);set.delete(b);}if(!set.size){bindings.delete(id);queued.delete(id);if(states.get(id)?.state==='checking')states.delete(id);}}}
    function paint(b){
      const value=states.get(b.id)||{state:'checking'},host=b.host;host.replaceChildren();host.dataset.availability=value.state;
      if(value.state==='available'){
        const button=doc.createElement('button');button.type='button';button.className=b.className;button.textContent='在线播放';
        button.title='在线播放，不保存音频';button.setAttribute('aria-label','在线播放 '+(b.song.name||''));
        button.onclick=async()=>{
          button.disabled=true;button.textContent='准备中…';
          try{const started=await b.onPlay();if(started===false)failed(b.id);}
          catch(e){failed(b.id);notify(e.message||String(e),true);}
          finally{if(host.isConnected)paint(b);}
        };
        host.append(button);return;
      }
      const label=doc.createElement('span');label.className='stream-status';label.textContent=value.state==='unavailable'?'暂不可播':value.state==='checking'?'检查音源…':'未确认音源';
      label.title=value.reason||'确认完整音源后才显示在线播放按钮';host.append(label);
      if(value.state==='unknown'){
        const retry=doc.createElement('button');retry.type='button';retry.className='stream-retry';retry.textContent='重试检测';
        retry.onclick=()=>request(b.id,true);host.append(retry);
      }
    }
    function update(id,value){states.set(id,{...value,expiresAt:Date.now()+(value.state==='available'?90000:value.state==='unavailable'?45000:5000)});for(const b of bindings.get(id)||[])if(b.host.isConnected)paint(b);}
    function request(id,force=false){
      if(!valid(id))return;
      const known=states.get(id);if(!force&&known&&(known.state==='checking'||known.expiresAt>Date.now()))return;
      queued.set(id,!!force||queued.get(id)===true);update(id,{state:'checking'});
      if(!timer)timer=setTimeout(flush,30);
    }
    async function flush(){
      timer=null;if(busy)return;
      prune();const ids=[...queued.keys()].filter(id=>bindings.has(id)).slice(0,40);
      if(!ids.length){queued.clear();return;}
      const expected=new Map(ids.map(id=>[id,states.get(id)]));const force=ids.some(id=>queued.get(id));for(const id of ids)queued.delete(id);busy=true;
      try{
        const rows=await bridge.mediaAvailability(ids,{force});
        for(const id of ids){if(states.get(id)!==expected.get(id))continue;const row=Array.isArray(rows)?rows.find(x=>String(x.id)===id):null;update(id,row&&['available','unavailable','unknown'].includes(row.state)?row:{state:'unknown',reason:'音源检测未返回结果'});}
      }catch{for(const id of ids)if(states.get(id)===expected.get(id))update(id,{state:'unknown',reason:'网络检测失败，不代表歌曲一定不能播'});}
      finally{busy=false;if(queued.size&&!timer)timer=setTimeout(flush,30);}
    }
    function bind(host,song,{onPlay,className='online-play'}={}){
      const id=String(song.id||''),b={host,id,song,onPlay,className};host.classList.add('stream-availability');host.dataset.streamId=id;
      if(!valid(id)){host.textContent='歌曲 ID 无效';return;}
      if(!bindings.has(id))bindings.set(id,new Set());bindings.get(id).add(b);paint(b);
      if(observer)observer.observe(host);else setTimeout(()=>{if(host.isConnected)request(id);},0);
    }
    function failed(id){if(id!=null)update(String(id),{state:'unknown',reason:'播放失败，可重新检查当前音源'});}
    function refresh(){prune();states.clear();for(const [id,set] of bindings){for(const b of set)paint(b);if([...set].some(b=>b.host.getClientRects().length))request(id,true);}}
    doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible'){prune();for(const [id,set] of bindings)if([...set].some(b=>b.host.getClientRects().length))request(id);}});
    return {bind,failed,refresh,state:id=>states.get(String(id))?.state||'unknown'};
  }
  root.MusicAvailability={create};
})(window);
