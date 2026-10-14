'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {seekTime,inertiaStep}=require('../app/lyric_navigation.js');
const read=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
test('click navigation respects actual LRC timestamps and clamps only beyond track duration',()=>{
 assert.equal(seekTime(73.245,210),73.245);
 assert.equal(seekTime(3.2,210),3.2);
 assert.equal(seekTime(210.5,210),209.99);
 assert.equal(seekTime(300,210),null); // never jump to a nonsense clamped position
 assert.equal(seekTime(90,1),null); // corrupt duration must not send every click to 0.99s
 assert.equal(seekTime(180,NaN),180);
 for(const v of [NaN,Infinity,-1,undefined,null,'73.2'])assert.equal(seekTime(v,210),null);
});
test('immersive lyrics enable mouse drag without changing playback time',()=>{
 const script=read('app/renderer.js');const css=read('app/immersive.css');
 assert.match(script,/function enableLyricBrowsing/);
 assert.match(script,/pane\.scrollTop\+=delta/);
 assert.match(script,/beginLyricGlide/);
 assert.match(script,/media\.currentTime=target/);
 assert.match(script,/原来选定的动态背景文件已丢失/);
 assert.match(script,/el\.addEventListener\('click',\(\)=>seekLyricLine\(i\)\)/);
 assert.match(script,/manualLyricScrollUntil/);
 assert.match(css,/cursor:grab/);
 assert.match(css,/scroll-behavior:auto/);
 assert.doesNotMatch(css,/scroll-behavior:smooth/);
});

test('inertial lyric drag coasts and decays smoothly',()=>{
 const first=inertiaStep(2,16),next=inertiaStep(first.velocity,16);
 assert.ok(first.pixels>0&&next.pixels>0&&first.velocity<2&&next.velocity<first.velocity);
 assert.equal(inertiaStep(2,0).pixels,0);
 assert.equal(inertiaStep(-2,16).pixels,-32);
});
