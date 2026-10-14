'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const src=p=>fs.readFileSync(path.join(root,p),'utf8');

test('immersive mode covers all desktop space and never reserves a bottom white player bar',()=>{
 const css=src('app/immersive.css');
 assert.match(css,/#immersive-player\{position:fixed;inset:0;/);
 assert.match(css,/body\.immersive-open \.player-dock\{display:none!important\}/);
 assert.doesNotMatch(css,/inset:0 0 94px/);
 const html=src('app/index.html');
 for(const id of ['immersive-toggle','immersive-seek','immersive-volume','immersive-duration','immersive-current'])assert.match(html,new RegExp(`id="${id}"`));
 const js=src('app/renderer.js');
 assert.match(js,/event\.key==='Escape'/);
 assert.match(js,/immersive-toggle/);
});

test('floating lyrics window has no header and transparent chrome',()=>{
 const js=src('floating_window.js');
 assert.match(js,/frame:false,transparent:true,hasShadow:false,thickFrame:false/);
 const html=src('app/floating-lyrics.html');
 assert.doesNotMatch(html,/class="bar"|class="header"/);
 const css=src('app/floating-lyrics.css');
 assert.match(css,/\.widget\[data-background="none"\].*background:rgba\(0,0,0,0\)/);
});

test('desktop lyric toggle and registered shortcut status exist',()=>{
 const html=src('app/index.html');
 for(const id of ['toggle-desktop-lyrics','desktop-lyrics-button-text','lyrics-shortcut-status'])assert.match(html,new RegExp(`id="${id}"`));
});

test('downloaded songs get source album art asynchronously without delaying audio',()=>{
 const js=src('app/renderer.js');
 const preload=src('preload.js');
 const main=src('main.js');
 assert.match(preload,/songInfo: id => ipcRenderer.invoke\('music:song-info',id\)/);
 assert.match(main,/ipcMain.handle\('music:song-info'/);
 assert.match(js,/void enrichLocalMetadata\(id,token\)/);
 assert.match(js,/renderImmersiveInfo\(state.playerInfo\)/);
 assert.match(src('app/index.html'),/id="player-cover-art"/);
});

test('local dynamically supplied Lemon video is optional, never required by Git repository',()=>{
 const main=src('main.js'),ignore=src('.gitignore');
 assert.match(main,/assets','immersive-background.mp4'/);
 assert.match(ignore,/assets\/immersive-background\.mp4/);
});
