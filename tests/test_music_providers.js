'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DEFAULT_MUSIC_APIS,effectiveMusicApis}=require('../music_providers');
test('player defaults match downloader defaults and explicit configuration wins',()=>{
 const python=fs.readFileSync(path.join(__dirname,'../skill/scripts/music_skill.py'),'utf8');
 assert.deepEqual(DEFAULT_MUSIC_APIS,JSON.parse(python.match(/^DEFAULT_BACKENDS = (.*)$/m)[1]));
 assert.deepEqual(effectiveMusicApis([],{}),DEFAULT_MUSIC_APIS);
 assert.deepEqual(effectiveMusicApis([],{NETEASE_API_BASE_URL:'https://example.org'}),['https://example.org']);
 assert.deepEqual(effectiveMusicApis(['https://chosen.example'],{NETEASE_API_BASE_URL:'https://other.example'}),['https://chosen.example']);
});
