'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawn}=require('node:child_process');
const MODEL='tiny-dcb76c65-alignment-v1';
function createLyricAlignment({getCacheDir,getRuntimeDir,resolveAudio,onProgress=()=>{},spawnImpl=spawn,timeoutMs=15*60_000}){
 let active=null;
 function cancel(){const job=active;if(!job)return;active=null;job.controller.abort();job.child?.kill();job.finish?.({cancelled:true});}
 function wordsFor(line,words){
  if(!Array.isArray(words)||!words.length||words.length>500)return null;
  if(words.some(w=>typeof w.text!=='string'||w.text.length>500||!Number.isFinite(w.time)||!Number.isFinite(w.duration)||w.time<0||w.time>21600||w.duration<0||w.duration>60))return null;
  if(words.map(w=>w.text).join('').trim()!==line.text.trim()||words.some((w,i)=>i&&w.time<words[i-1].time))return null;
  if(!words.some(w=>w.duration>.02))return null;
  return words.map(w=>({text:w.text,time:w.time,duration:w.duration}));
 }
 async function align(request){
  cancel();
  if(!request||typeof request.requestId!=='string'||request.requestId.length>200||!Array.isArray(request.lines)||request.lines.length>1000)throw Error('歌词分析参数无效');
  const lines=request.lines.map(l=>{if(!l||typeof l.text!=='string'||l.text.length>1000||!Number.isFinite(l.time)||l.time<0||l.time>21600)throw Error('歌词行无效');return {...l};});
  if(!lines.length||lines.every(l=>l.words?.length))return {lines,fromCache:false};
  const fingerprint=JSON.stringify({model:MODEL,source:request.source,lines:lines.map(l=>({time:l.time,text:l.text}))});
  const folder=path.join(getCacheDir(),'lyric-timing'),cache=path.join(folder,createHash('sha256').update(fingerprint).digest('hex')+'.json');
  try{const data=JSON.parse(fs.readFileSync(cache,'utf8'));if(data.model===MODEL&&Array.isArray(data.words)&&data.words.length===lines.length){data.words.forEach((words,i)=>{const valid=wordsFor(lines[i],words);if(valid)lines[i].words=valid;});if(lines.every(l=>l.words?.length))return {lines,fromCache:true,model:MODEL};}}catch{}
  const runtime=getRuntimeDir(),exe=path.join(runtime,'lyric-aligner.exe'),model=path.join(runtime,'model');
  if(!fs.existsSync(exe)||!fs.existsSync(path.join(model,'manifest.json')))throw Error('随包歌词模型缺失，请完整解压播放器');
  const job={controller:new AbortController(),requestId:request.requestId,child:null};active=job;
  let audio;
  try{
   audio=await resolveAudio(request.source,job.controller.signal);
   if(active!==job)return {cancelled:true};
   return await new Promise((resolve,reject)=>{
    let ended=false,buffer='',bytes=0,errorText='',timer;
    job.finish=(result,error)=>{if(ended)return;ended=true;clearTimeout(timer);if(active===job)active=null;error?reject(error):resolve(result);};
    const child=job.child=spawnImpl(exe,['--model',model],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',OMP_NUM_THREADS:'4',TOKENIZERS_PARALLELISM:'false'}});
    timer=setTimeout(()=>{child.kill();job.finish(null,Error('逐字歌词分析超时，继续使用原歌词'));},timeoutMs);timer.unref?.();
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
     if(active!==job||ended)return;bytes+=Buffer.byteLength(chunk);if(bytes>4*1024*1024){child.kill();job.finish(null,Error('歌词分析输出无效'));return;}buffer+=chunk;
     for(let end;(end=buffer.indexOf('\n'))>=0;){const row=buffer.slice(0,end);buffer=buffer.slice(end+1);let message;try{message=JSON.parse(row);}catch{continue;}
      if(message.type==='line'&&Number.isInteger(message.index)&&lines[message.index]){const words=wordsFor(lines[message.index],message.words);if(words){lines[message.index].words=words;onProgress({requestId:request.requestId,index:message.index,words});}}
      if(message.type==='error')errorText=String(message.message||'歌词分析失败').slice(0,200);
     }
    });
    child.stderr.on('data',chunk=>{errorText=(errorText+chunk).slice(-1000);});
    child.on('error',error=>job.finish(null,error));
    child.stdin.on?.('error',()=>{});
    child.on('exit',code=>{
     if(ended)return;if(active!==job){job.finish({cancelled:true});return;}
     const alignedCount=lines.filter(l=>l.words?.length).length;
     if(code!==0){job.finish(null,Error('本地逐字分析失败，继续使用原歌词'+(errorText?'（模型运行异常）':'')));return;}
     if(alignedCount){try{fs.mkdirSync(folder,{recursive:true});const temp=cache+'.tmp';fs.writeFileSync(temp,JSON.stringify({model:MODEL,words:lines.map(l=>l.words||null)}));fs.renameSync(temp,cache);}catch{}}
     job.finish({lines,fromCache:false,model:MODEL,alignedCount});
    });
    child.stdin.end(JSON.stringify({audio:typeof audio==='string'?audio:audio.path,lines,index:Number.isInteger(request.index)?request.index:0}));
   });
  }finally{
   if(active===job)active=null;
   if(audio?.temporary&&job.child?.exitCode===null){await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);job.child.removeListener('exit',done);resolve();};job.child.once('exit',done);timer=setTimeout(done,2000);});}
   // Only the resolver's explicitly marked temporary audio is disposable.
   if(audio?.temporary&&typeof audio.path==='string'){const base=path.resolve(getCacheDir()),relative=path.relative(base,path.resolve(audio.path));if(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative))try{fs.unlinkSync(audio.path);}catch{}}
  }
 }
 return {align,cancel,isRunning:()=>!!active};
}
module.exports={createLyricAlignment};
