'use strict';
// Real Electron renderer/IPC/safeStorage; only the remote NetEase API client is mocked.
const {app,BrowserWindow,net,safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),dir=path.join(root,'.validation','account-panel-'+Date.now()),music=path.join(dir,'music');fs.mkdirSync(music,{recursive:true});app.setPath('userData',dir);
const secret='MUSIC_U=fixture_test_secret_abc123456789',id=99000001,apiCalls=[],network=[];let base,polls=0,pollEntered=false,releasePoll,webVerifyHeld=false,webVerifyStarted=false,releaseWebVerify,webController;
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aE0AAAAASUVORK5CYII=';
const wav=Buffer.alloc(44+44100*2*30);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
const song={id,name:'授权测试曲',ar:[{name:'测试歌手'}],al:{name:'测试专辑'},dt:30000};
const server=http.createServer((req,res)=>{
 network.push({url:req.url,cookie:req.headers.cookie||'',authorization:req.headers.authorization||''});
 const u=new URL(req.url,'http://localhost'),json=x=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(x));};
 if(u.pathname==='/search')return json({code:200,result:{songs:[song],songCount:1}});
 if(u.pathname==='/song/detail')return json({code:200,songs:[song]});
 if(u.pathname==='/song/url/v1')return json({code:200,data:[{id,url:null}]});
 if(u.pathname==='/lyric/new'||u.pathname==='/lyric')return json({code:200,lrc:{lyric:'[00:00]测试歌词'}});
 if(u.pathname==='/audio.wav'){
  const m=/bytes=(\d+)-(\d*)/.exec(req.headers.range||''),start=m?Number(m[1]):0,end=m&&m[2]?Math.min(Number(m[2]),wav.length-1):wav.length-1;
  res.writeHead(m?206:200,{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':end-start+1,...(m?{'Content-Range':`bytes ${start}-${end}/${wav.length}`}:{})});return res.end(wav.subarray(start,end+1));
 }
 res.writeHead(404);res.end();
});
const fakeApi={async call(command,args){
 apiCalls.push(command);
 if(command==='login_qr_key')return {body:{data:{unikey:'fixture_key_12345'}}};
 if(command==='login_qr_create')return {body:{data:{qrimg:png}}};
 if(command==='login_qr_check'){if(!pollEntered){pollEntered=true;await new Promise(resolve=>{releasePoll=resolve});return {body:{code:803,cookie:secret}};}polls++;return {body:polls===1?{code:801}:polls===2?{code:802}:{code:803,cookie:secret}};}
 if(command==='login_status'){assert.equal(args.cookie,secret);if(webVerifyHeld){webVerifyStarted=true;await new Promise(resolve=>{releaseWebVerify=resolve});}return {body:{data:{code:200,account:{id:12},profile:{userId:12,nickname:'测试听众'}}}};}
 if(command==='song_url_v1'){assert.equal(args.cookie,secret);return {body:{code:200,data:[{id:Number(args.id),code:200,url:base+'/audio.wav',level:'standard',expi:1200,freeTrialInfo:null}]}};}
 throw Error('unexpected mock command '+command);
},close(){}};
const key=require.resolve('../netease_api_client.js');require.cache[key]={id:key,filename:key,loaded:true,exports:{createNeteaseApiClient:()=>fakeApi}};
const webKey=require.resolve('../official_login_window.js');require.cache[webKey]={id:webKey,filename:webKey,loaded:true,exports:{createOfficialLoginWindow:options=>{
 let opened=false;webController={open(){opened=true;options.onStatus({state:'waiting'});return {open:true}},close(){if(opened){opened=false;options.onStatus({state:'cancelled'})}},isOpen(){return opened},complete(){return options.onToken(secret.slice('MUSIC_U='.length),()=>opened)}};return webController;
}}};
const realFetch=net.fetch.bind(net);net.fetch=(input,options={})=>{const url=typeof input==='string'?input:input.url,headers=new Headers(options.headers||{});assert.equal(headers.has('cookie'),false,'cookie must never be sent via public network fetch');assert.ok(!url.includes(secret),'credential leaked in network URL');if(new URL(url).hostname==='music.163.com')return Promise.resolve(new Response(JSON.stringify({code:200,data:[{id,url:null}]}),{status:200,headers:{'Content-Type':'application/json'}}));return realFetch(input,options);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function wait(fn,label){for(let n=0;n<250;n++){try{if(await fn())return;}catch{}await sleep(100);}throw Error(label);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({downloadDir:music,apiBases:[base],desktopLyricsEnabled:false,disclaimerAcceptedVersion:1}));require('../main');await app.whenReady();assert.equal(safeStorage.isEncryptionAvailable(),true,'Windows safeStorage unavailable');let panel,charm;
 await wait(()=>{panel=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));charm=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/charm.html'));return panel&&charm;},'windows missing');
 const ui=code=>panel.webContents.executeJavaScript(code,true);await wait(()=>ui("typeof document.getElementById('settings-button').onclick==='function'"),'renderer unavailable');
 await charm.webContents.executeJavaScript("charmBridge.action({type:'expand'})",true);await ui("document.getElementById('settings-button').click()");await wait(()=>ui("!document.getElementById('settings-view').hidden"),'settings missing');
 // Cancel while the server's 803 response is in flight: it must not persist a login.
 if(process.env.ACCOUNT_SCREENSHOT==='1'){await sleep(500);const shot=await panel.webContents.capturePage();fs.writeFileSync(path.join(root,'.validation','account-settings.png'),shot.toPNG());}
 await ui("document.getElementById('account-login').click()");await wait(()=>ui("document.getElementById('account-dialog').open&&!document.getElementById('account-qr').hidden"),'QR missing');
 if(process.env.ACCOUNT_SCREENSHOT==='1'){
  const fixture=await require('qrcode').toDataURL('https://example.invalid/login-fixture');await ui(`document.getElementById('account-qr').src=${JSON.stringify(fixture)}`);
  for(const height of [520,740,960]){
   await ui(`musicBridge.panelAction({type:'height',value:${height}})`);await sleep(300);
   const geometry=await ui("(()=>{const d=document.getElementById('account-dialog').getBoundingClientRect(),q=document.getElementById('account-qr').getBoundingClientRect(),b=document.getElementById('account-close').getBoundingClientRect();return {height:innerHeight,dialog:{top:d.top,bottom:d.bottom},qr:{top:q.top,bottom:q.bottom},button:{top:b.top,bottom:b.bottom}}})()");
   console.log('account geometry',JSON.stringify(geometry));assert.ok(geometry.qr.top>=0&&geometry.qr.bottom<=geometry.height&&geometry.button.bottom<=geometry.height,'QR or button outside the panel');
   const shot=await panel.webContents.capturePage();fs.writeFileSync(path.join(root,'.validation',`account-dialog-${height}.png`),shot.toPNG());
  }
 }
 await wait(()=>pollEntered,'first poll did not start');await ui("document.getElementById('account-close').click()");await sleep(300);releasePoll();await sleep(400);assert.equal((await ui('musicBridge.accountStatus()')).loggedIn,false,'cancelled delayed login was persisted');assert.equal(fs.existsSync(path.join(dir,'netease-account.enc')),false,'cancelled QR wrote a credential');
 await ui("document.getElementById('account-login').click()");await wait(()=>ui("document.getElementById('account-qr-state').textContent.includes('确认')"),'scan confirmation missing');await wait(()=>ui("document.getElementById('account-status').textContent.includes('测试听众')"),'login did not complete');
 const account=await ui('musicBridge.accountStatus()');assert.equal(account.loggedIn,true);assert.ok(!JSON.stringify(account).includes(secret));assert.equal(await ui(`document.documentElement.outerHTML.includes(${JSON.stringify(secret)})`),false);
 const encrypted=fs.readFileSync(path.join(dir,'netease-account.enc'));assert.ok(encrypted.length>secret.length);assert.equal(encrypted.includes(Buffer.from(secret)),false,'credential persisted in plaintext');
 await ui("document.querySelector('#settings-view .back-button').click();document.querySelector('[data-tab=search]').click()");await sleep(200);await ui("document.getElementById('query').value='测试';document.getElementById('search-form').requestSubmit()");
 await wait(()=>ui("document.querySelector('.row-info strong')?.textContent==='授权测试曲'"),'search missing');await ui("document.querySelector('.row-play').click()");await wait(()=>ui("document.getElementById('music-audio').src.startsWith('music-preview:')&&!document.getElementById('music-audio').paused"),'authenticated playback failed');assert.ok(apiCalls.includes('song_url_v1'));
 await ui("document.getElementById('settings-button').click()");await wait(()=>ui("!document.getElementById('account-logout').hidden"),'logout missing');await ui("document.getElementById('account-logout').click()");await wait(async()=>!(await ui('musicBridge.accountStatus()')).loggedIn,'logout did not complete');assert.equal(fs.existsSync(path.join(dir,'netease-account.enc')),false);
 // Closing the official web window must cancel a token validation in flight.
 await wait(()=>ui("!document.getElementById('account-web-login').hidden"),'web login button missing');await ui("document.getElementById('account-web-login').click()");await wait(()=>webController?.isOpen(),'web login did not open');
 webVerifyHeld=true;const cancelled=webController.complete();await wait(()=>webVerifyStarted,'web token check did not start');webController.close();releaseWebVerify();await cancelled;webVerifyHeld=false;
 assert.equal((await ui('musicBridge.accountStatus()')).loggedIn,false,'closed web login must not persist');assert.equal(fs.existsSync(path.join(dir,'netease-account.enc')),false,'closed web login wrote a credential');
 await ui("document.getElementById('account-web-login').click()");await wait(()=>webController.isOpen(),'web login did not reopen');await webController.complete();await wait(async()=>(await ui('musicBridge.accountStatus()')).loggedIn,'official web login did not complete');
 assert.equal(await ui(`document.documentElement.outerHTML.includes(${JSON.stringify(secret)})`),false);assert.equal(fs.readFileSync(path.join(dir,'netease-account.enc')).includes(Buffer.from(secret)),false);
 await ui("document.getElementById('account-logout').click()");await wait(async()=>!(await ui('musicBridge.accountStatus()')).loggedIn,'web account logout failed');assert.equal(fs.existsSync(path.join(dir,'netease-account.enc')),false);
 assert.ok(network.every(x=>!x.cookie&&!x.authorization&&!x.url.includes(secret)),'credential leaked to public API');console.log(JSON.stringify({ok:true,checks:['QR cancel and restart','scan and confirm','real encrypted credential','authenticated stream','official web login cancel and success','logout','no renderer or public network credential']}));
 await ui("musicBridge.windowAction('quit')");server.close();
})().catch(e=>{console.error(e.stack);server.close();app.exit(1);});
