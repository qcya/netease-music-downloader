'use strict';
(function(root){
 // Serialize begin, poll and cancellation so an old request can never take over
 // a new QR session; invalidate its UI updates as soon as the dialog closes.
 function createAccountLogin({bridge,onState=()=>{},delay=1500,setTimer=setTimeout,clearTimer=clearTimeout}){
  let generation=0,timer=null,queue=Promise.resolve();
  const enqueue=fn=>{const job=queue.then(fn);queue=job.catch(()=>{});return job;};
  const cancelTimer=()=>{if(timer!==null){clearTimer(timer);timer=null;}};
  function schedule(id){timer=setTimer(()=>{timer=null;void enqueue(()=>poll(id));},delay);}
  async function poll(id){
   if(id!==generation)return;
   try{
    const value=await bridge.accountPoll();if(id!==generation)return;
    const phase=value?.state;
    if(phase==='waiting'||phase==='scanned'){onState({phase,message:value.message||''});schedule(id);}
    else if(phase==='authenticated'){onState({phase,nickname:value.nickname||''});}
    else if(phase==='expired'){onState({phase,message:value.message||''});}
    else onState({phase:'error',message:value?.message||'暂时无法完成登录，请重试。'});
   }catch(e){if(id===generation)onState({phase:'error',message:e.message||'暂时无法检查扫码状态，请重试。'});}
  }
  function start(){
   const id=++generation;cancelTimer();onState({phase:'starting'});
   return enqueue(async()=>{
    if(id!==generation)return;
    try{
     const value=await bridge.accountBegin();if(id!==generation)return;
     if(typeof value?.image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.image)||value.image.length>1500000)throw Error('二维码无效，请重试。');
     onState({phase:'waiting',image:value.image,expiresIn:value.expiresIn});schedule(id);
    }catch(e){if(id===generation)onState({phase:'error',message:e.message||'二维码获取失败，请重试。'});}
   });
  }
  function cancel(){
   ++generation;cancelTimer();
   // Invalidate the main-process QR generation immediately, even while a poll
   // is awaiting the network. The queue still waits for cancellation before
   // permitting another QR start, so it cannot cancel the replacement session.
   let result;try{result=Promise.resolve(bridge.accountCancel());}catch(error){result=Promise.reject(error);}
   const settled=result.then(()=>null,error=>error);
   return enqueue(async()=>{const error=await settled;if(error)throw error;});
  }
  return {start,cancel};
 }
 const api={createAccountLogin};if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.MusicAccountLogin=api;
})(typeof window==='undefined'?null:window);
