'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {seekTime}=require('../app/lyric_navigation.js');
const read=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
test('click navigation respects actual LRC timestamps and clamps only beyond track duration',()=>{
 assert.equal(seekTime(73.245,210),73.245);
 assert.equal(seekTime(3.2,210),3.2);
 assert.equal(seekTime(300,210),209.99);
 assert.equal(seekTime(180,NaN),180);
 for(const v of [NaN,Infinity,-1,undefined,null,'73.2'])assert.equal(seekTime(v,210),null);
});
test('immersive lyrics enable mouse drag without changing playback time',()=>{
 const script=read('app/renderer.js');const css=read('app/immersive.css');
 assert.match(script,/function enableLyricBrowsing/);
 assert.match(script,/pane\.scrollTop=d\.startScroll\+d\.y-e\.clientY/);
 assert.match(script,/el\.addEventListener\('click',\(\)=>seekLyricLine\(i\)\)/);
 assert.match(script,/manualLyricScrollUntil/);
 assert.match(css,/cursor:grab/);
});
