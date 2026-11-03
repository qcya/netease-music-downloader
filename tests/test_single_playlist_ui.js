'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('floating caption does not render a fallback placeholder while empty',()=>{
 const native=read('floating_window.js'),ui=read('app/floating-lyrics.js');
 assert.match(native,/did-finish-load/);
 assert.match(native,/floating\.hide\?\.\(\)/);
 assert.match(ui,/lastInfo=\{title:'桌面歌词',line:''/);
 assert.match(ui,/\$\('widget'\)\.hidden=noLyrics&&\(x\.autoHideEmpty===true/);
});
