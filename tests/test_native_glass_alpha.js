'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function nativeFixture(alphaSupported=true){
 const calls=[],state={style:0x80000000,nc:0,margins:[-1,-1,-1,-1],alpha:false,accent:0};
 const api={
  GetWindowLongW:()=>state.style,SetWindowLongW:(_h,_i,v)=>{state.style=v;return 0;},SetWindowPos:()=>1,
  DwmSetWindowAttribute:(_h,n,b)=>{calls.push({attribute:n,value:b.readInt32LE()});if(n===39){if(!alphaSupported)return -2147024809;state.alpha=b.readInt32LE()===1;}if(n===2)state.nc=b.readInt32LE();return 0;},
  DwmExtendFrameIntoClientArea:(_h,b)=>{state.margins=[0,4,8,12].map(i=>b.readInt32LE(i));return 0;},
  SetWindowCompositionAttribute:(_h,data)=>{state.accent=data.data.readInt32LE();return 1;}
 };
 const koffi={struct:()=>{},load:()=>({func:signature=>{const name=signature.match(/__stdcall (\w+)/)[1];assert.ok(api[name],name);return api[name];}})};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../native_glass.js'),'utf8'),{module,exports:module.exports,process:{platform:'win32'},Buffer,require:name=>{assert.equal(name,'koffi');return koffi;}});
 return {state,calls,apply:module.exports.applyGlass,window:{getNativeWindowHandle:()=>Buffer.from([1,0,0,0,0,0,0,0])}};
}
test('untinted native client retains its bitmap alpha for both clear foreground and blur host',()=>{
 for(const blur of [false,true]){
  const f=nativeFixture();f.apply(f.window,{blur});
  assert.ok(f.state.alpha,'disabling non-client rendering without preserving redirection alpha makes transparent pixels opaque black');
  assert.equal(f.state.nc,1);assert.equal(f.state.accent,0,'accent materials must not tint the client');
 }
});
test('older Windows keeps Chromium full-frame transparency instead of selecting an unsupported black client',()=>{
 const f=nativeFixture(false);f.apply(f.window,{blur:true});
 assert.equal(f.state.style&0x00c40000,0);assert.equal(f.state.nc,0);
 assert.deepEqual(f.state.margins,[-1,-1,-1,-1]);assert.equal(f.state.accent,0);
});
test('custom rounded surface has no second system frame or mismatched system arc',()=>{
 const f=nativeFixture();f.apply(f.window);
 assert.equal(f.state.style&0x00c40000,0,'system thick frame creates an extra outer outline');
 assert.equal(f.calls.findLast(c=>c.attribute===33).value,1,'the renderer and Composition own the same radius; DWM must not add its small arc');
 assert.equal(f.calls.findLast(c=>c.attribute===34).value,-2,'system border color must stay disabled');
});

test('DWM rounding never restores the system caption during mixed-DPI frame recalculation',()=>{
 const f=nativeFixture();f.apply(f.window);
 assert.equal(f.state.style&0x00c00000,0,'WS_CAPTION permits Windows to paint a legacy title strip');
 assert.equal(f.state.style&0x00040000,0,'custom corners must not restore a second system frame');
 f.state.style|=0x00c00000;f.apply(f.window);
 assert.equal(f.state.style&0x00c00000,0,'reapplying material must also remove an existing caption');
});
