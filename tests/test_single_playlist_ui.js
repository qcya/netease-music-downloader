'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('single playlist replaces broken multiple-playlist creation UI',()=>{
 const html=read('app/index.html'),js=read('app/renderer.js'),backend=read('main.js');
 assert.doesNotMatch(html,/id="create-playlist"|id="playlist-select"/);
 assert.match(html,/id="my-playlist-tracks"/);
 assert.match(js,/playlistsAdd\('default',file\.name\)/);
 assert.match(js,/playlistsRemove\('default',file\.name\)/);
 assert.match(backend,/createPlaylistStore/);
 assert.match(backend,/localPlaylist\.add\(id,name\)/);
});
test('playlist playback is continuous, cyclic, and manual local playback resets it',()=>{
 const js=read('app/renderer.js');
 assert.match(js,/audio\(\)\.addEventListener\('ended',\(\)=>\{void advancePlaylist\(\)\}/);
 assert.match(js,/index=\(q\.index\+step\)%q\.tracks\.length/);
 assert.match(js,/state\.playQueue=queue\?/);
 assert.match(js,/state\.advanceSerial\+\+/);
});
test('local delete requires confirmation and uses system recycle bin',()=>{
 const main=read('main.js'),pre=read('preload.js'),js=read('app/renderer.js');
 assert.match(main,/ipcMain\.handle\('local:delete'/);
 assert.match(main,/shell\.trashItem\(full\)/);
 assert.match(pre,/deleteLocal:/);
 assert.match(js,/confirm\(warning/);
 assert.match(js,/local-delete/);
 assert.match(js,/file\.inPlaylist/);
});
test('unknown album and duration removed from search cards, playback time remains',()=>{
 const js=read('app/renderer.js'),html=read('app/index.html');
 const card=js.split('function trackCard(track) {')[1].split('  function jobText(')[0];
 assert.doesNotMatch(card,/专辑：|时长 |网易云 ID/);
 assert.match(html,/id="time-current"/);
 assert.match(html,/id="time-duration"/);
});
test('floating caption does not render a fallback placeholder while empty',()=>{
 const native=read('floating_window.js'),ui=read('app/floating-lyrics.js');
 assert.match(native,/did-finish-load/);
 assert.match(native,/floating\.hide\(\)/);
 assert.match(ui,/lastInfo=\{title:'桌面歌词',line:''/);
 assert.match(ui,/\$\('widget'\)\.hidden=noLyrics/);
});
