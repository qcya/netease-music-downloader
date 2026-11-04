'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createNeteaseAccount}=require('../netease_account');
const token='abc1234567890_secure';
function fixture(overrides={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'netease-account-')),file=path.join(dir,'auth.bin'),calls=[],changes=[];
 const api={login_qr_key:async()=>({body:{data:{unikey:'qr_key_123456'}}}),login_qr_create:async()=>({body:{data:{qrimg:'data:image/png;base64,aGVsbG8='}}}),login_qr_check:async()=>({body:{code:803,cookie:`MUSIC_U=${token}; Path=/; HttpOnly`}}),login_status:async()=>({body:{data:{code:200,account:{id:10},profile:{nickname:'测试用户'}}}}),song_url_v1:async arg=>{calls.push(arg);return {body:{code:200,data:[{id:123,url:'https://music.126.net/song',code:200,freeTrialInfo:null}]},cookie:['secret']}}};
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('ENCRYPTED:'+Buffer.from(s).toString('base64')),decryptString:b=>Buffer.from(b.toString().slice(10),'base64').toString()};
 const deps={api,safeStorage,file,onChange:()=>changes.push(true),...overrides};return {dir,file,calls,changes,deps,create:()=>createNeteaseAccount(deps)};
}
test('QR login validates account and persists only encrypted credential; playback query stays in main process',async()=>{
 const f=fixture(),a=f.create();const start=await a.startQr();assert.equal(start.status,'waiting');assert.match(start.image,/^data:image\/png;base64,/);assert.ok(!JSON.stringify(start).includes('qr_key'));
 const result=await a.pollQr();assert.equal(result.status,'logged-in');assert.equal(result.loggedIn,true);assert.equal(result.nickname,'测试用户');assert.equal(f.changes.length,1);assert.ok(!fs.readFileSync(f.file,'utf8').includes(token));
 const audio=await a.songUrl('123');assert.equal(audio.data[0].id,123);assert.ok(!JSON.stringify(audio).includes(token));assert.equal(f.calls[0].cookie,'MUSIC_U='+token);assert.ok(!('unblock' in f.calls[0]));
 await assert.rejects(()=>a.songUrl('1&cookie=bad'));await assert.rejects(()=>a.songUrl('1','invalid'));
 const reopened=f.create();assert.equal(reopened.status().state,'unverified');assert.equal((await reopened.refreshStatus()).loggedIn,true);reopened.logout();assert.equal(fs.existsSync(f.file),false);assert.equal(reopened.status().loggedIn,false);
});
test('scan state, expiry and cancellation do not disclose keys',async()=>{
 let now=10,code=801;const f=fixture({now:()=>now});f.deps.api.login_qr_check=async()=>({body:{code}});const a=f.create();await a.startQr();assert.equal((await a.pollQr()).status,'waiting');code=802;assert.equal((await a.pollQr()).status,'scanned');now+=180001;assert.equal((await a.pollQr()).status,'expired');
 await a.startQr();a.cancel();assert.equal((await a.pollQr()).status,'expired');
});
test('late QR success cannot log in after cancellation or logout',async()=>{
 let resolve;const f=fixture();f.deps.api.login_qr_check=()=>new Promise(r=>resolve=r);const a=f.create();await a.startQr();const pending=a.pollQr();a.logout();resolve({body:{code:803,cookie:`MUSIC_U=${token}`}});assert.equal((await pending).status,'cancelled');assert.equal(a.status().loggedIn,false);assert.equal(fs.existsSync(f.file),false);
});
test('unavailable encryption, malformed responses and API errors fail closed without leaking secrets',async()=>{
 const f=fixture();f.deps.safeStorage.isEncryptionAvailable=()=>false;const a=f.create();await assert.rejects(()=>a.startQr(),/安全存储/);assert.equal(fs.existsSync(f.file),false);
 const g=fixture();g.deps.api.login_qr_check=async()=>{throw Error('sensitive-cookie-'+token)};const b=g.create();await b.startQr();await assert.rejects(()=>b.pollQr(),e=>!e.message.includes(token));assert.equal(fs.existsSync(g.file),false);
 const h=fixture();h.deps.api.login_status=async()=>({body:{data:{code:301}}});const c=h.create();await c.startQr();await assert.rejects(()=>c.pollQr());assert.equal(fs.existsSync(h.file),false);
});
test('concurrent QR polls share one request; logging out cancels in-flight audio resolution',async()=>{
 const f=fixture();let n=0,release;f.deps.api.login_qr_check=()=>{n++;return new Promise(r=>release=r)};const a=f.create();await a.startQr();const p1=a.pollQr(),p2=a.pollQr();assert.equal(n,1);release({body:{code:803,cookie:`MUSIC_U=${token}`}});assert.equal((await p1).loggedIn,true);assert.equal((await p2).loggedIn,true);
 let finish;f.deps.api.song_url_v1=()=>new Promise(r=>finish=r);const p=a.songUrl('123');a.logout();finish({body:{code:200,data:[{id:123}]}});await assert.rejects(p);assert.equal(a.status().loggedIn,false);
});
test('restart distinguishes verified, expired and offline without deleting encrypted credentials',async()=>{
 const f=fixture(),a=f.create();await a.startQr();await a.pollQr();const b=f.create();f.deps.api.login_status=async()=>{throw Error('network '+token)};
 const offline=await b.refreshStatus();assert.equal(offline.state,'unverified');assert.equal(offline.loggedIn,false);assert.equal(offline.savedCredential,true);assert.ok(!JSON.stringify(offline).includes(token));assert.ok(fs.existsSync(f.file));
 f.deps.api.login_status=async()=>({body:{code:301}});const expired=await b.refreshStatus();assert.equal(expired.state,'expired');assert.equal(expired.loggedIn,false);assert.ok(fs.existsSync(f.file));await assert.rejects(()=>b.songUrl('123'));
 f.deps.api.login_status=async()=>({body:{data:{code:200,account:{id:10}}}});assert.equal((await b.refreshStatus()).state,'valid');
});
test('late account verification cannot restore a logged-out user and expired QR cannot log in',async()=>{
 let now=0,resolve;const f=fixture({now:()=>now}),a=f.create();await a.startQr();await a.pollQr();f.deps.api.login_status=()=>new Promise(r=>resolve=r);const checking=a.refreshStatus();a.logout();resolve({body:{data:{code:200,account:{id:10}}}});assert.equal((await checking).state,'signed-out');
 f.deps.api.login_qr_check=()=>new Promise(r=>resolve=r);await a.startQr();const pending=a.pollQr();now=180001;resolve({body:{code:803,cookie:`MUSIC_U=${token}`}});assert.equal((await pending).status,'expired');assert.equal(a.status().loggedIn,false);
});
test('an explicit account-level failure revalidates login; a song-level -110 does not',async()=>{
 const f=fixture(),a=f.create();await a.startQr();await a.pollQr();let checks=0;
 f.deps.api.login_status=async()=>{checks++;return {body:{code:301}}};
 f.deps.api.song_url_v1=async()=>({body:{code:200,data:[{id:123,code:-110,url:null}]}});
 assert.equal((await a.songUrl('123')).data[0].code,-110);assert.equal(a.status().state,'valid');assert.equal(checks,0);
 f.deps.api.song_url_v1=async()=>({body:{code:301}});await assert.rejects(()=>a.songUrl('123'));assert.equal(a.status().state,'expired');assert.equal(checks,1);assert.equal(f.changes.length,2);
});
test('network failure revalidating an account-level error preserves credentials as unverified',async()=>{
 const f=fixture(),a=f.create();await a.startQr();await a.pollQr();f.deps.api.login_status=async()=>{throw Error('network '+token)};f.deps.api.song_url_v1=async()=>({body:{code:401}});
 await assert.rejects(()=>a.songUrl('123'));assert.equal(a.status().state,'unverified');assert.equal(a.status().savedCredential,true);assert.ok(fs.existsSync(f.file));
});
test('concurrent login-state checks share one request without blocking a new session',async()=>{
 const f=fixture(),a=f.create();await a.startQr();await a.pollQr();let count=0,release;f.deps.api.login_status=()=>{count++;return new Promise(r=>release=r)};
 const first=a.refreshStatus(),second=a.refreshStatus();assert.equal(count,1);release({body:{data:{code:200,account:{id:10}}}});assert.equal((await first).state,'valid');assert.equal((await second).state,'valid');
 const pending=a.refreshStatus();a.logout();const signedOut=await a.refreshStatus();assert.equal(signedOut.state,'signed-out');release({body:{data:{code:200,account:{id:10}}}});assert.equal((await pending).state,'signed-out');
});
