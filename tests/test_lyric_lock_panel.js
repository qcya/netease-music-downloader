'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/panel.js'),'utf8');
function harness(lock){
 const start=source.indexOf(' let lyricLockDesired='),end=source.indexOf(" $('settings-button').onclick",start);
 assert.ok(start>=0&&end>start,'panel must wire an immediate lyric-lock controller');
 const checkbox={checked:false};let listener;const messages=[];
 const ctx={settings:{floatingLyrics:{mouseThrough:false}},bridge:{lockFloatingLyrics:lock,onFloatingLyricsLockStatus:fn=>{listener=fn}},$:()=>checkbox,status:(...x)=>messages.push(x)};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 return {ctx,checkbox,messages,notify:value=>listener({locked:value})};
}
test('lock checkbox applies immediately, serializes rapid changes, and follows external lock events',async()=>{
 let resolve;const calls=[];const h=harness(v=>{calls.push(v);return calls.length===1?new Promise(r=>resolve=r):Promise.resolve({locked:v});});
 h.checkbox.checked=true;h.checkbox.onchange();assert.deepEqual(calls,[true]);
 h.checkbox.checked=false;h.checkbox.onchange();h.notify(true);assert.equal(h.checkbox.checked,false);
 resolve({locked:true});await new Promise(r=>setImmediate(r));assert.deepEqual(calls,[true,false]);
 h.notify(true);assert.equal(h.checkbox.checked,true);assert.equal(h.ctx.settings.floatingLyrics.mouseThrough,true);
});
test('failed lock restores the last confirmed state and reports the error',async()=>{
 const h=harness(()=>Promise.reject(Error('失败')));h.checkbox.checked=true;h.checkbox.onchange();await new Promise(r=>setImmediate(r));
 assert.equal(h.checkbox.checked,false);assert.equal(h.ctx.settings.floatingLyrics.mouseThrough,false);assert.match(h.messages.at(-1)[0],/失败/);
});
