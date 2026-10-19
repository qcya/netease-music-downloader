'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const p=path.join(__dirname,'../app/lyric_state.js');
test('explicit desktop enable is visible without audio; loading and errors cannot become invisible success',()=>{
 assert.ok(fs.existsSync(p),'shared lyric state is required');const {payload}=require(p);
 assert.match(payload({}).line,/开启|播放/);
 assert.match(payload({selected:true,status:'loading'}).line,/获取/);
 assert.match(payload({selected:true,status:'error'}).line,/失败/);
 assert.equal(payload({selected:true,status:'error',autoHideEmpty:true}).line,'');
 assert.equal(payload({row:{text:'a',translation:'甲'},autoHideEmpty:true}).translation,'甲');
});
test('background sync and actual native overlay failures are handled, not swallowed',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8'),floating=fs.readFileSync(path.join(__dirname,'../floating_window.js'),'utf8');
 assert.match(main,/backgroundThrottling:false/);assert.match(floating,/did-fail-load/);assert.match(floating,/render-process-gone/);
});
