'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createDiscoveryQueue}=require('../app/discovery_queue');
const song=i=>({id:String(i),key:'online:'+i,name:'歌曲 '+i});
function fixture(total,{missing=[],failOnce=null}={}){
 const calls=[];let failed=false;
 const fetchPage=async({offset,limit})=>{calls.push(offset);if(offset===failOnce&&!failed){failed=true;throw Error('断网');}return {total,tracks:Array.from({length:Math.min(limit,Math.max(0,total-offset))},(_,i)=>offset+i+1).filter(i=>!missing.includes(i)).map(song)};};
 return {fetchPage,calls};
}
test('501 songs extend at the 500 boundary and never wrap early',async()=>{
 const f=fixture(501),q=createDiscoveryQueue({fetchPage:f.fetchPage,initialOffset:496,initialRows:[497,498,499,500].map(song),selectedKey:'online:500'});
 assert.equal((await q.initialize()).length,500);const rows=await q.extend(1);assert.equal(rows.length,501);assert.equal(rows[500].key,'online:501');assert.deepEqual(f.calls,[0,500]);
});
test('starting in the middle extends in both directions and wraps only after filling gaps',async()=>{
 const f=fixture(1200),q=createDiscoveryQueue({fetchPage:f.fetchPage,initialOffset:696,initialRows:[697,698,699,700].map(song),selectedKey:'online:700'});
 assert.equal((await q.initialize())[0].key,'online:501');assert.equal((await q.extend(1)).at(-1).key,'online:1200');
 const wrapped=await q.extend(1);assert.equal(wrapped[0].key,'online:1');assert.equal(wrapped.at(-1).key,'online:1200');assert.deepEqual(f.calls,[500,1000,0]);
 const reverse=fixture(1200),q2=createDiscoveryQueue({fetchPage:reverse.fetchPage,initialOffset:696,initialRows:[song(700)],selectedKey:'online:700'});
 await q2.initialize();await q2.extend(-1);const back=await q2.extend(-1);assert.equal(back[0].key,'online:1');assert.equal(back.at(-1).key,'online:1200');assert.deepEqual(reverse.calls,[500,0,1000]);
});
test('missing metadata keeps current selected song and later offsets use limit, not returned count',async()=>{
 const f=fixture(501,{missing:[499,500]}),q=createDiscoveryQueue({fetchPage:f.fetchPage,initialOffset:496,initialRows:[497,498,499,500].map(song),selectedKey:'online:500'});
 const initial=await q.initialize();assert.deepEqual(initial.slice(-4).map(x=>x.key),['online:497','online:498','online:499','online:500']);
 const rows=await q.extend(1);assert.equal(rows.at(-1).key,'online:501');assert.deepEqual(f.calls,[0,500]);
});
test('failed chunks throw and can be retried without duplicate or missing songs',async()=>{
 const f=fixture(501,{failOnce:500}),q=createDiscoveryQueue({fetchPage:f.fetchPage,initialOffset:0,initialRows:[song(1)],selectedKey:'online:1'});
 await q.initialize();await assert.rejects(q.extend(1),/断网/);const rows=await q.extend(1);assert.equal(rows.length,501);assert.equal(new Set(rows.map(x=>x.key)).size,501);assert.deepEqual(f.calls,[0,500,500]);
});
test('a visible page straddling chunk boundary starts from the selected song chunk',async()=>{
 const f=fixture(1001),q=createDiscoveryQueue({fetchPage:f.fetchPage,initialOffset:496,initialRows:[497,498,499,500,501,502,503,504].map(song),selectedKey:'online:501'});
 const initial=await q.initialize();assert.equal(f.calls[0],500);assert.deepEqual(initial.slice(0,8).map(s=>s.key),[497,498,499,500,501,502,503,504].map(i=>'online:'+i));
 const previous=await q.extend(-1);assert.equal(previous[0].key,'online:1');assert.deepEqual(f.calls,[500,0]);
});
test('selected track absent from a partial API response can be supplied explicitly',async()=>{
 const f=fixture(500,{missing:[123]}),q=createDiscoveryQueue({fetchPage:f.fetchPage,initialOffset:120,initialRows:[],selectedKey:'online:123',selectedRow:song(123)});
 assert.ok((await q.initialize()).some(row=>row.key==='online:123'));
 const q2=createDiscoveryQueue({fetchPage:f.fetchPage,initialOffset:120,initialRows:[],selectedKey:'online:123'});
 await assert.rejects(q2.initialize(),/保留现有播放队列/);
});
test('an initial partial response missing the selected track can be retried',async()=>{
 let calls=0;const q=createDiscoveryQueue({fetchPage:async()=>({total:1,tracks:++calls===1?[]:[song(1)]}),initialRows:[],selectedKey:'online:1'});
 await assert.rejects(q.initialize(),/保留现有播放队列/);assert.equal((await q.initialize())[0].key,'online:1');assert.equal(calls,2);
});
