'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createNeteaseApiClient}=require('../netease_api_client');
function fixture(){const children=[];const fork=(file,args,options)=>{const child=new EventEmitter();child.connected=true;child.sent=[];child.send=(message,done)=>{child.sent.push(message);done?.(null)};child.disconnect=()=>{child.connected=false;child.emit('exit',0)};child.kill=()=>{child.connected=false};child.options=options;children.push(child);return child};return {fork,children};}
test('only allowed commands enter an IPC-only worker and results stay in main process',async()=>{
 const f=fixture(),client=createNeteaseApiClient({fork:f.fork});const previous=process.env.NETEASE_COOKIE;process.env.NETEASE_COOKIE='must-not-inherit';const promise=client.call('login_qr_key');if(previous===undefined)delete process.env.NETEASE_COOKIE;else process.env.NETEASE_COOKIE=previous;const child=f.children[0];assert.deepEqual(child.options.stdio,['ignore','ignore','ignore','ipc']);assert.equal(child.options.env.ELECTRON_RUN_AS_NODE,'1');assert.equal(child.options.env.NETEASE_COOKIE,undefined);assert.equal(child.sent[0].command,'login_qr_key');
 child.emit('message',{id:child.sent[0].id,ok:true,result:{body:{code:200}}});assert.deepEqual(await promise,{body:{code:200}});await assert.rejects(client.call('server',{port:1}),/参数无效/);await assert.rejects(client.call('song_url_v1',{id:'1',level:'standard',unblock:'true'}),/参数无效/);client.close();assert.equal(child.connected,false);
});
test('worker failure rejects concurrent requests without exposing error details and restarts on next call',async()=>{
 const f=fixture(),client=createNeteaseApiClient({fork:f.fork});const a=client.call('login_qr_key'),b=client.call('login_qr_check',{key:'abc'});const failure=Promise.allSettled([a,b]);f.children[0].emit('error',Error('sensitive credential'));const results=await failure;assert.ok(results.every(r=>r.status==='rejected'&&!r.reason.message.includes('sensitive')));
 const retry=client.call('login_qr_key');const child=f.children[1];child.emit('message',{id:child.sent[0].id,ok:false,details:'sensitive credential'});await assert.rejects(retry,e=>!e.message.includes('sensitive'));client.close();
});
test('hung requests stop worker and close rejects outstanding calls',async()=>{
 const f=fixture(),client=createNeteaseApiClient({fork:f.fork,timeoutMs:15});const request=client.call('login_qr_key');const keepAlive=setTimeout(()=>{},50);await assert.rejects(request,/连接中断/);clearTimeout(keepAlive);assert.equal(f.children[0].connected,false);const next=client.call('login_qr_key');client.close();await assert.rejects(next,/连接中断/);await assert.rejects(client.call('login_qr_key'),/已关闭/);
});
test('limits pending work and rejects malformed IDs or credentials',async()=>{
 const f=fixture(),client=createNeteaseApiClient({fork:f.fork,maxPending:1});const request=client.call('login_qr_key');await assert.rejects(client.call('login_qr_key'),/繁忙/);await assert.rejects(client.call('song_url_v1',{id:'1\n2',level:'standard'}),/参数无效/);await assert.rejects(client.call('login_status',{cookie:'x\ny'}),/参数无效/);client.close();await assert.rejects(request,/连接中断/);
});
test('worker disables redirects on the same Axios instance before loading the upstream API',async()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const source=fs.readFileSync(path.join(__dirname,'../netease_api_worker.js'),'utf8');
 const axios={defaults:{}},callbacks={},sent=[];
 const proc={stdout:null,stderr:null,connected:true,cwd:()=>'/old',chdir:()=>{},exit:()=>{},on:(event,fn)=>{callbacks[event]=fn},send:value=>sent.push(value)};
 const modules={'node:fs':{mkdtempSync:()=>'/private',rmdirSync(){}},'node:path':path,'node:os':{tmpdir:()=>'/tmp'}};
 const req=id=>{
  if(id==='axios-for-api')return axios;
  if(id==='@neteasecloudmusicapienhanced/api'){assert.equal(axios.defaults.maxRedirects,0);return {song_url_v1:async options=>{assert.equal(options.crypto,'weapi');return {body:{code:200}}}};}
  return modules[id];
 };
 req.resolve=id=>id==='axios'?'axios-for-api':'/package/main.js';
 vm.runInNewContext(source,{require:req,process:proc,console:{},Set});
 await callbacks.message({id:1,command:'song_url_v1',args:{id:'1',level:'standard',cookie:'MUSIC_U=test'}});
 assert.equal(sent[0].ok,true);
});
