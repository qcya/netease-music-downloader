'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('first-install defaults are disabled, saved user toggles reopen after restart',()=>{
 const main=read('main.js'),ui=read('app/renderer.js');
 assert.match(main,/desktopLyricsEnabled:false,miniPlayerEnabled:false/);
 assert.match(main,/desktopLyricsEnabled:stored\.desktopLyricsEnabled===true,miniPlayerEnabled:stored\.miniPlayerEnabled===true/);
 assert.match(ui,/state\.settings=await bridge\.getSettings\(\)/);
 assert.match(ui,/if\(state\.settings\.desktopLyricsEnabled===true\)/);
 assert.match(ui,/if\(state\.settings\.miniPlayerEnabled===true\)/);
 assert.match(ui,/await toggleMiniPlayer\(true\)/);
 assert.doesNotMatch(ui,/state\.settings=\{\.\.\.await bridge\.getSettings\(\),desktopLyricsEnabled:false\}/);
 assert.doesNotMatch(ui,/const\s+on\s*=\s*false;/);
});
test('mini player explicit toggle saves preference, quitting is not an explicit toggle',()=>{
 const main=read('main.js'),ui=read('app/renderer.js');
 assert.match(main,/persistMiniPlayerEnabled\(true\)/);
 assert.match(main,/persistMiniPlayerEnabled\(false\)/);
 assert.match(main,/ipcMain\.handle\('mini:open'/);
 assert.match(main,/ipcMain\.handle\('mini:close'/);
 assert.match(main,/miniPlayerEnabled:config\(\)\.miniPlayerEnabled/);
 assert.match(ui,/state\.miniOpen=true;updateMiniPlayer\(\)/);
 const quit=main.slice(main.indexOf("app.on('before-quit'"));
 assert.doesNotMatch(quit,/persistMiniPlayerEnabled\(false\)/);
});
test('lyric checkbox defaults unlocked, saved lock and location cannot be overwritten by reset-style or regular settings save',()=>{
 const main=read('main.js'),ui=read('app/renderer.js'),defaults=read('lyric_preferences.js');
 assert.match(defaults,/mouseThrough:false/);
 assert.match(main,/mouseThrough:config\(\)\.floatingLyrics\.mouseThrough/);
 assert.match(main,/floatingLyricsPosition:config\(\)\.floatingLyricsPosition/);
 assert.match(ui,/state\.lyricsLocked=state\.settings\.floatingLyrics\?\.mouseThrough===true/);
 assert.match(ui,/mouseThrough:state\.lyricsLocked/);
 assert.match(ui,/key==='mouseThrough'\?state\.lyricsLocked/);
 assert.match(main,/persistFloatingLyricsLock/);
 assert.match(main,/persistFloatingLyricsPosition/);
});
