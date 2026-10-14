'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
const {parseLrc,splitBilingual}=require('../app/lrc.js');
test('inline Han translation is extracted only from non-Chinese main lyric',()=>{
 const lines=parseLrc('[00:01.00]迎えたくはないな1秒前（不想接受事实的1秒前）\n[00:05.00]你好（世界）');
 assert.deepEqual(lines.map(x=>[x.text,x.translation]),[['迎えたくはないな1秒前','不想接受事实的1秒前'],['你好（世界）','']]);
 assert.deepEqual(splitBilingual('I love you (我爱你)'),{original:'I love you',translation:'我爱你'});
 const external=parseLrc('[00:02.00]好きです（喜欢你）','[00:02.00]我喜欢你');
 assert.equal(external[0].translation,'我喜欢你');
});
test('immersive title is not squeezed alongside a decorative record',()=>{
 const html=read('app/index.html'),css=read('app/immersive.css'),js=read('app/renderer.js');
 assert.match(html,/id="immersive-title-extra"/);assert.doesNotMatch(html,/immersive-record/);
 assert.match(css,/\.immersive-layout\{[^}]*flex-direction:column/);
 assert.match(js,/function splitLongTitle/);
 assert.match(js,/immersive-toggle'\)\.innerHTML=icon/);
 assert.doesNotMatch(js,/\.textContent=.*'Ⅱ'/);
});
test('download list collapses and hides when empty',()=>{
 const html=read('app/index.html'),css=read('app/immersive.css'),js=read('app/renderer.js');
 assert.match(html,/<details id="local-downloads"/);assert.match(css,/\.local-downloads\[hidden\]/);
 assert.match(js,/holder\.hidden=rows\.length===0/);
});
test('floating lyrics remains draggable only when unlocked; lock is click-through and cannot be right-click unlocked',()=>{
 const js=read('floating_window.js'),renderer=read('app/floating-lyrics.js'),main=read('main.js');
 assert.match(js,/setIgnoreMouseEvents\(locked,\{forward:true\}\)/);
 assert.match(js,/if\(!exists\(\)\|\|locked\)return false/);
 assert.match(renderer,/contextmenu/);assert.match(renderer,/dragBegin/);
 assert.doesNotMatch(main,/globalShortcut/);
});

test('user-selected background video is copied into durable application data',()=>{
 const main=read('main.js'),renderer=read('app/renderer.js');
 assert.match(main,/player-backgrounds/);
 assert.match(main,/fs\.promises\.copyFile\(file,installed\)/);
 assert.match(main,/kind:explicit\?'missing':'default'/);
 assert.match(renderer,/H\.264 MP4/);
});
