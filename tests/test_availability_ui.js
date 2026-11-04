'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('song rows hide local and trial badges but keep the unavailable warning',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/panel.js'),'utf8');
 const start=source.indexOf(' function renderRows()'),end=source.indexOf(' function updateAvailabilityVersion(',start);
 assert.ok(start>=0&&end>start);
 const make=(tag,cls='',text)=>({tag,cls,text,children:[],dataset:{},append(...v){this.children.push(...v)},setAttribute(){}});
 const list=make('list');list.replaceChildren=()=>{list.children=[]};const count={};
 const ctx={tab:'search',rows:['1','2','3'].map(id=>({id,key:'online:'+id,name:id,artists:'',local:false})),
  availability:new Map([['1',{fromLocal:true,state:'available'}],['2',{trialAvailable:true,state:'unavailable'}],['3',{state:'unavailable',reason:'暂不可用'}]]),
  window:{MusicTrackOrder:{pageOrder:r=>r}},player:{state:()=>({track:null})},
  $:id=>id==='query'?{value:''}:id==='track-list'?list:count,
  document:{createDocumentFragment:()=>make('fragment')},element:make,safe:fn=>fn};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end)+';renderRows()',ctx);
 const entries=list.children[0].children;
 assert.deepEqual(entries.map(row=>row.children.filter(x=>x.cls==='row-state').map(x=>x.text)),[[],[],['在线未就绪']]);
});
function availabilityHarness(hidden=false){
 const source=fs.readFileSync(path.join(__dirname,'../app/panel.js'),'utf8');
 const start=source.indexOf(' function updateAvailabilityVersion('),end=source.indexOf(' async function refreshLocal(',start);
 const hideStart=source.indexOf(' function hideSheets('),hideEnd=source.indexOf(' async function loadTab(',hideStart);
 assert.ok(start>=0&&end>start&&hideStart>=0&&hideEnd>hideStart);
 const requests=[],elements={browser:{hidden},'settings-view':{},'tasks-view':{},'lyrics-view':{}};
 const ctx={rows:[{id:'1',local:false}],tab:'search',activeDiscovery:null,availability:new Map(),availabilityVersions:new Map(),availabilityRevision:0,availabilityProbePending:false,loadSerial:1,audio:{error:null},player:{state:()=>({track:{id:'1'}})},
  bridge:{mediaAvailability:()=>new Promise(resolve=>requests.push(resolve))},renderRows:()=>{},$:id=>elements[id]};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end)+source.slice(hideStart,hideEnd)+';globalThis.probe=probeRows;globalThis.invalidate=invalidateSongAvailability;globalThis.showBrowser=hideSheets;globalThis.playback=recordPlaybackAvailability;globalThis.forget=forgetPlaybackAvailability;',ctx);
 return {ctx,requests,elements};
}
test('settings changes invalidate in-flight availability results before probing again',async()=>{
 const h=availabilityHarness();const old=h.ctx.probe(1);assert.equal(h.requests.length,1);h.ctx.invalidate();assert.equal(h.requests.length,2);
 h.requests[1]([{id:'1',state:'available'}]);await flush();h.requests[0]([{id:'1',state:'unavailable'}]);await old;
 assert.equal(h.ctx.availability.get('1').state,'available');
});
test('actual playback replaces stale unavailable status and an older probe cannot overwrite it',async()=>{
 const h=availabilityHarness();h.ctx.availability.set('1',{id:'1',state:'unavailable'});const pending=h.ctx.probe(1);
 h.ctx.playback({track:{id:'1'},playing:false,busy:false,error:''});assert.equal(h.ctx.availability.get('1').state,'unavailable');
 h.ctx.playback({track:{id:'1'},playing:true,busy:false,error:''});assert.equal(h.ctx.availability.get('1').state,'available');
 h.requests[0]([{id:'1',state:'unavailable'}]);await pending;assert.equal(h.ctx.availability.get('1').state,'available');
 h.ctx.forget();assert.equal(h.ctx.availability.has('1'),false);
});
test('playback status preserves trial and local source, and expires after page or settings change',()=>{
 const h=availabilityHarness();h.ctx.playback({track:{id:'1',previewOnly:true},playing:true,busy:false,error:''});assert.equal(h.ctx.availability.get('1').trialAvailable,true);
 h.ctx.loadSerial++;h.ctx.playback({track:null,playing:false});assert.equal(h.ctx.availability.has('1'),false);
 h.ctx.playback({track:{id:'1',fromLocal:true},playing:true,busy:false,error:''});assert.equal(h.ctx.availability.get('1').fromLocal,true);
 h.ctx.invalidate();assert.equal(h.ctx.availability.has('1'),false);
});
test('settings change while settings are open probes songs on returning to the list',async()=>{
 const h=availabilityHarness(true);h.ctx.invalidate();assert.equal(h.requests.length,0);assert.equal(h.ctx.availabilityProbePending,true);
 h.ctx.showBrowser();assert.equal(h.requests.length,1);h.requests[0]([{id:'1',state:'available'}]);await flush();assert.equal(h.ctx.availability.get('1').state,'available');
});
