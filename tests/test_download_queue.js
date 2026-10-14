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

test('pause/resume preserves queue order',async()=>{
  const seen=[];const pool=createDownloadQueue({limit:1});
  pool.setPaused(true);
  const promises=[0,1,2].map(i=>pool.enqueue('paused-'+i,{id:String(i)},async()=>{seen.push(i);return {ok:true}}));
  assert.equal(pool.snapshot().waiting,3);
  assert.equal(pool.snapshot().active,0);
  pool.setPaused(false);
  await Promise.all(promises);
  assert.deepEqual(seen,[0,1,2]);
});

test('cancel queued task does not start it',async()=>{
  const pool=createDownloadQueue({limit:1});
  const first=pool.enqueue('first',{id:'1'},async()=>{await sleep(35);return {ok:true}});
  let started=false;
  const second=pool.enqueue('second',{id:'2'},async()=>{started=true;return {ok:true}});
  assert.equal(pool.cancelSong('2'),1);
  assert.equal((await second).status,'cancelled');
  await first;
  assert.equal(started,false);
});

test('cancel running task passes abort signal to action',async()=>{
  const pool=createDownloadQueue({limit:1});
  const promise=pool.enqueue('running',{id:'100'},signal=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
  }));
  assert.equal(pool.cancelSong('100'),1);
  assert.equal((await promise).status,'cancelled');
  await sleep(4);assert.equal(pool.snapshot().active,0);
});
