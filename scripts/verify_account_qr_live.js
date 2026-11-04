'use strict';
// Optional network smoke test: never scans or obtains a user's credentials.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.join(__dirname,'..','.validation','account-live-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({downloadDir:path.join(dir,'music'),desktopLyricsEnabled:false,disclaimerAcceptedVersion:1}));
require('../main');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label){for(let i=0;i<200;i++){try{if(await fn())return}catch{}await sleep(100)}throw Error(label)}
(async()=>{await app.whenReady();let panel,charm;await wait(()=>{panel=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));charm=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/charm.html'));return panel&&charm},'player unavailable');
 const ui=code=>panel.webContents.executeJavaScript(code,true);await wait(()=>ui("typeof document.getElementById('settings-button').onclick==='function'"),'renderer unavailable');await charm.webContents.executeJavaScript("charmBridge.action({type:'expand'})",true);await ui("document.getElementById('settings-button').click()");await wait(()=>ui("!document.getElementById('settings-view').hidden"),'settings unavailable');await ui("document.getElementById('account-login').click()");
 await wait(()=>ui("document.getElementById('account-qr').src.startsWith('data:image/png;base64,')&&!document.getElementById('account-qr').hidden"),'QR generation failed');await sleep(3000);assert.match(await ui("document.getElementById('account-qr-state').textContent"),/等待扫码/);assert.equal((await ui('musicBridge.accountStatus()')).loggedIn,false);
 await ui("document.getElementById('account-close').click()");await sleep(300);console.log(JSON.stringify({ok:true,checks:['live QR generation','waiting without scanning','cancelled without credentials']}));await ui("musicBridge.windowAction('quit')");
})().catch(e=>{console.error(e.message);app.exit(1)});
