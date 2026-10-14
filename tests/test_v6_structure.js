'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const get=p=>fs.readFileSync(path.join(root,p),'utf8');
test('first run presents disclaimer only; paths are edited in settings',()=>{
 const html=get('app/index.html'),main=get('main.js'),renderer=get('app/renderer.js');
 for(const id of ['first-run','agree-disclaimer','first-confirm','download-dir'])assert.ok(html.includes(`id="${id}"`),id);
 for(const id of ['first-download-dir','first-favorites-dir'])assert.ok(!html.includes(`id="${id}"`),id);
 assert.match(main,/disclaimerAcceptedVersion/);assert.match(renderer,/if\(!state\.settings\.disclaimerAcceptedVersion\)openFirstRun/);
});
test('external lyric window, downloads and immersive player are wired',()=>{
 for(const name of ['floating-preload.js','app/floating-lyrics.html','app/floating-lyrics.css','app/floating-lyrics.js','app/immersive.css'])assert.ok(fs.existsSync(path.join(root,name)),name);
 const html=get('app/index.html'),main=get('main.js'),renderer=get('app/renderer.js');
 for(const id of ['task-list','immersive-player','immersive-lyrics','open-immersive','page-next','desktop-lyrics-enabled','lyrics-shortcut'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(get('floating_window.js'),/setIgnoreMouseEvents/);
 assert.match(main,/ipcMain\.handle\('playlists:add'/);
 assert.match(renderer,/requestAnimationFrame\(lyricClock\)/);
 assert.match(main,/download:cancel/);
});
