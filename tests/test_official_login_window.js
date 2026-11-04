'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createOfficialLoginWindow,isOfficialLoginURL}=require('../official_login_window');
function fixture(onToken=async()=>({loggedIn:true})){
 let current,partition,timer=null;const notifications=[];
 const cookies=new EventEmitter();cookies.rows=[];cookies.get=async()=>cookies.rows;
 const ses=new EventEmitter();ses.cookies=cookies;ses.clearStorageData=async()=>{ses.cleared=true};ses.setPermissionRequestHandler=fn=>{ses.permission=fn};
 class Window extends EventEmitter{constructor(options){super();this.options=options;this.dead=false;this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=fn=>{this.handler=fn};current=this;}loadURL(url){this.url=url;return Promise.resolve()}isDestroyed(){return this.dead}close(){this.dead=true;this.emit('closed')}show(){}focus(){}}
 const ctrl=createOfficialLoginWindow({BrowserWindow:Window,session:{fromPartition:p=>{partition=p;return ses}},onToken,onStatus:s=>notifications.push(s),setTimer:fn=>{timer=fn;return 42},clearTimer:()=>{timer=null}});
 return {ctrl,ses,cookies,get window(){return current},get partition(){return partition},get timer(){return timer},runTimer(){const fn=timer;timer=null;fn?.()},notifications};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('only HTTPS NetEase and QQ domains are allowed',()=>{
 for(const u of ['https://music.163.com/','https://graph.qq.com/oauth2.0/authorize','https://xui.ptlogin2.qq.com/','https://ssl.captcha.qq.com/'])assert.equal(isOfficialLoginURL(u),true,u);
 for(const u of ['http://music.163.com/','https://music.163.com.evil.test/','https://qq.com.evil.test/','https://attacker.test/','file:///x','https://x@music.163.com/'])assert.equal(isOfficialLoginURL(u),false,u);
});
test('QQ login popup stays isolated and unsafe navigations are blocked',()=>{
 const f=fixture();f.ctrl.open();const w=f.window;assert.match(f.partition,/^official-login-/);assert.equal(w.url,'https://music.163.com/');assert.equal(w.options.webPreferences.session,f.ses);assert.equal(w.options.webPreferences.sandbox,true);assert.equal(w.options.webPreferences.nodeIntegration,false);assert.equal(w.options.webPreferences.preload,undefined);
 assert.equal(w.handler({url:'https://music.163.com/api/sns/authorize'}).action,'allow');assert.equal(w.handler({url:'https://attacker.test'}).action,'deny');let blocked=false;w.webContents.emit('will-redirect',{preventDefault(){blocked=true}},'https://attacker.test');assert.equal(blocked,true);f.ctrl.close();assert.equal(f.ses.cleared,true);
});
test('only verified NetEase MUSIC_U completes login; no token is sent as status',async()=>{
 let received='';const f=fixture(async value=>{received=value;return {loggedIn:true,nickname:'listener'}});f.ctrl.open();f.cookies.rows=[{name:'MUSIC_U',domain:'.music.163.com',value:'fixture_secret_123'}];f.cookies.emit('changed',{},f.cookies.rows[0],'explicit',false);await tick();await tick();assert.equal(received,'fixture_secret_123');assert.equal(f.ctrl.isOpen(),false);assert.ok(f.notifications.some(s=>s.state==='authenticated'));assert.ok(!JSON.stringify(f.notifications).includes('fixture_secret_123'));assert.equal(f.ses.cleared,true);
});
test('closing during verification ignores late success and unrelated cookies',async()=>{
 let release,calls=0;const f=fixture(()=>{calls++;return new Promise(r=>release=r)});f.ctrl.open();f.cookies.emit('changed',{}, {name:'MUSIC_U',domain:'.qq.com'},'explicit',false);assert.equal(calls,0);
 f.cookies.rows=[{name:'MUSIC_U',domain:'.music.163.com',value:'fixture_secret_123'}];f.cookies.emit('changed',{},f.cookies.rows[0],'explicit',false);await tick();assert.equal(calls,1);f.ctrl.close();release({loggedIn:true});await tick();assert.equal(f.ctrl.isOpen(),false);assert.equal(f.notifications.some(s=>s.state==='authenticated'),false);
});
test('a temporary verification error retries the same cookie and closes after success',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;if(calls===1)throw Error('offline');return {loggedIn:true}});f.ctrl.open();f.cookies.rows=[{name:'MUSIC_U',domain:'.music.163.com',value:'fixture_secret_123'}];f.cookies.emit('changed',{},f.cookies.rows[0],'explicit',false);await tick();await tick();assert.equal(calls,1);assert.equal(typeof f.timer,'function');f.runTimer();await tick();await tick();assert.equal(calls,2);assert.equal(f.ctrl.isOpen(),false);
});
test('closing clears pending retries',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;throw Error('offline')});f.ctrl.open();f.cookies.rows=[{name:'MUSIC_U',domain:'.music.163.com',value:'fixture_secret_123'}];f.cookies.emit('changed',{},f.cookies.rows[0],'explicit',false);await tick();await tick();assert.equal(typeof f.timer,'function');f.ctrl.close();assert.equal(f.timer,null);assert.equal(calls,1);
});
test('exhausted retries stop and report how to retry',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;throw Error('offline')});f.ctrl.open();f.cookies.rows=[{name:'MUSIC_U',domain:'.music.163.com',value:'fixture_secret_123'}];f.cookies.emit('changed',{},f.cookies.rows[0],'explicit',false);await tick();await tick();for(let n=0;n<3;n++){assert.equal(typeof f.timer,'function');f.runTimer();await tick();await tick();}assert.equal(calls,4);assert.equal(f.timer,null);assert.match(f.notifications.at(-1).message,/无法验证.*关闭登录窗口重试/);f.ctrl.close();
});
