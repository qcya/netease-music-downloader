'use strict';
(function(root){
 function createDiscoveryQueue({fetchPage,initialOffset=0,initialRows=[],selectedKey,selectedRow,limit=500}){
  if(typeof fetchPage!=='function'||!Number.isInteger(initialOffset)||initialOffset<0||!Number.isInteger(limit)||limit<1||limit>500||!Array.isArray(initialRows)||typeof selectedKey!=='string'||!selectedKey)throw Error('歌单队列参数无效');
  const initial=initialRows.filter(row=>row&&typeof row.key==='string'&&row.key);
  if(selectedRow?.key===selectedKey&&!initial.some(row=>row.key===selectedKey))initial.push(selectedRow);
  const selectedIndex=initial.findIndex(row=>row.key===selectedKey);
  const start=Math.floor((initialOffset+Math.max(0,selectedIndex))/limit)*limit,segments=new Map(),pending=new Map();let total=null,initTask=null;
  function mergeInitial(rows){
   const result=[...rows],present=new Set(result.map(row=>row.key));
   for(let i=0;i<initial.length;i++){
    const row=initial[i];if(present.has(row.key))continue;
    let index=-1;
    for(let j=i-1;j>=0;j--){const found=result.findIndex(x=>x.key===initial[j].key);if(found>=0){index=found+1;break;}}
    if(index<0)for(let j=i+1;j<initial.length;j++){const found=result.findIndex(x=>x.key===initial[j].key);if(found>=0){index=found;break;}}
    if(index<0){
     const before=new Set();for(const [offset,items] of segments)if(offset<start)for(const item of items)before.add(item.key);
     index=Math.max(0,Math.min(result.length,before.size+initialOffset-start+i));
    }
    result.splice(index,0,row);present.add(row.key);
   }
   return result;
  }
  function rows(){const output=[],seen=new Set();for(const offset of [...segments.keys()].sort((a,b)=>a-b))for(const row of segments.get(offset)){if(!seen.has(row.key)){seen.add(row.key);output.push(row);}}return mergeInitial(output);}
  async function load(offset){
   if(segments.has(offset))return;
   if(!pending.has(offset)){
    const request=Promise.resolve().then(()=>fetchPage({offset,limit})).then(page=>{
     if(!page||!Array.isArray(page.tracks)||!Number.isInteger(page.total)||page.total<0)throw Error('歌单歌曲读取失败');
     const list=page.tracks.filter(row=>row&&typeof row.key==='string'&&row.key);
     total=page.total;segments.set(offset,list);
    }).finally(()=>pending.delete(offset));pending.set(offset,request);
   }
   await pending.get(offset);
  }
  async function initialize(){
   if(!initTask)initTask=load(start).catch(error=>{initTask=null;throw error;});
   await initTask;const result=rows();if(!result.some(row=>row.key===selectedKey)){segments.delete(start);initTask=null;throw Error('歌单未返回当前歌曲，保留现有播放队列');}return result;
  }
  async function extend(direction){
   if(direction!==1&&direction!==-1)throw Error('无效翻页方向');
   await initialize();let offsets=[...segments.keys()].sort((a,b)=>a-b),low=offsets[0],high=offsets[offsets.length-1];
   const oldSize=rows().length;
   if(direction===1){
    while(high+limit<total){high+=limit;await load(high);if(rows().length>oldSize)return rows();}
    // At the true end, load earlier unseen chunks before wrapping to the start.
    while(low>0){low=Math.max(0,low-limit);await load(low);}
   }else{
    while(low>0){low=Math.max(0,low-limit);await load(low);if(rows().length>oldSize)return rows();}
    // At the true beginning, load later unseen chunks before wrapping to the end.
    while(high+limit<total){high+=limit;await load(high);}
   }
   return rows();
  }
  return {initialize,extend};
 }
 const api=Object.freeze({createDiscoveryQueue});if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.MusicDiscoveryQueue=api;
})(typeof window==='undefined'?null:window);
