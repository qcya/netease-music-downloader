'use strict';
// Start the portable EXE with --remote-debugging-port=PORT and isolated test data first.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const port=Number(process.argv[2]||9379),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function pages(){return (await fetch('http://127.0.0.1:'+port+'/json/list')).json();}
async function connect(target){
 const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let serial=0;
 ws.onmessage=({data})=>{const r=JSON.parse(data);if(!pending.has(r.id))return;pending.get(r.id)(r);pending.delete(r.id);};
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 return {close:()=>ws.close(),async run(expression){const id=++serial;let timer;try{
  const promise=new Promise(resolve=>pending.set(id,resolve));ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
  const r=await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('CDP timeout')),15000))]);
  if(r.error||r.result?.exceptionDetails)throw Error(JSON.stringify(r));return r.result.result?.value;
 }finally{clearTimeout(timer);pending.delete(id);}}};
}
async function wait(check,label){for(let i=0;i<120;i++){try{const value=await check();if(value)return value;}catch{}await delay(250);}throw Error(label);}
(async()=>{
 const target=await wait(async()=>(await pages()).find(p=>p.url.endsWith('/index.html')),'packaged main unavailable');
 const main=await connect(target);let mini;
 try{
  const info=await main.run('musicBridge.appInfo()');assert.equal(info.version,'1.2.0-preview.1');
  const backend=await main.run('musicBridge.checkPython()');assert.ok(backend.version);
  await main.run('musicBridge.openMiniPlayer()');
  mini=await connect(await wait(async()=>(await pages()).find(p=>p.url.endsWith('/mini-player.html')),'packaged drawer missing'));
  await wait(()=>mini.run("typeof miniBridge!=='undefined' && !!document.getElementById('tab-library')"),'packaged drawer DOM not ready');
  await mini.run("miniBridge.control({type:'expand'});miniBridge.control({type:'pin'});document.getElementById('tab-library').click()");
  await wait(()=>mini.run("document.querySelectorAll('.song').length>=1"),'packaged library empty');
  await mini.run("document.querySelector('.song').click()");
  await wait(()=>main.run("!document.getElementById('music-audio').paused && document.getElementById('music-audio').currentTime>0"),'packaged playback failed');
  await mini.run("miniBridge.control('toggle')");
  await wait(()=>main.run("document.getElementById('music-audio').paused"),'packaged pause failed');
  assert.ok(await main.run("document.getElementById('player-dock').getBoundingClientRect().bottom<=innerHeight+1"));
  const result={ok:true,version:info.version,backend,checks:['portable startup','embedded backend','drawer IPC','local decoding','pause','main transport layout']};
  fs.writeFileSync(path.join(__dirname,'../.validation/packaged-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  await mini.run('miniBridge.quit()').catch(()=>{});
 }finally{main.close();mini?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
