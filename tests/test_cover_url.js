'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/panel.js'),'utf8'),start=source.indexOf('const coverURL='),end=source.indexOf('const localRow=',start);
const cover=vm.runInNewContext(source.slice(start,end)+'coverURL',{URL});
test('actual cloud-playlist HTTP CDN covers upgrade to HTTPS before renderer CSP checks',()=>{
 assert.equal(cover('http://p1.music.126.net/art.jpg?param=100y100'),'https://p1.music.126.net/art.jpg?param=100y100');
 assert.equal(cover('https://p2.music.126.net/cover'),'https://p2.music.126.net/cover');
 assert.equal(cover('data:image/png;base64,YQ=='),'data:image/png;base64,YQ==');
});
test('cover normalization keeps foreign, credential-bearing and active URLs out of the UI',()=>{
 for(const value of ['https://p1.music.126.net.evil.test/x','https://evil.test/music.126.net/x','https://name:secret@p1.music.126.net/x','javascript:alert(1)','file:///C:/secret.png','data:image/svg+xml;base64,YQ=='])assert.equal(cover(value),'../assets/avatar.png');
});
