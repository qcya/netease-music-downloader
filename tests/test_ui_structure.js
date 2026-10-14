'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'app','index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'app','style.css'),'utf8');
const js=fs.readFileSync(path.join(root,'app','renderer.js'),'utf8');
test('HTML controls are present and the desktop player is download-first',()=>{
  for(const id of ['search-input','search-action','songs','download-selected','playlist-input','view-home','view-playlists','view-local','view-settings','download-dir','save-settings','local-list','open-folder','python-label','player-dock','music-audio','player-toggle','player-seek','player-volume','cache-limit','parallel-downloads','download-activity','cache-stats','clear-cache','my-playlist-tracks','immersive-player','open-immersive','immersive-lyrics','first-run','agree-disclaimer']){
    assert.match(html,new RegExp(`id="${id}"`),id);
  }
  for(const removed of ['toggle-lyrics','toggle-floating','unlock-floating','first-download-dir','first-favorites-dir','local-tasks','local-favorites','quality','favorites-dir'])assert.doesNotMatch(html,new RegExp(`id="${removed}"`),removed);
  assert.match(html,/lang="zh-CN"/);
  assert.match(html,/assets\/avatar.png/);
  assert.match(css,/box-shadow:/);
  assert.match(js,/bridge\.search/);
  assert.match(js,/bridge\.download/);
  assert.match(js,/bridge\.fetchLyrics/);
  assert.match(js,/playlistsList/);
  assert.doesNotMatch(js,/const favorite=node\(/);
  assert.match(html,/src="lrc.js"/);
});
test('ico file includes a 256px frame and is not a Python default icon',()=>{
  const ico=fs.readFileSync(path.join(root,'assets','app.ico'));
  assert.equal(ico.readUInt16LE(0),0);
  assert.equal(ico.readUInt16LE(2),1);
  const n=ico.readUInt16LE(4);
  assert.ok(n>=6);
  let has256=false;
  for(let i=0;i<n;i++){
    if (ico[6+i*16]===0 && ico[6+i*16+1]===0) has256=true;
  }
  assert.ok(has256);
  const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  assert.equal(packageJson.build.win.icon,'assets/app.ico');
  assert.equal(packageJson.build.win.executableName,'MusicDownloader');
});
