'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs'),path=require('node:path');
const {createMuoniumApiClient}=require('../muonium_api_client'),{createNeteaseService}=require('../netease_service');
test('owned deletion passes the actual packaged pipe whitelist with its authenticated request',async()=>{
 const sent=[];let launches=0;
 const directory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'playlist-pipe-'));
 fs.mkdirSync(path.join(directory,'runtime/bin'),{recursive:true});fs.writeFileSync(path.join(directory,'runtime/bin/java.exe'),'fixture only');fs.copyFileSync(path.join(__dirname,'../upstream/muonium/endpoints.json'),path.join(directory,'endpoints.json'));
 const client=createMuoniumApiClient({directory,spawnImpl:()=>{
  launches++;const proc=new EventEmitter();proc.stdout=new EventEmitter();proc.stdout.setEncoding=()=>{};proc.kill=()=>{};
  proc.stdin={write:(line,cb)=>{const data=JSON.parse(line);sent.push(data);queueMicrotask(()=>{proc.stdout.emit('data',JSON.stringify({id:data.id,ok:true,body:{code:200}})+'\n');cb?.();});}};return proc;
 }});
 try{
  const service=createNeteaseService({client,accountRequest:(endpoint,params)=>client.call(endpoint,params,'fixture-session')});
  await service.request('deletePlaylist',{id:'12345678901'});
  assert.equal(launches,1);assert.equal(sent.length,1);assert.equal(sent[0].path,'/weapi/playlist/remove');assert.deepEqual(sent[0].params,{ids:'[12345678901]'});assert.equal(sent[0].cookie,'fixture-session');
  await assert.rejects(()=>client.call('/weapi/arbitrary/delete',{},'fixture-session'),/参数无效/);assert.equal(sent.length,1);
  const shipped=JSON.parse(fs.readFileSync(path.join(directory,'endpoints.json'),'utf8')),source=JSON.parse(fs.readFileSync(path.join(__dirname,'../upstream/muonium/endpoints.json'),'utf8'));
  assert.ok(source.paths.includes(sent[0].path));assert.deepEqual(shipped,source,'JVM and JS must load the same checked-in whitelist');
 }finally{client.close();fs.rmSync(directory,{recursive:true,force:true});}
});
