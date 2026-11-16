'use strict';
process.argv.push('--show');
// Real renderer/IPC/original Java NetEase methods, isolated data, public reads.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),dir=path.join(root,'.validation','netease-hub-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
process.env.MUSIC_DOWNLOADER_TEST_USER_DATA=dir;
fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({downloadDir:path.join(dir,'music'),desktopLyricsEnabled:false,disclaimerAcceptedVersion:1}));
// Do not steal focus or draw test windows over the user's desktop.
BrowserWindow.prototype.show=function(){};BrowserWindow.prototype.showInactive=function(){};BrowserWindow.prototype.focus=function(){};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label){for(let i=0;i<300;i++){try{if(await fn())return;}catch{}await sleep(100);}throw Error(label);}
(async()=>{
 require('../main');await app.whenReady();let panel;
 await wait(()=>{panel=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));return panel;},'panel missing');
 const ui=code=>panel.webContents.executeJavaScript(code,true);
 await wait(()=>ui("!!document.getElementById('netease-view')"),'NetEase hub missing');
 await wait(()=>ui("!document.getElementById('netease-view').hidden&&document.querySelectorAll('.home-view .netease-card').length>0"),'default playlist home missing');
 await wait(()=>ui("Array.from(document.querySelectorAll('.home-view .netease-card img')).filter(i=>i.complete&&i.naturalWidth>0).length>3"),'playlist covers did not load');
 assert.equal(await ui("!!document.getElementById('collapse')"),false);
 assert.equal(await ui("getComputedStyle(document.querySelector('footer')).display"),'none');
 assert.equal(await ui("document.getElementById('seek').getBoundingClientRect().width<320"),true);
 assert.equal(await ui("document.getElementById('account-avatar').hidden"),true);
 assert.equal(await ui("document.querySelectorAll('.net-more,.mu-sidebar-actions,.mu-source-label').length"),0);
 await ui("window.NeteaseViews.search('YELLOW 神山羊',1)");
 await wait(()=>ui("document.querySelectorAll('#netease-view .netease-tracks .track-row').length>0"),'original search failed');
 const title=await ui("document.querySelector('#netease-view .row-info strong').textContent");
 assert.ok(title.length);assert.equal(await ui("document.querySelectorAll('audio').length"),1);
 await ui("document.getElementById('settings-button').click()");await wait(()=>ui("!document.getElementById('settings-view').hidden&&document.getElementById('netease-view').hidden"),'settings navigation failed');
 console.log(JSON.stringify({ok:true,checks:['default playlist home','real cover images loaded','no close button or footer hints','short central seek bar','unlogged account placeholder','reduced source-style navigation','original search result rows','settings navigation','one existing audio engine']}));
 app.quit();
})().catch(e=>{console.error(e.message);app.exit(1)});
