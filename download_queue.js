'use strict';
/** Cancellable, bounded downloader. Each key has at most one live task. */
function createDownloadQueue({limit=3,onState=()=>{}}={}) {
  if(!Number.isInteger(limit)||limit<1||limit>6) throw new Error('无效的下载并发上限');
  let active=0, paused=false;
  const waiting=[],inflight=new Map();
  const snapshot=()=>({active,waiting:waiting.length,limit,paused});
  const report=(task,status,more={})=>{
    task.status=status;
    try{onState({...task.meta,status,key:task.key,...snapshot(),...more});}catch{}
  };
  function finish(task) {
    active--;
    if(inflight.get(task.key)===task)inflight.delete(task.key);
    pump();
  }
  function pump() {
    while(!paused&&active<limit&&waiting.length){
      const task=waiting.shift();
      if(task.controller.signal.aborted)continue;
      active++;
      report(task,'running');
      Promise.resolve().then(()=>{if(task.controller.signal.aborted)throw new Error('任务已取消');return task.action(task.controller.signal,progress=>report(task,'running',{progress}));}).then(
        result=>{
          const cancelled=task.controller.signal.aborted;
          report(task,cancelled?'cancelled':result?.ok===false?'failed':'completed',{error:cancelled?'':result?.error||''});
          finish(task);
          task.resolve(cancelled?{ok:false,cancelled:true,status:'cancelled'}:result);
        },error=>{
          const cancelled=task.controller.signal.aborted;
          report(task,cancelled?'cancelled':'failed',{error:cancelled?'':String(error?.message||error)});
          finish(task);
          if(cancelled)task.resolve({ok:false,cancelled:true,status:'cancelled'});
          else task.reject(error);
        }
      );
    }
  }
  function enqueue(key,meta,action) {
    if(typeof key!=='string'||!key)throw new Error('任务键无效');
    if(inflight.has(key))return inflight.get(key).promise;
    let resolve,reject;
    const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
    const task={key,meta,action,resolve,reject,promise,controller:new AbortController(),status:'queued'};
    inflight.set(key,task);
    waiting.push(task);
    report(task,'queued');
    pump();
    return promise;
  }
  function cancel(key) {
    const task=inflight.get(key);
    if(!task)return false;
    task.controller.abort();
    if(task.status==='queued'){
      const index=waiting.indexOf(task);
      if(index>=0)waiting.splice(index,1);
      inflight.delete(key);
      report(task,'cancelled');
      task.resolve({ok:false,cancelled:true,status:'cancelled'});
      pump();
    }
    return true;
  }
  function cancelSong(id,purpose=null) {
    let n=0;
    for(const task of [...inflight.values()])if(String(task.meta.id)===String(id)&&(!purpose||task.meta.purpose===purpose)){
      if(cancel(task.key))n++;
    }
    return n;
  }
  function setPaused(value){paused=!!value;pump();return snapshot();}
  function setLimit(value){if(!Number.isInteger(value)||value<1||value>6)throw new Error('并行下载数量必须是 1–6');limit=value;pump();}
  return {enqueue,snapshot,setLimit,setPaused,cancel,cancelSong};
}
module.exports={createDownloadQueue};
