'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createNeteaseService}=require('../netease_service');
test('all exposed NetEase operations use checked-in upstream endpoint contracts',async()=>{
 const paths=new Set(JSON.parse(fs.readFileSync(path.join(__dirname,'../upstream/muonium/endpoints.json'))).paths),calls=[];
 const client={call:async(endpoint,params)=>{assert.ok(paths.has(endpoint)||/^\/weapi\/v1\/album\/\d+$/.test(endpoint),endpoint);calls.push({endpoint,params});return {body:{code:200,id:789}};}};
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../upstream/muonium/endpoints.json'))),methods=new Set(manifest.features.map(x=>x.method));
 client.invoke=async(method,args)=>{assert.ok(methods.has(method),method);assert.ok(Array.isArray(args));calls.push({method,args});return {body:{code:200}};};
 const service=createNeteaseService({client,accountRequest:(p,a,b)=>b?client.invoke(...b):client.call(p,a)});
 for(const op of service.operations)await service.request(op,{id:'123',ids:['123'],uid:'456',keyword:'YELLOW',name:'新建歌单',room:'room_123',inviter:'456',songId:'123',command:'PLAY'});
 assert.equal(calls.length,service.operations.length);
 await assert.rejects(()=>service.request('playlist',{id:'https://evil.test'}),/编号/);
 await assert.rejects(()=>service.request('arbitraryCommand'),/操作/);
});

test('owned playlist deletion uses authenticated remove contract and validates IDs',async()=>{
 const calls=[],service=createNeteaseService({client:{call(){throw Error('must require authentication')}},accountRequest:async(endpoint,params)=>{calls.push({endpoint,params});return {body:{code:200}};}});
 await service.request('deletePlaylist',{id:'123'});assert.deepEqual(calls,[{endpoint:'/weapi/playlist/remove',params:{ids:'[123]'}}]);assert.equal(service.isWrite('deletePlaylist'),true);
 await assert.rejects(()=>service.request('deletePlaylist',{id:'../123'}),/编号/);
});
test('account credential responses are stripped and auth failures stay failures',async()=>{
 const service=createNeteaseService({client:{call:async()=>({body:{code:200,cookie:'private',nested:{accessToken:'private',name:'ok'}}})},accountRequest:async()=>({body:{code:301}})});
 assert.deepEqual(await service.request('hot'),{code:200,nested:{name:'ok'}});
 await assert.rejects(()=>service.request('dailySongs'),/登录/);
});
