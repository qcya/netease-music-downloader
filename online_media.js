'use strict';
// Audio passes directly from the network reader to Chromium. This module has no
// filesystem dependency, full-file buffer, download fallback or durable URL cache.
const {randomUUID}=require('node:crypto');
const OFFICIAL='https://music.163.com';
const idOf=value=>{const id=String(value);if(!/^\d{1,20}$/.test(id))throw Error('无效歌曲 ID');return id;};
function createOnlineMedia({fetchImpl=globalThis.fetch,getBases=()=>[],timeoutMs=12000}={}){
 let revision=0,current=null,resolving=null;
 const lyricCache=new Map(),lyricPending=new Map();
 const bases=()=>getBases().filter(v=>{try{const u=new URL(v);return !u.username&&!u.password&&(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)));}catch{return false;}}).slice(0,4);
 function trusted(value){
  try{const u=new URL(value);if(u.username||u.password)return false;
   if(u.protocol==='https:'&&/(^|\.)(music\.126\.net|music\.163\.com)$/.test(u.hostname))return true;
   // Loopback media is permitted only for an explicitly configured local API.
   return bases().some(b=>new URL(b).origin===u.origin)&&['localhost','127.0.0.1'].includes(u.hostname);
  }catch{return false;}
 }
 function stop(){revision++;resolving?.abort();resolving=null;if(current){for(const c of current.controllers)c.abort();current=null;}}
 async function json(url,signal){
  const r=await fetchImpl(url,{signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(timeoutMs)]),cache:'no-store',credentials:'omit',redirect:'error',headers:{Accept:'application/json'}});
  if(!r.ok){void r.body?.cancel();throw Error('HTTP '+r.status);}
  const reader=r.body.getReader();let length=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2*1024*1024)throw Error('元数据响应过大');chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  finally{void reader.cancel().catch(()=>{});}
 }
 async function open(id){
  const sid=idOf(id);stop();const serial=revision,control=new AbortController();resolving=control;
  const configured=bases();
  const endpoints=configured.length?configured.map(b=>b.replace(/\/$/,'')+'/song/url/v1?id='+sid+'&level=standard'):[OFFICIAL+'/api/song/enhance/player/url?ids='+encodeURIComponent('['+sid+']')+'&br=128000'];
  let chosen=null;
  try{
   for(const endpoint of endpoints){
    if(control.signal.aborted)throw Error('已切换歌曲');
    try{const data=await json(endpoint,control.signal),row=data?.data?.find(x=>x&&(!x.id||String(x.id)===sid));
     if(row?.freeTrialInfo||row?.freeTrialPrivilege?.resConsumable===true&&row?.freeTrialPrivilege?.userConsumable===false)continue;
     let uri=row?.url;
     if(typeof uri==='string'&&uri.startsWith('http://')&&/(^|\.)music\.126\.net$/.test(new URL(uri).hostname))uri=uri.replace(/^http:/,'https:');
     if(trusted(uri)){chosen={url:uri,id:sid};break;}
    }catch(e){if(control.signal.aborted)throw e;}
   }
   if(serial!==revision||control.signal.aborted)throw Error('已切换歌曲');
   if(!chosen)throw Error('这首歌暂无可用的完整在线播放音源（可能需要权限或接口不可用），不会自动下载或缓存。');
   const token=randomUUID();current={...chosen,token,controllers:new Set()};
   return {ok:true,id:sid,url:'music-preview://audio/'+token,streaming:true,fromCache:false};
  }finally{if(resolving===control)resolving=null;}
 }
 function isAudio(bytes){
  const b=Buffer.from(bytes);return b.subarray(0,3).toString()==='ID3'||b.subarray(0,4).toString()==='OggS'||b.subarray(0,4).toString()==='fLaC'||(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WAVE')||b.subarray(4,8).toString()==='ftyp'||(b[0]===255&&(b[1]&224)===224);
 }
 async function handle(req){
  let token;try{const u=new URL(req.url);if(u.hostname!=='audio')return new Response(null,{status:404});token=u.pathname.slice(1);}catch{return new Response(null,{status:400});}
  const track=current;if(!track||track.token!==token)return new Response(null,{status:404});
  if(!['GET','HEAD'].includes(req.method))return new Response(null,{status:405});
  const range=req.headers.get('range');if(range&&!/^bytes=(?:\d+-\d*|-\d+)$/.test(range))return new Response(null,{status:400});
  const c=new AbortController();track.controllers.add(c);
  const abort=()=>c.abort();req.signal.addEventListener('abort',abort,{once:true});if(req.signal.aborted)c.abort();
  const clean=()=>{track.controllers.delete(c);req.signal.removeEventListener('abort',abort);};
  let reader=null,streaming=false;
  async function timed(fn){const timer=setTimeout(()=>c.abort(),timeoutMs);try{return await fn();}finally{clearTimeout(timer);}}
  try{
   let uri=track.url,r;
   for(let hops=0;hops<5;hops++){
    if(!trusted(uri))return new Response('Unsupported audio host',{status:403});
    const headers={'Accept-Encoding':'identity'};if(range)headers.Range=range;
    r=await timed(()=>fetchImpl(uri,{method:req.method,headers,redirect:'manual',signal:c.signal,cache:'no-store',credentials:'omit'}));
    if([301,302,303,307,308].includes(r.status)){const location=r.headers.get('location');void r.body?.cancel();if(!location)return new Response(null,{status:502});uri=new URL(location,uri).href;continue;}break;
   }
   if(!r?.ok){void r?.body?.cancel();return new Response(null,{status:r?.status===416?416:502});}
   const mime=(r.headers.get('content-type')||'').split(';')[0].toLowerCase();
   if(!/^(audio\/(mpeg|mp3|wav|x-wav|wave|flac|ogg|mp4|aac)|application\/octet-stream)$/.test(mime)){void r.body?.cancel();return new Response('Not audio',{status:415});}
   const headers={'Content-Type':mime,'Cache-Control':'no-store'};
   for(const key of ['content-length','content-range','accept-ranges']){const v=r.headers.get(key);if(v)headers[key]=v;}
   if(r.status===206&&!/^bytes \d+-\d+\/\d+$/.test(headers['content-range']||'')){void r.body?.cancel();return new Response(null,{status:502});}
   if(req.method==='HEAD'){void r.body?.cancel();return new Response(null,{status:r.status,headers});}
   reader=r.body.getReader();
   // Read only enough for a signature, never the complete audio file.
   const first=await timed(()=>reader.read());
   const beginsAtZero=r.status!==206||/^bytes 0-/.test(headers['content-range']||'');
   let chunk=first.value;
   if(beginsAtZero&&!first.done){while(chunk.length<16){const next=await timed(()=>reader.read());if(next.done)break;chunk=Buffer.concat([chunk,next.value]);}if(!isAudio(chunk)){void reader.cancel();return new Response('Invalid audio content',{status:415});}}
   if(first.done)return new Response(null,{status:502});
   let initial=chunk;
   const body=new ReadableStream({
    async pull(controller){
     try{if(c.signal.aborted)throw Error('播放已取消');if(initial){controller.enqueue(initial);initial=null;return;}
      const part=await timed(()=>reader.read());if(part.done){controller.close();clean();}else controller.enqueue(part.value);
     }catch(e){controller.error(e);c.abort();clean();void reader.cancel().catch(()=>{});}
    },
    cancel(){c.abort();clean();return reader.cancel().catch(()=>{});}
   },{highWaterMark:0});
   streaming=true;return new Response(body,{status:r.status,headers});
  }catch(e){c.abort();return new Response(null,{status:502});}
  finally{if(!streaming){clean();void reader?.cancel().catch(()=>{});}}
 }
 async function lyrics(id){
  const sid=idOf(id),configured=bases(),key=JSON.stringify(configured)+':'+sid;
  if(lyricCache.has(key))return {...lyricCache.get(key),fromMemory:true};
  if(lyricPending.has(key))return lyricPending.get(key);
  const task=(async()=>{
   const endpoints=configured.length?configured.flatMap(b=>['/lyric/new?id=','/lyric?id='].map(p=>b.replace(/\/$/,'')+p+sid)):[OFFICIAL+'/api/song/lyric?id='+sid+'&lv=-1&kv=-1&tv=-1'];
   let received=false;
   for(const endpoint of endpoints){try{const data=await json(endpoint);if(data.code!==200)continue;received=true;
    const lrc=typeof data.lrc?.lyric==='string'?data.lrc.lyric:'',translated_lrc=typeof data.tlyric?.lyric==='string'?data.tlyric.lyric:'';
    if(lrc.trim()){const out={id:sid,found:true,lrc,translated_lrc,fromMemory:true};lyricCache.set(key,out);if(lyricCache.size>64)lyricCache.delete(lyricCache.keys().next().value);return out;}
   }catch{}}
   if(!received)throw Error('歌词接口暂时不可用，请重试');
   return {id:sid,found:false,lrc:'',translated_lrc:'',fromMemory:true};
  })();lyricPending.set(key,task);try{return await task;}finally{lyricPending.delete(key);}
 }
 return {open,handle,lyrics,stop,close(){stop();lyricCache.clear();},currentURL:()=>current?'music-preview://audio/'+current.token:null};
}
module.exports={createOnlineMedia};
