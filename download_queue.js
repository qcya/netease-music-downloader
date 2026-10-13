'use strict';
/** Limited asynchronous task pool. Tasks with the same exact key share one promise. */
function createDownloadQueue({limit=3, onState=()=>{}}={}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 12) throw new Error('无效的下载并发上限');
  let active=0;
  const waiting=[];
  const inflight=new Map();
  const snapshot=()=>({active,waiting:waiting.length,limit});
  function report(task, status, extra={}) {
    try { onState({...task.meta,status,...snapshot(),...extra}); } catch {}
  }
  function pump() {
    while(active < limit && waiting.length) {
      const task=waiting.shift();
      active++;
      report(task,'running');
      Promise.resolve().then(task.action).then(
        result=>{report(task,result?.ok===false?'failed':'completed',{error:result?.error||''});task.resolve(result);},
        error=>{report(task,'failed',{error:String(error?.message||error)});task.reject(error);}
      ).finally(()=>{
        active--;
        inflight.delete(task.key);
        pump();
      });
    }
  }
  function enqueue(key, meta, action) {
    if (typeof key !== 'string' || !key) throw new Error('任务键无效');
    if (inflight.has(key)) return inflight.get(key);
    const promise=new Promise((resolve,reject)=>{
      const task={key,meta,action,resolve,reject};
      waiting.push(task);
      report(task,'queued');
      pump();
    });
    inflight.set(key,promise);
    return promise;
  }
  function setLimit(value) {
    if (!Number.isInteger(value) || value<1 || value>6) throw new Error('并行下载数量必须是 1–6');
    limit=value;
    pump();
  }
  return {enqueue,snapshot,setLimit};
}
module.exports={createDownloadQueue};
