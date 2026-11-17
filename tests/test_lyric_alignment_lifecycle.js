'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app/panel.js'),'utf8');
test('desktop captions request real timings without waiting for fullscreen',async()=>{
 const calls=[],context={fullscreenActive:false,settings:{desktopLyricsEnabled:true},lyricsKey:'online:123',lyricRequest:1,lyrics:[{time:0,text:'开头歌词'}],lyricIndex:0,Date,player:{state:()=>({track:{key:'online:123',id:'123'}})},publishFullscreen(){},pushDesktopLyrics(){},bridge:{onLyricAlignment(){},alignLyrics:async r=>{calls.push(r);return {lines:[{time:0,text:'开头歌词',words:[{time:0,duration:2,text:'开头歌词'}]}]};}}};
 vm.runInNewContext(source.slice(source.indexOf(" let alignmentRequest="),source.indexOf(' function lyricsState()'))+';this.request=requestWordTimings;',context);await context.request();assert.equal(calls.length,1);assert.equal(context.lyrics[0].words[0].time,0);
 context.settings.desktopLyricsEnabled=false;context.lyrics=[{time:0,text:'新词'}];await context.request();assert.equal(calls.length,1,'no caption views means no new model worker');
});
test('leaving fullscreen preserves an in-progress desktop caption alignment',()=>{
 let handler,stops=0;const context={settings:{desktopLyricsEnabled:true},bridge:{onFullscreenActive:fn=>handler=fn},stopAlignment:()=>stops++,publishFullscreen(){},requestWordTimings(){}};
 const line=source.split('\n').find(s=>s.includes('bridge.onFullscreenActive(active=>'));vm.runInNewContext(line,context);handler(false);assert.equal(stops,0);context.settings.desktopLyricsEnabled=false;handler(false);assert.equal(stops,1);
});
