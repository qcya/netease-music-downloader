'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs');
const http=require('node:http');
const Module=require('node:module');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'netease-parallel-'));
process.env.MUSIC_PYTHON_EXE=process.env.MUSIC_PYTHON_EXE||'/opt/pyvenv/bin/python';
const handlers=new Map(); const updates=[];
class Window {
  constructor(){this.webContents={send:(channel,obj)=>updates.push({channel,obj}),on(){},setWindowOpenHandler(){}};}
  loadFile(){} once(evt,cb){if(evt==='ready-to-show')cb()} show(){} isDestroyed(){return false} setAppDetails(){} setIcon(){}
  static getAllWindows(){return []}
}
const fake={
  app:{isPackaged:false,getPath:k=>path.join(tmp,k),setAppUserModelId(){},whenReady:async()=>{},on(){},quit(){}},
  BrowserWindow:Window, ipcMain:{handle:(key,cb)=>handlers.set(key,cb)},
  dialog:{showOpenDialog:async()=>({canceled:true,filePaths:[]})},
  shell:{openPath:async()=>'',openExternal:async()=>true},
  protocol:{registerSchemesAsPrivileged(){},handle(){}}
};
const native=Module._load;
Module._load=function(name,parent,isMain){return name==='electron'?fake:native.call(this,name,parent,isMain)};
require('../main.js');Module._load=native;
let active=0,peak=0,requests=0;
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  const id=u.searchParams.get('id')||u.searchParams.get('ids')||'1000';
  const song={id:Number(id),name:'音乐'+id,ar:[{name:'测试歌手'}],al:{name:'专辑'}};
  const json=x=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(x));};
  if(u.pathname==='/song/detail')return json({code:200,songs:[song]});
  if(u.pathname==='/search')return json({code:200,result:{songs:[song],songCount:1}});
  if(u.pathname==='/song/url/v1')return json({code:200,data:[{url:`http://127.0.0.1:${server.address().port}/audio/${id}.flac`,level:'lossless',freeTrialInfo:null,br:1400000}]});
  if(u.pathname.startsWith('/audio/')) {
    requests++;active++;peak=Math.max(peak,active);
    setTimeout(()=>{res.writeHead(200,{'Content-Type':'application/octet-stream'});res.end(Buffer.concat([Buffer.from('fLaC'),Buffer.alloc(4096)]));active--;},360);
    return;
  }
  res.statusCode=404;res.end('missing');
});
const invoke=(name,...args)=>handlers.get(name)(null,...args);
test('real Electron IPC + Python downloads at most three distinct songs concurrently, search still works',async t=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>{server.close();fs.rmSync(tmp,{recursive:true,force:true})});
  for(let i=0;i<50&&!handlers.has('music:download');i++)await new Promise(r=>setTimeout(r,10));
  const destination=path.join(tmp,'downloads');
  await invoke('settings:set',{downloadDir:destination,quality:'lossless',apiBases:[`http://127.0.0.1:${server.address().port}`]});
  const primary=invoke('music:download',['1001','1002','1003','1004','1005','1006','1007']);
  const duplicate=invoke('music:download',['1001']);
  const search=await invoke('music:search','任意歌曲');
  assert.equal(search.results.length,1);
  const [batch,duplicateResult]=await Promise.all([primary,duplicate]);
  assert.equal(batch.success_count,7,JSON.stringify(batch));
  assert.equal(duplicateResult.success_count,1);
  assert.ok(peak>=2,`should be concurrent, peak=${peak}`);
  assert.ok(peak<=3,`limit exceeded: peak=${peak}`);
  assert.equal(requests,7,'duplicate ID should only download once');
  assert.equal(fs.readdirSync(destination).filter(n=>n.endsWith('.flac')).length,7);
  assert.ok(updates.some(e=>e.channel==='download:task'&&e.obj.status==='queued'));
  assert.ok(updates.some(e=>e.channel==='download:task'&&e.obj.status==='running'));
  assert.ok(updates.some(e=>e.channel==='download:task'&&e.obj.status==='completed'));
});
