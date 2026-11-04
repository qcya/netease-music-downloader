'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createOfficialLoginWindow,isOfficialLoginURL}=require('../official_login_window');
function fixture(onToken=async()=>({loggedIn:true}),options={}){
 let current,partition,timer=null,loadingTimer=null,readyChecks=0,releaseLoading;const notifications=[];
 const cookies=new EventEmitter();cookies.rows=[];cookies.get=async()=>cookies.rows;
 const ses=new EventEmitter();ses.cookies=cookies;ses.clearStorageData=async()=>{ses.cleared=true};ses.setPermissionRequestHandler=fn=>{ses.permission=fn};
 class Window extends EventEmitter{constructor(config){super();this.options=config;this.dead=false;this.shown=0;this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=fn=>{this.handler=fn};this.webContents.executeJavaScript=async code=>{if(options.blockUntilStop&&!releaseLoading){await new Promise(r=>{releaseLoading=r})}if(code.includes('typeof window.g_cbLogin'))return ++readyChecks>(options.readyAfter||0);if(!code.includes('const button='))this.script=code;return true};this.webContents.loadURL=async url=>{this.redirect=url};this.webContents.stop=()=>{this.stopped=true;releaseLoading?.()};this.webContents.reload=()=>{this.reloaded=true;queueMicrotask(()=>this.webContents.emit('dom-ready'))};current=this;}loadURL(url){this.url=url;queueMicrotask(()=>this.webContents.emit('dom-ready'));return options.neverFinish?new Promise(()=>{}):Promise.resolve()}isDestroyed(){return this.dead}close(){this.dead=true;this.emit('closed')}show(){this.shown++}focus(){}}
 const ctrl=createOfficialLoginWindow({BrowserWindow:Window,session:{fromPartition:p=>{partition=p;return ses}},onToken,onStatus:s=>notifications.push(s),setTimer:fn=>{timer=fn;return 42},clearTimer:()=>{timer=null},setLoadingTimer:fn=>{loadingTimer=fn;return 43},clearLoadingTimer:()=>{loadingTimer=null}});
 return {ctrl,ses,cookies,get window(){return current},get partition(){return partition},get timer(){return timer},runTimer(){const fn=timer;timer=null;fn?.()},runLoadingTimer(){const fn=loadingTimer;loadingTimer=null;fn?.()},notifications};
}
const tick=()=>new Promise(r=>setImmediate(r));
function popup(){const w=new EventEmitter();w.dead=false;w.isDestroyed=()=>w.dead;w.webContents=new EventEmitter();w.webContents.setWindowOpenHandler=()=>{};w.close=()=>{w.dead=true;w.emit('closed')};return w;}
test('only HTTPS NetEase and QQ domains are allowed',()=>{
 for(const u of ['https://music.163.com/','https://graph.qq.com/oauth2.0/authorize','https://xui.ptlogin2.qq.com/','https://ssl.captcha.qq.com/'])assert.equal(isOfficialLoginURL(u),true,u);
 for(const u of ['http://music.163.com/','https://music.163.com.evil.test/','https://qq.com.evil.test/','https://attacker.test/','file:///x','https://x@music.163.com/'])assert.equal(isOfficialLoginURL(u),false,u);
});
test('QQ entry keeps the official parent hidden and opens the exact official OAuth link',async()=>{
 const f=fixture();f.ctrl.open('qq');const w=f.window;assert.equal(f.ctrl.mode(),'qq');assert.equal(w.options.show,false);await tick();assert.match(w.script,/music\.163\.com\/api\/sns\/authorize/);assert.match(w.script,/snsType=5/);assert.equal(w.handler({url:'https://music.163.com/api/sns/authorize?snsType=5'}).overrideBrowserWindowOptions.show,true);f.ctrl.close();assert.equal(f.ctrl.mode(),null);
});
test('QQ authorization opens after DOM readiness even when unrelated resources never finish loading',async()=>{
 const f=fixture(undefined,{neverFinish:true});f.ctrl.open('qq');const w=f.window;await tick();await tick();assert.match(w.script,/snsType=5/);f.ctrl.close();
});
test('QQ authorization waits for the official callback to initialize',async()=>{
 const f=fixture(undefined,{neverFinish:true,readyAfter:1});f.ctrl.open('qq');const w=f.window;await tick();assert.equal(w.script,undefined);assert.equal(typeof f.timer,'function');f.runTimer();await tick();await tick();assert.match(w.script,/snsType=5/);f.ctrl.close();
});
test('stalled page loading is stopped so Electron can run the official login initialization',async()=>{
 const f=fixture(undefined,{neverFinish:true,blockUntilStop:true});f.ctrl.open('qq');const w=f.window;await tick();assert.equal(w.script,undefined);f.runLoadingTimer();await tick();await tick();assert.equal(w.stopped,true);assert.match(w.script,/snsType=5/);assert.equal(f.ctrl.isOpen(),true);f.ctrl.close();
});
test('missing login component after a forced stop triggers one fresh load',async()=>{
 const f=fixture(undefined,{neverFinish:true,blockUntilStop:true,readyAfter:1});f.ctrl.open('qq');const w=f.window;await tick();f.runLoadingTimer();await tick();await tick();await tick();assert.equal(w.stopped,true);assert.equal(w.reloaded,true);assert.match(w.script,/snsType=5/);f.ctrl.close();
});
test('unavailable QQ authorization page reports an error instead of waiting forever',()=>{
 const f=fixture();f.ctrl.open('qq');assert.equal(typeof f.timer,'function');f.runTimer();assert.equal(f.ctrl.isOpen(),false);assert.equal(f.notifications.at(-1).state,'error');assert.match(f.notifications.at(-1).message,/QQ 授权页面.*无法打开/);
});
test('only the exact NetEase OAuth HTTP callback is upgraded before any navigation',()=>{
 const f=fixture();f.ctrl.open('qq');const w=f.window;let blocked=false;w.webContents.emit('will-redirect',{preventDefault(){blocked=true}},'http://music.163.com/back/sns?code=401',false,true);assert.equal(blocked,true);assert.equal(w.redirect,'https://music.163.com/back/sns?code=401');
 w.redirect='';w.webContents.emit('will-redirect',{preventDefault(){}},'http://music.163.com/other?x=1',false,true);assert.equal(w.redirect,'');f.ctrl.close();
});
test('manually closing QQ popup cancels immediately, even during pending validation',async()=>{
 let release;const f=fixture(()=>new Promise(r=>{release=r}));f.ctrl.open('qq');const child=popup();f.window.webContents.emit('did-create-window',child);
 f.cookies.rows=[{name:'MUSIC_U',domain:'.music.163.com',value:'fixture_secret_123'}];f.cookies.emit('changed',{},f.cookies.rows[0],'explicit',false);await tick();child.close();assert.equal(f.ctrl.isOpen(),false);assert.equal(f.notifications.at(-1).state,'cancelled');release({loggedIn:true});await tick();assert.equal(f.notifications.some(s=>s.state==='authenticated'),false);
});
test('QQ OAuth callback closing its popup keeps a pending credential check alive',async()=>{
 let release;const f=fixture(()=>new Promise(r=>{release=r}));f.ctrl.open('qq');const child=popup();f.window.webContents.emit('did-create-window',child);
 child.webContents.emit('will-navigate',{preventDefault(){}},'https://music.163.com/back/qq?code=x',false,true);
 f.cookies.rows=[{name:'MUSIC_U',domain:'.music.163.com',value:'fixture_secret_123'}];f.cookies.emit('changed',{},f.cookies.rows[0],'explicit',false);await tick();child.close();assert.equal(f.ctrl.isOpen(),true);f.runTimer();await tick();assert.equal(f.ctrl.isOpen(),true);release({loggedIn:true});await tick();assert.equal(f.notifications.some(s=>s.state==='authenticated'),true);assert.equal(f.ctrl.isOpen(),false);
});
test('QQ callback without a login cookie reveals the official opener for any additional verification',async()=>{
 const f=fixture();f.ctrl.open('qq');const parent=f.window,child=popup();parent.webContents.emit('did-create-window',child);
 child.webContents.emit('will-navigate',{preventDefault(){}},'https://music.163.com/back/qq?code=x',false,true);child.close();f.runTimer();await tick();await tick();assert.equal(f.ctrl.isOpen(),true);assert.equal(parent.shown,1);assert.match(f.notifications.at(-1).message,/完成剩余验证/);parent.close();assert.equal(f.notifications.at(-1).state,'cancelled');
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
