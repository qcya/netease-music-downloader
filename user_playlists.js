'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {readJSON,writeJSONAtomic}=require('./durable_json');
const {validName}=require('./local_playlist');
function createUserPlaylists({getFile,getFiles,getLegacyCategories,getLegacyPlaylists}){
 const validId=id=>typeof id==='string'&&(id==='default'||/^[0-9a-f-]{36}$/i.test(id));
 function label(v){if(typeof v!=='string'||!v.trim()||v.trim().length>32||/[\\/\x00-\x1f]/.test(v))throw Error('歌单名称应为 1–32 字，不能包含路径分隔符');return v.trim();}
 function migrate(files){
  const cats=getLegacyCategories(),legacy=getLegacyPlaylists();
  if(!cats||typeof cats!=='object'||Array.isArray(cats)||!Array.isArray(legacy)||cats.categories!==undefined&&!Array.isArray(cats.categories)||cats.assignments!==undefined&&(!cats.assignments||typeof cats.assignments!=='object'||Array.isArray(cats.assignments)))throw Error('旧歌单数据格式损坏，原文件已保留');
  if(legacy.some(p=>!p||!Array.isArray(p.tracks)||p.tracks.some(n=>!validName(n))))throw Error('旧歌单歌曲索引损坏，原文件已保留');
  const live=new Set(files.map(f=>f.name));
  // Older releases changed filenames when categorizing. Resolve stale references
  // to an existing prefixed/unprefixed counterpart without touching audio files.
  const resolve=n=>{if(live.has(n))return n;const other=n.startsWith('[歌单] ')?n.slice(5):'[歌单] '+n;return live.has(other)?other:n;};
  const known=legacy.flatMap(p=>p.tracks).map(resolve),assignments={};
  for(const [name,id] of Object.entries(cats.assignments||{}))if(validName(name))assignments[resolve(name)]=id;
  const all=[...new Set([...(Array.isArray(cats.order)?cats.order.filter(validName).map(resolve):[]),...known,...Object.keys(assignments),...files.map(f=>f.name).filter(validName)])];
  const defaultList={id:'default',name:'全部已下载',tracks:all},lists=[defaultList],used=new Set(['全部已下载']),ids=new Set(['default']);
  const unclassified=known.filter(n=>!assignments[n]);let oldName;try{oldName=label(cats.defaultName||'未分类')}catch{oldName='未分类'}
  if(oldName!=='全部已下载'&&(unclassified.length||cats.defaultName)){lists.push({id:randomUUID(),name:oldName,tracks:[...new Set(unclassified)]});used.add(oldName.toLocaleLowerCase());}
  for(const category of cats.categories||[]){
   if(!validId(category?.id)||ids.has(category.id))continue;ids.add(category.id);let name;try{name=label(category.name)}catch{continue}
   if(used.has(name.toLocaleLowerCase())){let n=2;const original=name;do{name=original.slice(0,Math.max(1,31-String(n).length))+' '+n++;}while(used.has(name.toLocaleLowerCase()));}
   used.add(name.toLocaleLowerCase());lists.push({id:category.id,name,tracks:all.filter(f=>assignments[f]===category.id)});
  }
  return {version:1,playlists:lists};
 }
 function read(files){
  const exists=fs.existsSync(getFile()),raw=readJSON(getFile(),null);
  if(!exists){const data=migrate(files);writeJSONAtomic(getFile(),data);return data;}
  if(!raw||raw.version!==1||!Array.isArray(raw.playlists)||!raw.playlists.length)throw Error('歌单数据格式损坏，原文件已保留');
  const ids=new Set(),names=new Set(),playlists=[];
  for(const p of raw.playlists){
   if(!p||!validId(p.id)||ids.has(p.id)||!Array.isArray(p.tracks)||p.tracks.some(n=>!validName(n))||new Set(p.tracks).size!==p.tracks.length)throw Error('歌单数据格式损坏，原文件已保留');
   const name=label(p.name),key=name.toLocaleLowerCase();if(names.has(key))throw Error('歌单名称重复，原文件已保留');
   ids.add(p.id);names.add(key);playlists.push({id:p.id,name,tracks:[...p.tracks]});
  }
  if(!ids.has('default'))throw Error('默认歌单缺失，原文件已保留');
  return {version:1,playlists};
 }
 function lookup(data,id){const list=data.playlists.find(p=>p.id===id);if(!list)throw Error('歌单不存在，请刷新后重试');return list;}
 function selected(names){if(!Array.isArray(names)||!names.length||names.length>10000||names.some(n=>!validName(n))||new Set(names).size!==names.length)throw Error('歌曲列表无效');return names;}
 function ensureName(data,name,except){const v=label(name);if(data.playlists.some(p=>p.id!==except&&p.name.toLocaleLowerCase()===v.toLocaleLowerCase()))throw Error('歌单名称已存在');return v;}
 function snapshot(data,files){const counts=new Map();for(const f of files)counts.set(f.name,(counts.get(f.name)||0)+1);return {playlists:data.playlists.map(p=>({...p,tracks:[...p.tracks],missing:p.tracks.filter(n=>!counts.has(n)),conflicts:p.tracks.filter(n=>(counts.get(n)||0)>1)}))};}
 async function execute(fn,save=true){
  const files=await getFiles(),data=read(files),all=lookup(data,'default');
  const live=files.map(f=>f.name).filter(validName);for(const n of live)if(!all.tracks.includes(n))all.tracks.push(n);
  if(fn)fn(data,files);if(save&&fn)writeJSONAtomic(getFile(),data);return snapshot(data,files);
 }
 function available(files,names){const counts=new Map();for(const f of files)counts.set(f.name,(counts.get(f.name)||0)+1);for(const n of names){if(!counts.has(n))throw Error('歌曲文件不存在：'+n);if(counts.get(n)>1)throw Error('多个目录存在同名歌曲，请先区分文件名：'+n);}}
 const list=()=>execute(null,false);
 const create=name=>execute(d=>{d.playlists.push({id:randomUUID(),name:ensureName(d,name),tracks:[]});});
 const rename=(id,name)=>execute(d=>{lookup(d,id).name=ensureName(d,name,id);});
 const remove=id=>execute(d=>{if(id==='default')throw Error('全部已下载不能删除');lookup(d,id);d.playlists=d.playlists.filter(p=>p.id!==id);});
 const add=(id,names)=>execute((d,files)=>{const p=lookup(d,id),rows=selected(names);available(files,rows);for(const n of rows)if(!p.tracks.includes(n))p.tracks.push(n);});
 const removeTracks=(id,names)=>execute(d=>{if(id==='default')throw Error('全部已下载显示所有本地文件，请在其他歌单中移除');const p=lookup(d,id),rows=selected(names);if(rows.some(n=>!p.tracks.includes(n)))throw Error('歌曲不在此歌单，请刷新');p.tracks=p.tracks.filter(n=>!rows.includes(n));});
 const forgetFiles=names=>execute((d,files)=>{
  const rows=selected(names),live=new Set(files.map(f=>f.name));
  if(rows.some(n=>live.has(n)))throw Error('同名音乐文件仍存在，不能移除引用');
  const removed=new Set(rows);for(const list of d.playlists)list.tracks=list.tracks.filter(n=>!removed.has(n));
 });
 const transfer=(sourceId,targetId,names,move=false)=>execute((d,files)=>{
  if(typeof move!=='boolean')throw Error('无效移动选项');if(sourceId===targetId)throw Error('请选择不同的目标歌单');const source=lookup(d,sourceId),target=lookup(d,targetId),rows=selected(names);
  if(rows.some(n=>!source.tracks.includes(n)))throw Error('歌曲不在源歌单，请刷新');available(files,rows);for(const n of rows)if(!target.tracks.includes(n))target.tracks.push(n);if(move&&sourceId!=='default')source.tracks=source.tracks.filter(n=>!rows.includes(n));
 });
 const merge=(ids,name)=>execute(d=>{if(!Array.isArray(ids)||ids.length<2||new Set(ids).size!==ids.length)throw Error('请选择至少两个不同歌单');const tracks=[];for(const id of ids)for(const n of lookup(d,id).tracks)if(!tracks.includes(n))tracks.push(n);d.playlists.push({id:randomUUID(),name:ensureName(d,name),tracks});});
 const reorder=ids=>execute(d=>{if(!Array.isArray(ids)||ids.length!==d.playlists.length||new Set(ids).size!==ids.length||ids.some(id=>!d.playlists.some(p=>p.id===id)))throw Error('歌单顺序已过期，请刷新');d.playlists=ids.map(id=>lookup(d,id));});
 const reorderTracks=(id,names)=>execute(d=>{const p=lookup(d,id);if(!Array.isArray(names)||names.length!==p.tracks.length||new Set(names).size!==names.length||names.some(n=>!p.tracks.includes(n)))throw Error('歌曲顺序已过期，请刷新');p.tracks=[...names];});
 return {list,create,rename,remove,add,removeTracks,forgetFiles,transfer,merge,reorder,reorderTracks};
}
module.exports={createUserPlaylists};
