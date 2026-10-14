'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const get=p=>fs.readFileSync(path.join(root,p),'utf8');
test('first-run setup includes independent paths, acknowledgement, and saved completion',()=>{
 const html=get('app/index.html'),main=get('main.js'),renderer=get('app/renderer.js');
 for(const id of ['first-run','first-download-dir','first-favorites-dir','agree-disclaimer','first-confirm','favorites-dir'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(main,/setupCompleted/);assert.match(main,/favoritesDir/);assert.match(renderer,/if\(!state\.settings\.setupCompleted\)openFirstRun\(false\)/);
});
test('independent lyric window, player controls, downloads page, and streaming fallback exist',()=>{
 for(const name of ['floating-preload.js','app/floating-lyrics.html','app/floating-lyrics.css','app/floating-lyrics.js'])assert.ok(fs.existsSync(path.join(root,name)),name);
 const html=get('app/index.html'),main=get('main.js'),renderer=get('app/renderer.js');
 for(const id of ['view-tasks','task-list','toggle-floating','unlock-floating','toggle-immersive','page-next'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(get('floating_window.js'),/setIgnoreMouseEvents/);
 assert.match(main,/ipcMain\.handle\('music:stream'/);
 assert.match(renderer,/bridge\.prepareAudio\(id\)/);
 assert.match(main,/download:cancel/);
});
