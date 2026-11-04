'use strict';
// Run twice with the same MUSIC_DOWNLOADER_TEST_USER_DATA: first, then second.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=process.env.MUSIC_DOWNLOADER_TEST_USER_DATA,phase=process.argv[2];
if(!dir||!['first','second'].includes(phase))throw Error('Requires isolated MUSIC_DOWNLOADER_TEST_USER_DATA and phase');
fs.mkdirSync(dir,{recursive:true});
if(phase==='first'){
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({downloadDir:path.join(dir,'music'),disclaimerAcceptedVersion:1,desktopLyricsEnabled:false,floatingLyrics:{mouseThrough:false}}));
 fs.writeFileSync(path.join(dir,'lyric-position-policy.json'),JSON.stringify({version:1,mode:'pending'}));
}
require('../main');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await app.whenReady();let panel;for(let i=0;i<150;i++){panel=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));if(panel)break;await sleep(100);}if(!panel)throw Error('panel unavailable');
 let settings;for(let i=0;i<150;i++){try{settings=await panel.webContents.executeJavaScript('musicBridge.getSettings()');break;}catch{await sleep(100);}}
 assert.equal(settings.floatingLyrics.mouseThrough,phase==='first','unexpected persisted lock at startup');
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'lyric-position-policy.json'),'utf8')).mode,'done');
 if(phase==='first')await panel.webContents.executeJavaScript('musicBridge.lockFloatingLyrics(false)');
 console.log(JSON.stringify({ok:true,phase}));app.quit();
})().catch(e=>{console.error(e.stack);app.exit(1);});
