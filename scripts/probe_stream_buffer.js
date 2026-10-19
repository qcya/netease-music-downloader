'use strict';
// Diagnostic comparison with generated silence only. Never contacts a music provider.
const {app,BrowserWindow,protocol}=require('electron');
const http=require('node:http');
const {createOnlineMedia}=require('../online_media');
app.commandLine.appendSwitch('disable-http-cache');
protocol.registerSchemesAsPrivileged([{scheme:'music-preview',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true}}]);
let base,media,server;const records=[];
function wav(rate){const frames=rate*45,b=Buffer.alloc(44+frames*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);return b;}
app.whenReady().then(async()=>{
 server=http.createServer((req,res)=>{
  const u=new URL(req.url,base);
  if(u.pathname==='/song/url/v1'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:Number(u.searchParams.get('id')),url:base+'/audio.wav?case='+u.searchParams.get('id')+'-proxy'}]}));return;}
  const key=u.searchParams.get('case')||'1-http',rate=key.startsWith('3')?44100:8000,b=wav(rate);
  const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');const start=m?Number(m[1]):0,end=m&&m[2]?Math.min(+m[2],b.length-1):b.length-1;
  const row={key,range:req.headers.range,start:Date.now(),sent:0,finished:false};records.push(row);
  const headers={'Content-Type':'audio/wav','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store'};if(m)headers['Content-Range']=`bytes ${start}-${end}/${b.length}`;
  res.writeHead(m?206:200,headers);let at=start;let timer;
  const send=()=>{let to=Math.min(at+(key.startsWith('2')?32768:128044),end+1);res.write(b.subarray(at,to));row.sent+=to-at;at=to;if(at>end){row.finished=true;res.end();}else timer=setTimeout(send,key.startsWith('2')?100:9000);};
  send();res.on('close',()=>clearTimeout(timer));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 media=createOnlineMedia({getBases:()=>[base]});protocol.handle('music-preview',r=>media.handle(r));
 for(const mode of [1,2,3])for(const kind of ['http','proxy']){
  const w=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
  await w.loadURL('data:text/html,<audio id="a" preload="metadata"></audio>');
  const url=kind==='http'?base+'/audio.wav?case='+mode+'-http':(await media.open(String(mode))).url;
  const result=await w.webContents.executeJavaScript(`new Promise(resolve=>{const a=document.getElementById('a'),t=performance.now(),events=[];for(const name of ['loadedmetadata','loadeddata','canplay','playing','waiting','error','progress'])a.addEventListener(name,()=>events.push({name,ms:Math.round(performance.now()-t),ready:a.readyState,buffer:a.buffered.length?a.buffered.end(0):0}));let interval,timer;const finish=()=>{clearInterval(interval);clearTimeout(timer);resolve({events,time:a.currentTime,ready:a.readyState,error:a.error&&a.error.message});};interval=setInterval(()=>{if(a.currentTime>0)finish();},40);timer=setTimeout(finish,11500);a.src=${JSON.stringify(url)};a.load();a.play().catch(()=>{});})`,true);
  console.log(JSON.stringify({mode,kind,...result,network:records.filter(x=>x.key===mode+'-'+kind)}));w.destroy();media.stop();
 }
 server.closeAllConnections();server.close();app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
