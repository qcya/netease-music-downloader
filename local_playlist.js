'use strict';
const fs=require('node:fs');
const path=require('node:path');

const PREFIX='[歌单] ';
const AUDIO_EXTS=new Set(['.mp3','.flac','.m4a','.ogg','.wav','.aac']);
const single=tracks=>[{id:'default',name:'我的歌单',tracks}];
const tagged=name=>name.startsWith(PREFIX);
const clean=name=>tagged(name)?name.slice(PREFIX.length):name;
function validName(name){
  return typeof name==='string'&&name.length>0&&name===path.basename(name)&&!name.includes('\\')&&
    !/[\x00-\x1f]/.test(name)&&AUDIO_EXTS.has(path.extname(name).toLowerCase());
}
function createPlaylistStore({getDir,getIndexFile,readJSON,writeJSONAtomic}){
  function directory(){
    const dir=getDir();
    if(typeof dir!=='string'||!path.isAbsolute(dir))throw new Error('下载目录无效');
    return path.resolve(dir);
  }
  function localFile(name){
    if(!validName(name))throw new Error('无效本地文件名');
    const filename=path.join(directory(),name);
    if(!fs.existsSync(filename)||!fs.statSync(filename).isFile())throw new Error('歌曲文件不存在');
    return filename;
  }
  function move(name,newName){
    if(name===newName)return newName;
    const old=localFile(name);
    if(!validName(newName))throw new Error('歌单标记后的文件名无效');
    const target=path.join(directory(),newName);
    if(fs.existsSync(target))throw new Error('目标文件已经存在，不能覆盖：'+newName);
    const oldLyric=old.slice(0,-path.extname(old).length)+'.lrc';
    const newLyric=target.slice(0,-path.extname(target).length)+'.lrc';
    const withLyric=fs.existsSync(oldLyric);
    if(withLyric&&fs.existsSync(newLyric))throw new Error('对应歌词文件已存在，不能覆盖');
    fs.renameSync(old,target);
    try{if(withLyric)fs.renameSync(oldLyric,newLyric)}
    catch(e){try{fs.renameSync(target,old)}catch{}throw e}
    return newName;
  }
  function sourceNames(){
    const saved=readJSON(getIndexFile(),null),names=[];
    if(Array.isArray(saved)){
      for(const p of saved){
        if(!Array.isArray(p?.tracks))continue;
        for(const n of p.tracks)if(validName(n)&&!names.includes(n))names.push(n);
      }
    }
    // Reconcile manually prefixed files and a legacy playlist index. No audio is
    // deleted during migration, and name conflicts never overwrite another song.
    const tracks=[];
    for(const n of names){
      let current=n;
      if(!tagged(n)){
        const prefixed=PREFIX+n;
        if(fs.existsSync(path.join(directory(),n))&&!fs.existsSync(path.join(directory(),prefixed))){
          try{current=move(n,prefixed)}catch{current=n}
        }else if(fs.existsSync(path.join(directory(),prefixed))&&!fs.existsSync(path.join(directory(),n))){
          current=prefixed;
        }
      }
      if(!tracks.includes(current))tracks.push(current);
    }
    if(fs.existsSync(directory())){
      for(const entry of fs.readdirSync(directory(),{withFileTypes:true})){
        if(entry.isFile()&&validName(entry.name)&&tagged(entry.name)&&!tracks.includes(entry.name))tracks.push(entry.name);
      }
    }
    const result=single(tracks);
    if(!Array.isArray(saved)||JSON.stringify(saved)!==JSON.stringify(result))writeJSONAtomic(getIndexFile(),result);
    return result;
  }
  function list(){return sourceNames()}
  function add(id,name){
    if(id!=='default')throw new Error('当前只使用一个歌单');
    const existing=sourceNames()[0].tracks;
    if(existing.includes(name))return single(existing);
    const next=tagged(name)?name:move(name,PREFIX+name);
    if(!tagged(name))localFile(next);
    const tracks=[...existing.filter(x=>x!==name),next];
    writeJSONAtomic(getIndexFile(),single(tracks));
    return single(tracks);
  }
  function remove(id,name){
    if(id!=='default')throw new Error('当前只使用一个歌单');
    const existing=sourceNames()[0].tracks;
    if(!existing.includes(name))throw new Error('歌曲不在歌单中');
    if(tagged(name))move(name,clean(name));
    const tracks=existing.filter(x=>x!==name);
    writeJSONAtomic(getIndexFile(),single(tracks));
    return single(tracks);
  }
  function reorder(names){
    const existing=sourceNames()[0].tracks;
    if(!Array.isArray(names)||names.length!==existing.length||
       names.some(n=>typeof n!=='string'||!validName(n))||
       new Set(names).size!==names.length||
       !names.every(n=>existing.includes(n)))throw new Error('歌单排序内容已过期，请刷新后再试');
    writeJSONAtomic(getIndexFile(),single([...names]));
    return single([...names]);
  }
  function afterDelete(name){
    const tracks=sourceNames()[0].tracks.filter(x=>x!==name);
    writeJSONAtomic(getIndexFile(),single(tracks));
  }
  return {list,add,remove,reorder,afterDelete,localFile,tagged,clean,PREFIX};
}
module.exports={createPlaylistStore,PREFIX,validName};
