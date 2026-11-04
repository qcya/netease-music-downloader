'use strict';
const fs=require('node:fs');
function safeCoverURL(value){
 try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||!/(^|\.)music\.(126|163)\.net$/i.test(url.hostname))return '';url.protocol='https:';return url.href;}catch{return '';}
}
function normalized(value){return typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase():'';}
function lookupTerms(name,metadata={}){
 let title=typeof metadata.title==='string'?metadata.title.trim():'',artist=typeof metadata.artist==='string'?metadata.artist.trim():'';
 if(!title||!artist){
  const stem=name.replace(/^\[歌单\]\s*/,'').replace(/\s*\[\d+\](?=\.[^.]+$)/,'').replace(/\.[^.]+$/,'');
  const at=stem.indexOf(' - ');if(at<0)return null;
  const fromTitle=stem.slice(0,at).trim(),fromArtist=stem.slice(at+3).trim();
  if(!fromTitle||!fromArtist||title&&normalized(title)!==normalized(fromTitle)||artist&&normalized(artist)!==normalized(fromArtist))return null;
  title=title||fromTitle;artist=artist||fromArtist;
 }
 return title&&artist&&title.length<=200&&artist.length<=200?{title,artist}:null;
}
function matchingSong(songs,title,artist){
 if(!Array.isArray(songs)||!normalized(title)||!normalized(artist))return null;
 const matches=new Map();
 for(const song of songs){
  const performers=song?.artists||song?.ar;if(!Array.isArray(performers)||!performers.length)continue;
  const namesList=performers.map(a=>typeof a==='object'?a?.name:a);if(namesList.some(a=>typeof a!=='string'||!a.trim()))continue;const names=namesList.join('/');
  const id=String(song.id||'');if(!/^\d{1,20}$/.test(id)||normalized(song.name)!==normalized(title)||normalized(names)!==normalized(artist))continue;
  const cover=safeCoverURL(song.album?.picUrl||song.al?.picUrl||'');if(!matches.has(id)||cover)matches.set(id,cover);
 }
 if(matches.size!==1)return null;const [id,cover]=matches.entries().next().value;return {id,cover};
}
function matchingCover(songs,title,artist){return matchingSong(songs,title,artist)?.cover||'';}
function createLocalCovers({resolve,readEmbedded,fetchDetails,fetchSearch,now=Date.now}){
 const cache=new Map(),ids=new Map(),inflight=new Map(),negativeUntil=new Map(),waiting=[];let active=0;
 const bounded=fn=>new Promise((resolve,reject)=>{waiting.push({fn,resolve,reject});pump();});
 function pump(){while(active<3&&waiting.length){const item=waiting.shift();active++;Promise.resolve().then(item.fn).then(item.resolve,item.reject).finally(()=>{active--;pump();});}}
 let bytes=0;
 function remember(key,value){
  if(cache.has(key))bytes-=cache.get(key).length;
  if(value)negativeUntil.delete(key);else negativeUntil.set(key,now()+5*60*1000);
  cache.delete(key);cache.set(key,value);bytes+=value.length;
  while(cache.size>600||bytes>32*1024*1024){const first=cache.keys().next().value;bytes-=cache.get(first).length;cache.delete(first);negativeUntil.delete(first);ids.delete(first);}
 }
 function cached(key){if(cache.has(key)&&negativeUntil.has(key)&&now()>=negativeUntil.get(key)){bytes-=cache.get(key).length;cache.delete(key);negativeUntil.delete(key);}return cache.has(key);}
 function idCached(key){const row=ids.get(key);if(row&&row.until&&now()>=row.until){ids.delete(key);return false;}return ids.has(key);}
 function rememberId(key,id){ids.set(key,{id,until:id?0:now()+5*60*1000});}
 async function get(names){
  if(!Array.isArray(names)||names.length>4||names.some(n=>typeof n!=='string'||!n||n.length>400))throw Error('每次最多读取 4 首本地歌曲封面');
  const rows=await Promise.all(names.map(async name=>{
   try{const file=resolve(name),stat=await fs.promises.stat(file);return {name,file,key:file+'\0'+stat.size+'\0'+stat.mtimeMs,fileId:/\[(\d{1,20})\]\.[^.]+$/.exec(name)?.[1]||''};}catch{return {name};}
  }));
  const missing=rows.filter(row=>row.key&&(!cached(row.key)||!row.fileId&&!idCached(row.key)));
  // Identical batches share work; a refresh never reads arbitrary renderer paths.
  const batchKey=missing.map(r=>r.key).join('\n');
  if(missing.length){
   let pending=inflight.get(batchKey);
   if(!pending){pending=(async()=>{
    let embedded;try{embedded=await readEmbedded(missing.map(r=>r.file));}catch{return;}
    const unresolved=[],byName=[];
    for(const [i,row] of missing.entries()){
     const value=embedded[i]?.cover||'';
     if(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)&&value.length<1400000)remember(row.key,value);
     const id=row.fileId||(idCached(row.key)?ids.get(row.key).id:'');
     if(id){if(!cached(row.key))unresolved.push({...row,id});continue;}
     if(idCached(row.key)){if(!cached(row.key))remember(row.key,'');continue;}
     const terms=lookupTerms(row.name,embedded[i]||{});
     if(terms&&fetchSearch)byName.push({...row,...terms});else{rememberId(row.key,'');if(!cached(row.key))remember(row.key,'');}
    }
    if(unresolved.length){
     try{const found=await bounded(()=>fetchDetails([...new Set(unresolved.map(r=>r.id))]));
      for(const row of unresolved){const cover=safeCoverURL(found[row.id]);if(cover)remember(row.key,cover);}
     }catch{} // Retry failures on a later refresh.
    }
    await Promise.all(byName.map(async row=>{
     try{const songs=await bounded(()=>fetchSearch(row.title,row.artist));const found=matchingSong(songs,row.title,row.artist);rememberId(row.key,found?.id||'');if(!cached(row.key))remember(row.key,found?.cover||'');}
     catch{} // A timeout is not a permanent negative result.
    }));
   })().finally(()=>inflight.delete(batchKey));inflight.set(batchKey,pending);}
   await pending;
  }
  return rows.map(row=>({name:row.name,cover:cache.get(row.key)||'',id:row.fileId||(idCached(row.key)?ids.get(row.key).id:'')}));
 }
 return {get};
}
module.exports={createLocalCovers,safeCoverURL,lookupTerms,matchingCover};
