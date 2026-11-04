'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../app/fullscreen.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function load(background,fallback,{rejectPreferences=false}={}){
 const nodes=new Map();
 function node(id){if(!nodes.has(id))nodes.set(id,{id,hidden:true,style:{},classList:{toggle(){}},addEventListener(){},pause(){},play(){return Promise.resolve();}});return nodes.get(id);}
 const document={body:node('body'),documentElement:{style:{setProperty(){}}},getElementById:node,addEventListener(){}};
 const lyrics={originalColor:'#fff',translationColor:'#fff',glow:14,shadow:2,fontSize:30,translationSize:18,lineHeight:1.28,align:'center',showOriginal:true,showTranslation:true};
 const fullscreenBridge={preferences:()=>rejectPreferences?Promise.reject(Error('error')):Promise.resolve({background,fallback,lyrics}),control(){},onState(){}};
 vm.runInNewContext(code,{document,window:{fullscreenBridge,addEventListener(){}},matchMedia:()=>({matches:false}),setTimeout,clearTimeout,console});
 await tick();return {node,document};
}
const original={kind:'video',url:'file:///original.mp4'};
test('missing or failed custom backgrounds fall back to the original video',async()=>{
 for(const background of [{kind:'missing'},{kind:'image',url:'file:///missing.jpg'},{kind:'video',url:'file:///bad.mp4'}]){
  const {node,document}=await load(background,original);
  if(background.kind==='image')node('background-image').onerror();
  if(background.kind==='video')node('background-video').onerror();
  await tick();assert.equal(node('background-video').src,original.url);assert.equal(node('background-video').hidden,false);
  assert.equal(node('background-image').hidden,true);assert.match(node('background-status').textContent,/原版背景/);assert.equal(document.body.style.backgroundColor,'#172438');
 }
});
test('failed default background or settings leaves readable dark background without a retry loop',async()=>{
 const {node,document}=await load(original,original);node('background-video').onerror();await tick();
 assert.equal(node('background-video').hidden,true);assert.match(node('background-status').textContent,/暂时不可用/);assert.equal(document.body.style.backgroundColor,'#172438');
 const other=await load(null,null,{rejectPreferences:true});assert.equal(other.document.body.style.backgroundColor,'#172438');assert.match(other.node('background-status').textContent,/读取失败/);
});
