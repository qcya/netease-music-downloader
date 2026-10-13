'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDownloadQueue}=require('../download_queue');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('bounded concurrency: exactly 3 active, remaining songs queued',async()=>{
  let running=0,peak=0;
  const events=[];
  const pool=createDownloadQueue({limit:3,onState:e=>events.push(e)});
  const tasks=Array.from({length:9},(_,i)=>pool.enqueue('song-'+i,{id:String(i),purpose:'download'},async()=>{
    running++;peak=Math.max(peak,running);
    await sleep(30);
    running--;
    return {ok:true,id:i};
  }));
  assert.equal(pool.snapshot().active,3);
  assert.equal(pool.snapshot().waiting,6);
  const rows=await Promise.all(tasks);
  assert.equal(rows.length,9);
  assert.equal(peak,3);
  await sleep(5);
  assert.equal(pool.snapshot().active,0);
  assert.equal(pool.snapshot().waiting,0);
  assert.equal(events.filter(e=>e.status==='completed').length,9);
  assert.ok(events.some(e=>e.status==='queued'));
});

test('duplicate clicks reuse the same download and failures do not block queue',async()=>{
  let count=0;
  const pool=createDownloadQueue({limit:2});
  const action=async()=>{count++;await sleep(15);return {ok:true};};
  const a=pool.enqueue('dir\\0id100',{id:'100'},action);
  const b=pool.enqueue('dir\\0id100',{id:'100'},action);
  assert.strictEqual(a,b);
  const failed=pool.enqueue('dir\\0id101',{id:'101'},async()=>{throw new Error('网络中断');});
  const next=pool.enqueue('dir\\0id102',{id:'102'},action);
  assert.equal((await Promise.allSettled([a,b,failed,next])).filter(e=>e.status==='fulfilled').length,3);
  assert.equal(count,2);
  const again=await pool.enqueue('dir\\0id100',{id:'100'},action);
  assert.equal(again.ok,true);
  assert.equal(count,3);
});

test('changing concurrency limit affects subsequent queued tasks without interrupting active downloads',async()=>{
  const pool=createDownloadQueue({limit:1});
  let active=0,peak=0;
  const tasks=Array.from({length:4},(_,i)=>pool.enqueue('q'+i,{id:String(i)},async()=>{
    active++;peak=Math.max(peak,active);await sleep(25);active--;return {ok:true};
  }));
  assert.equal(pool.snapshot().active,1);
  pool.setLimit(3);
  assert.equal(pool.snapshot().active,3);
  await Promise.all(tasks);
  assert.equal(peak,3);
});
