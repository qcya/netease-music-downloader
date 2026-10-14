'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),path=require('node:path');
const {wireMainWindow}=require('../app_lifecycle.js');
class Window extends EventEmitter{
 constructor(){super();this.webContents=new EventEmitter();this.visible=false;this.dead=false;this.shows=0;}
 show(){this.shows++;this.visible=true}
 isDestroyed(){return this.dead}
}
test('packaged main window displays when HTML is loaded, even when ready-to-show never fires',()=>{
 const window=new Window();let shown=0;
 wireMainWindow({window,app:{quit(){}},onShown:()=>shown++,timeoutMs:100000});
 assert.equal(window.visible,false);
 window.webContents.emit('did-finish-load');
 assert.equal(window.visible,true);assert.equal(shown,1);
 window.emit('ready-to-show');
 assert.equal(window.shows,1);
});
test('clicking main-window X closes hidden lyric and mini windows and terminates the application',()=>{
 const window=new Window();let closes=0,quits=0;
 wireMainWindow({window,app:{quit(){quits++}},closeChildren:()=>closes++,timeoutMs:100000});
 window.emit('close');
 window.emit('closed');
 assert.equal(closes,1,'tool windows close once even if both close events fire');
 if(process.platform!=='darwin')assert.equal(quits,1,'Electron must not remain in the background');
});
test('failed packaged HTML load surfaces diagnostic instead of indefinitely hiding process',()=>{
 const window=new Window(),errors=[];
 wireMainWindow({window,app:{quit(){}},onFailure:(reason,error)=>errors.push([reason,error.message]),timeoutMs:100000});
 window.webContents.emit('did-fail-load',{},-6,'ERR_FILE_NOT_FOUND','file:///missing',true);
 window.emit('ready-to-show');
 assert.equal(window.shows,0);
 assert.match(errors[0][0],/界面文件加载失败/);
 assert.match(errors[0][1],/ERR_FILE_NOT_FOUND/);
});
test('main bootstrap includes single instance activation, process termination and errors surfaced',()=>{
 const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 const build=fs.readFileSync(path.join(__dirname,'..','.github/workflows/windows-build.yml'),'utf8');
 assert.match(main,/requestSingleInstanceLock/);
 assert.match(main,/second-instance/);
 assert.match(main,/activeBackendChildren\.add\(child\)/);
 assert.match(main,/stopBackendChildren\(\)/);
 assert.match(main,/wireMainWindow\(\{/);
 assert.match(main,/\.catch\(e=>reportStartupFailure\('Electron 初始化失败',e\)\)/);
 assert.match(build,/Smoke-test installed portable executable/);
 assert.match(build,/WM_CLOSE/);
 assert.match(build,/window_ready/);
});
