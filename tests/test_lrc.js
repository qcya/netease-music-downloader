'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parseLrc}=require('../app/lrc.js');
test('LRC multi-timestamps, translation and milliseconds',()=>{
 const rows=parseLrc('[ar:洛天依]\n[00:01.25][00:03.5]第一句\n[00:06.003]第二句','[00:01.25]Translated');
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(x=>x.time),[1.25,3.5,6.003]);
 assert.equal(rows[0].translation,'Translated');
 assert.equal(rows[1].translation,'');
 assert.equal(rows[2].text,'第二句');
});
test('LRC offset and no timeline',()=>{
 assert.equal(parseLrc('普通歌词')[0],undefined);
 assert.equal(parseLrc('[offset:500]\n[00:01.00]歌词')[0].time,1.5);
});
