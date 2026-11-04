'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/panel.js'),'utf8');
const start=source.indexOf(' async function loadLyrics('),end=source.indexOf(' function syncLyrics()',start);
if(start<0||end<0)throw Error('Cannot locate actual panel lyric loader');
function harness(first){
 let calls=0;const nodes=new Map();
 const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',replaceChildren(){},append(){}});return nodes.get(id);};
 const context={lyricRequest:0,lyrics:[],lyricIndex:-1,lyricsKey:'',lyricPhase:'idle',settings:{desktopLyricsEnabled:false},player:{serial:()=>7},
  bridge:{localLyrics:()=>++calls===1?first:Promise.resolve({found:false}),fetchLyrics:async()=>({lrc:'新词'})},
  window:{MusicLRC:{parseLrc:text=>[{time:0,text,translation:''}]}},audio:{currentTime:0,duration:30},$,publishFullscreen(){},pushDesktopLyrics(){},syncLyrics(){},element:()=>({dataset:{},append(){}})};
 const load=vm.runInNewContext('('+source.slice(start,end).trim()+')',context);return {context,load};
}
test('same-song same-serial newer lyric request wins over late old response',async()=>{
 let resolve;const first=new Promise(r=>resolve=r),{context,load}=harness(first);
 const old=load({key:'local:one',local:true,file:'one.wav'},7);
 await load({key:'local:one',local:true,file:'one.wav',id:'123'},7);
 resolve({found:true,lrc:'旧词'});await old;
 assert.equal(context.lyricPhase,'ready');assert.equal(context.lyrics[0].text,'新词');
});
test('a late failure cannot overwrite newer successful lyrics',async()=>{
 let reject;const first=new Promise((_resolve,r)=>reject=r),{context,load}=harness(first);
 const old=load({key:'local:one',local:true,file:'one.wav'},7);
 await load({key:'local:one',local:true,file:'one.wav',id:'123'},7);
 reject(Error('late'));await old;
 assert.equal(context.lyricPhase,'ready');assert.equal(context.lyrics[0].text,'新词');
});
