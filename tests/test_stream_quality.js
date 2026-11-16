'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSourceAvailability,qualityMetadata}=require('../source_availability');
const {createOnlineMedia}=require('../online_media');
const {createPlayer}=require('../app/panel_player');
const cdn='https://m7.music.126.net/test.mp3';
const json=data=>new Response(JSON.stringify(data));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('requested quality reaches the authenticated method and actual FLAC quality is reported',async()=>{
 const calls=[];
 const media=createOnlineMedia({getAuthState:()=>({enabled:true,revision:1}),authLookup:async(id,level)=>{
  calls.push([id,level]);return {data:[{id,url:cdn,type:'flac',level:'hires'}]};
 },fetchImpl:async()=>{throw Error('public lookup must not run');}});
 const row=await media.open('1',{quality:'hires'});
 assert.deepEqual(calls,[['1','hires']]);assert.equal(row.requestedQuality,'hires');assert.equal(row.actualQuality,'hires');assert.equal(row.lossless,true);assert.equal(row.qualityFallback,false);media.close();
});

test('desired public quality is tried before a lower authenticated fallback, without sharing credentials',async()=>{
 const calls=[];
 const media=createOnlineMedia({getBases:()=>['https://public.example'],getAuthState:()=>({enabled:true,revision:1}),
  authLookup:async(id,level)=>{calls.push('auth:'+level);return {data:[{id,url:null}]};},
  fetchImpl:async(url,options)=>{calls.push(String(url));assert.equal(options.credentials,'omit');assert.equal(options.headers.Cookie,undefined);return json({data:[{id:1,url:cdn,type:'mp3',level:'exhigh',br:320000}]});}});
 const row=await media.open('1',{quality:'exhigh'});assert.equal(row.actualQuality,'exhigh');assert.equal(row.lossless,false);
 assert.equal(calls.length,2);assert.equal(calls[0],'auth:exhigh');assert.match(calls[1],/level=exhigh/);media.close();
});

test('quality cache and pending keys never reuse a standard card lookup for lossless',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),calls=[];
 const service=createSourceAvailability({getBases:()=>['https://public.example'],trusted:u=>u===cdn,json:async url=>{
  const level=new URL(url).searchParams.get('level');calls.push(level);if(level==='standard')await gate;
  return {data:[{id:1,url:cdn,level,type:level==='lossless'?'flac':'mp3'}]};
 }});
 const pending=service.check(['1']);await tick();await service.check(['1'],{quality:'lossless'});release();await pending;
 await service.check(['1'],{quality:'lossless'});await service.check(['1']);assert.deepEqual(calls,['standard','lossless']);
 const resolved=await service.resolve('1',undefined,{quality:'lossless'});assert.equal(resolved.actualQuality,'lossless');assert.equal(resolved.requestedQuality,'lossless');
});

test('missing requested sources explicitly fall back and never label an MP3 as lossless',async()=>{
 const levels=[];
 const media=createOnlineMedia({getAuthState:()=>({enabled:true,revision:1}),authLookup:async(id,level)=>{
  levels.push(level);return {data:[{id,url:level==='exhigh'?cdn:null,type:'mp3',br:320000}]};
 },fetchImpl:async()=>json({data:[]})});
 const row=await media.open('1',{quality:'lossless'});assert.deepEqual(levels,['lossless','exhigh']);
 assert.equal(row.requestedQuality,'lossless');assert.equal(row.actualQuality,'exhigh');assert.equal(row.lossless,false);assert.equal(row.qualityFallback,true);media.close();
 assert.equal(qualityMetadata({level:'lossless',type:'mp3'},'lossless').actualQuality,null);
 assert.equal(qualityMetadata({url:cdn},'hires').lossless,false);
});

function audio(){const handlers=[];return {paused:true,src:'',currentTime:0,duration:100,volume:.75,
 pause(){this.paused=true;},removeAttribute(){this.src='';this.currentTime=0;},load(){},async play(){this.paused=false;},
 addEventListener(name,fn){if(name==='loadedmetadata')handlers.push(fn);},metadata(){for(const fn of handlers.splice(0))fn();}};}

test('quality changes retain seek, paused state, queue and shuffle history',async()=>{
 const a=audio(),calls=[],p=createPlayer({audio:a,quality:'higher',bridge:{stopOnlinePlayback:async()=>{},streamAudio:async(id,options)=>{
  calls.push(options);return {url:id+options.quality,actualQuality:options.quality};
 }}});
 const rows=['1','2','3'].map(id=>({key:id,id}));p.setMode('shuffle');await p.play(rows[0],rows);await p.step();
 a.currentTime=42;a.pause();const before=JSON.stringify(p.state().queue);
 await p.setQuality('lossless');a.metadata();assert.equal(a.currentTime,42);assert.equal(a.paused,true);assert.equal(JSON.stringify(p.state().queue),before);
 assert.equal(p.state().quality,'lossless');assert.equal(p.state().actualQuality,'lossless');assert.equal(calls.at(-1).quality,'lossless');
 await a.play();a.currentTime=51;await p.changeQuality('hires');a.metadata();assert.equal(a.currentTime,51);assert.equal(a.paused,false);
});

test('rapid quality switches cancel stale sources and metadata callbacks',async()=>{
 const a=audio(),pending=new Map(),p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},streamAudio:async(id,{quality})=>{
  if(quality==='standard')return {url:'initial'};return new Promise(resolve=>pending.set(quality,resolve));
 }}});
 await p.play({key:'1',id:'1'});a.currentTime=37;
 const old=p.setQuality('lossless');await tick();const newest=p.setQuality('hires');await tick();
 pending.get('hires')({url:'hires',actualQuality:'hires'});assert.equal(await newest,true);a.metadata();
 pending.get('lossless')({url:'stale',actualQuality:'lossless'});assert.equal(await old,false);a.metadata();
 assert.equal(a.src,'hires');assert.equal(a.currentTime,37);assert.equal(a.paused,false);assert.equal(p.state().actualQuality,'hires');
});

test('offline local playback does not await network cancellation or request account/stream APIs',async()=>{
 const a=audio();let locals=0,stops=0;
 const p=createPlayer({audio:a,bridge:{stopOnlinePlayback:()=>{stops++;return new Promise(()=>{});},
  playLocal:async file=>{locals++;return {url:'file:'+file};},streamAudio:()=>{throw Error('login required');}}});
 assert.equal(await p.play({key:'local:a',file:'a.mp3',local:true}),true);assert.equal(a.src,'file:a.mp3');assert.equal(a.paused,false);
 const serial=p.serial();a.currentTime=12;await p.setQuality('lossless');assert.equal(p.serial(),serial);assert.equal(a.currentTime,12);assert.equal(locals,1);assert.equal(stops,1);
});

test('validated Meting FLAC fallback reports lossless without inventing Hi-Res',async()=>{
 const flac=Buffer.alloc(50);flac.write('fLaC');flac.writeUIntBE(34,5,3);flac.writeBigUInt64BE((44100n<<44n)|(44100n*180n),18);
 const media=createOnlineMedia({getBases:()=>['https://public.example'],fetchImpl:async url=>{
  if(String(url).includes('/song/detail/'))return json({songs:[{id:1,dt:180000}]});
  if(String(url).includes('/meting/'))return new Response(null,{status:302,headers:{location:cdn}});
  if(String(url)===cdn)return new Response(flac,{status:206,headers:{'content-type':'audio/flac','content-range':'bytes 0-49/50'}});
  return json({data:[{id:1,url:null}]});
 }});
 const row=await media.open('1',{quality:'hires'});assert.equal(row.requestedQuality,'hires');assert.equal(row.actualQuality,'lossless');assert.equal(row.lossless,true);assert.equal(row.qualityFallback,true);assert.equal(row.sampleRate,44100);media.close();
});

test('changing quality during next-track resolution cancels its old skip loop',async()=>{
 const a=audio();let release;const gate=new Promise(resolve=>release=resolve),calls=[];
 const p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},streamAudio:async(id,{quality})=>{
  calls.push(id+':'+quality);if(id==='2'&&quality==='standard')return gate;return {url:id+quality};
 }}});
 const rows=['1','2','3'].map(id=>({key:id,id}));await p.play(rows[0],rows);const next=p.step();await tick();
 await p.setQuality('lossless');release({url:'old'});await next;assert.equal(a.src,'2lossless');assert.deepEqual(calls,['1:standard','2:standard','2:lossless']);
});

test('a local shortcut returning to network clears stale local origin and allows quality switching',async()=>{
 const a=audio(),calls=[];
 const p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},streamAudio:async(id,{quality})=>{
  calls.push(quality);return calls.length===1?{url:'file:download.mp3',fromLocal:true,localFile:'download.mp3',fromCache:true}:
   {url:'music-preview://audio/'+quality,actualQuality:quality,streaming:true};
 }}});
 const song={key:'online:1',id:'1',local:false};await p.play(song,[song]);await p.play(p.state().track);
 assert.equal(p.state().track.fromLocal,false);assert.equal(p.state().track.localFile,null);assert.equal(p.state().track.fromCache,false);assert.equal(p.state().track.streaming,true);
 a.currentTime=24;await p.setQuality('lossless');a.metadata();assert.deepEqual(calls,['standard','standard','lossless']);assert.equal(a.currentTime,24);
 assert.equal(p.state().track.key,'online:1');assert.equal(p.state().track.local,false);assert.equal(p.state().actualQuality,'lossless');
});

test('network to local shortcut clears stale quality and trial facts while explicit source fields win',async()=>{
 const a=audio();let calls=0;
 const p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},streamAudio:async()=>++calls===1?
  {url:'music-preview://audio/first',actualQuality:'lossless',lossless:true,format:'flac',bitrate:900000,qualityFallback:true,previewOnly:true,trialSeconds:30,streaming:true,fromCache:true}:
  {url:'file:download.mp3',fromLocal:true,localFile:'download.mp3',fromCache:true}}});
 const song={key:'online:1',id:'1',local:false};await p.play(song,[song]);await p.play(p.state().track);const track=p.state().track;
 assert.equal(track.actualQuality,null);assert.equal(track.lossless,false);assert.equal(track.format,null);assert.equal(track.bitrate,null);assert.equal(track.qualityFallback,false);assert.equal(track.previewOnly,false);assert.equal(track.trialSeconds,0);assert.equal(track.streaming,false);
 assert.equal(track.fromLocal,true);assert.equal(track.localFile,'download.mp3');assert.equal(track.fromCache,true);assert.equal(track.key,'online:1');assert.equal(track.local,false);
 await p.setQuality('hires');assert.equal(calls,2);
});

test('direct local rows retain local identity when stale online metadata is replaced',async()=>{
 const a=audio(),p=createPlayer({audio:a,bridge:{stopOnlinePlayback:async()=>{},playLocal:async()=>({url:'file:local.mp3',fromCache:true})}});
 const song={key:'local:local.mp3',file:'local.mp3',local:true,id:'1',fromLocal:true,localFile:'old.mp3',actualQuality:'lossless',lossless:true,format:'flac',bitrate:900000,streaming:true,previewOnly:true,trialSeconds:30};
 await p.play(song,[song]);const track=p.state().track;
 assert.equal(track.key,song.key);assert.equal(track.file,song.file);assert.equal(track.local,true);assert.equal(track.actualQuality,null);assert.equal(track.fromLocal,false);assert.equal(track.localFile,null);assert.equal(track.fromCache,true);assert.equal(track.streaming,false);assert.equal(track.previewOnly,false);
});
