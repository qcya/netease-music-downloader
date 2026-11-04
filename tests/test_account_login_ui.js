'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createAccountLogin}=require('../app/account_login');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(override={}){
 let scheduled=null;const states=[],calls=[];
 const bridge={accountBegin:async()=>{calls.push('begin');return {image:'data:image/png;base64,YWJj',expiresIn:120}},accountPoll:async()=>{calls.push('poll');return {state:'waiting'}},accountCancel:async()=>{calls.push('cancel')},...override};
 const controller=createAccountLogin({bridge,onState:s=>states.push(s),setTimer:fn=>{scheduled=fn;return 1},clearTimer:()=>{scheduled=null}});
 return {controller,states,calls,tick:()=>{const fn=scheduled;scheduled=null;fn?.()}};
}
test('QR login progresses through scan confirmation and success without overlapping polls',async()=>{
 let release,count=0;const f=setup({accountPoll:()=>{count++;return count===1?new Promise(r=>release=r):Promise.resolve({state:'authenticated',nickname:'听众'})}});
 await f.controller.start();assert.equal(f.states.at(-1).phase,'waiting');f.tick();await flush();assert.equal(count,1);f.tick();assert.equal(count,1);
 release({state:'scanned'});await flush();assert.equal(f.states.at(-1).phase,'scanned');f.tick();await flush();assert.equal(f.states.at(-1).phase,'authenticated');assert.equal(f.states.at(-1).nickname,'听众');
});
test('closing during in-flight poll ignores late success and cancels before another QR starts',async()=>{
 let release;const f=setup({accountPoll:()=>new Promise(r=>release=r)});await f.controller.start();f.tick();await flush();
 const closed=f.controller.cancel(),restart=f.controller.start();assert.deepEqual(f.calls,['begin','cancel'],'cancel must reach the backend before the poll finishes');release({state:'authenticated',nickname:'不应显示'});await closed;await restart;
 assert.equal(f.states.some(s=>s.nickname==='不应显示'),false);assert.deepEqual(f.calls,['begin','cancel','begin']);
});
test('expiration stops polling and invalid QR reports a clear error',async()=>{
 const f=setup({accountPoll:async()=>({state:'expired'})});await f.controller.start();f.tick();await flush();assert.equal(f.states.at(-1).phase,'expired');f.tick();await flush();assert.equal(f.states.at(-1).phase,'expired');
 const invalid=setup({accountBegin:async()=>({image:'https://example.com/not-local.png'})});await invalid.controller.start();assert.equal(invalid.states.at(-1).phase,'error');
});
function availabilityHarness(hidden=false){
 const source=fs.readFileSync(path.join(__dirname,'../app/panel.js'),'utf8');
 const start=source.indexOf(' async function probeRows('),end=source.indexOf(' async function refreshLocal(',start);
 const hideStart=source.indexOf(' function hideSheets('),hideEnd=source.indexOf(' async function loadTab(',hideStart);
 assert.ok(start>=0&&end>start&&hideStart>=0&&hideEnd>hideStart);
 const requests=[],elements={browser:{hidden},'settings-view':{},'tasks-view':{},'lyrics-view':{}};
 const ctx={rows:[{id:'1',local:false}],tab:'search',activeDiscovery:null,availability:new Map(),availabilityRevision:0,accountProbePending:false,loadSerial:1,
  bridge:{mediaAvailability:()=>new Promise(resolve=>requests.push(resolve))},renderRows:()=>{},$:id=>elements[id]};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end)+source.slice(hideStart,hideEnd)+';globalThis.probe=probeRows;globalThis.invalidate=invalidateSongAvailability;globalThis.showBrowser=hideSheets;',ctx);
 return {ctx,requests,elements};
}
test('account change invalidates in-flight availability results before probing again',async()=>{
 const h=availabilityHarness();const old=h.ctx.probe(1);assert.equal(h.requests.length,1);h.ctx.invalidate();assert.equal(h.requests.length,2);
 h.requests[1]([{id:'1',state:'available'}]);await flush();h.requests[0]([{id:'1',state:'unavailable'}]);await old;
 assert.equal(h.ctx.availability.get('1').state,'available');
});
test('account change while settings are open probes songs on returning to the list',async()=>{
 const h=availabilityHarness(true);h.ctx.invalidate();assert.equal(h.requests.length,0);assert.equal(h.ctx.accountProbePending,true);
 h.ctx.showBrowser();assert.equal(h.requests.length,1);h.requests[0]([{id:'1',state:'available'}]);await flush();assert.equal(h.ctx.availability.get('1').state,'available');
});
