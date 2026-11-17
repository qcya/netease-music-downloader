const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events');
test('native light/heavy modes keep full blur contribution, unchanged window opacity and dispose cleanly',()=>{
 const calls=[],module={exports:{}},window=new EventEmitter();window.getBounds=()=>({width:600,height:400});window.getNativeWindowHandle=()=>Buffer.from([1,0,0,0,0,0,0,0]);
 const k={load:()=>({func:sig=>sig.includes('PlayerBlurAttach')?(...args)=>{calls.push(args);return 0;}:()=>{}})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../native_blur.js'),'utf8'),{module,Buffer,__dirname:path.join(__dirname,'..'),process:{platform:'win32'},require:name=>name==='koffi'?k:name==='electron'?{app:{isPackaged:false}}:name==='./player_theme'?require('../player_theme'):name==='./app/window-shape'?require('../app/window-shape'):require(name)});
 for(const theme of ['transparent','blurred','dark']){const dispose=module.exports.attachNeutralBlur(window,{theme});assert.equal(calls.at(-1)[5],1,'never mix the sharp desktop back into the blur or fade the whole HWND');dispose();dispose();assert.equal(window.listenerCount('resize'),0);}
 assert.deepEqual(calls.map(c=>c[4]),[4,4,4]);assert.ok(calls.every(c=>c[3]===require('../app/window-shape').radius),'foreground and native blur must use the same shared DIP corner');
});
