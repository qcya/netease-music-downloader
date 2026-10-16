'use strict';
const {randomUUID}=require('node:crypto');
function createCategoryStore({getFile,getTracks,readJSON,writeJSONAtomic}){
  const tidyName=value=>{
    if(typeof value!=='string')throw new Error('分类名称无效');
    const name=value.trim();
    if(!name||name.length>32||/[\\/\x00-\x1f]/.test(name))throw new Error('分类名称应为 1—32 字，不得包含路径分隔符');
    return name;
  };
  function read(){
    const raw=readJSON(getFile(),{});
    const rows=Array.isArray(raw?.categories)?raw.categories:[];
    const categories=[],ids=new Set(),names=new Set();
    for(const item of rows){
      if(typeof item?.id!=='string'||!/^[0-9a-f-]{36}$/.test(item.id)||ids.has(item.id))continue;
      let name;try{name=tidyName(item.name)}catch{continue}
      if(names.has(name))continue;
      ids.add(item.id);names.add(name);categories.push({id:item.id,name});
    }
    const tracks=new Set(getTracks()),assignments={};
    for(const [name,id] of Object.entries(raw?.assignments||{})){
      if(tracks.has(name)&&ids.has(id))assignments[name]=id;
    }
    // The legacy unclassified bucket becomes a user-renamable default list.
    const defaultName=typeof raw?.defaultName==='string'?raw.defaultName:'未分类';
    let safeDefaultName='未分类';try{safeDefaultName=tidyName(defaultName)}catch{}
    const data={categories,assignments,defaultName:safeDefaultName};
    if(JSON.stringify(data)!==JSON.stringify(raw))writeJSONAtomic(getFile(),data);
    return data;
  }
  function persist(data){writeJSONAtomic(getFile(),data);return data}
  function list(){return read()}
  function create(name){
    const label=tidyName(name),data=read();
    if(data.categories.some(c=>c.name===label)||data.defaultName===label)throw new Error('该歌单名称已存在');
    data.categories.push({id:randomUUID(),name:label});return persist(data);
  }
  function rename(id,name){
    const label=tidyName(name),data=read(),item=data.categories.find(c=>c.id===id);
    if(!item)throw new Error('分类不存在');
    if(data.categories.some(c=>c.id!==id&&c.name===label)||data.defaultName===label)throw new Error('歌单名称重复');
    item.name=label;return persist(data);
  }
  function remove(id){
    const data=read();
    if(!data.categories.some(c=>c.id===id))throw new Error('分类不存在');
    data.categories=data.categories.filter(c=>c.id!==id);
    for(const [name,cat] of Object.entries(data.assignments))if(cat===id)delete data.assignments[name];
    return persist(data);
  }
  function renameDefault(name){
    const label=tidyName(name),data=read();
    if(data.categories.some(c=>c.name===label))throw new Error('歌单名称已存在');
    data.defaultName=label;return persist(data);
  }
  function move(name,id){
    const data=read();
    if(!getTracks().includes(name))throw new Error('歌曲不在我的歌单中');
    if(id!==null&&!data.categories.some(c=>c.id===id))throw new Error('目标分类不存在');
    if(id===null)delete data.assignments[name];else data.assignments[name]=id;
    return persist(data);
  }
  return {list,create,rename,renameDefault,remove,move};
}
module.exports={createCategoryStore};
