'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');

// Execute the real event handler with a stale renderer snapshot, as happened in
// the failed Windows streaming test. Changing lyrics must not replace the API.
test('lyric preference persistence changes only its owned field and IPC uses it',()=>{
 const match=main.match(/function persistDesktopLyricsEnabled\(value\)\{[\s\S]*?\n\}/);
 assert.ok(match,'explicit lyric toggles need a narrow main-process persistence operation');
 let stored={apiBases:['https://example.invalid'],downloadDir:'D:/music',desktopLyricsEnabled:false,floatingLyrics:{mouseThrough:true},floatingLyricsPosition:{x:40,y:50}};
 const run=vm.runInNewContext(match[0]+';persistDesktopLyricsEnabled',{ensureData(){},configFile:()=>'/settings',readJSON:()=>structuredClone(stored),writeJSONAtomic:(_f,v)=>{stored=structuredClone(v);}});
 const before=structuredClone(stored);run(true);
 assert.deepEqual(JSON.parse(JSON.stringify(stored)),{...before,desktopLyricsEnabled:true});
 for(const [channel,value] of [['lyrics:open','true'],['lyrics:close','false']]){
  const handler=main.split("ipcMain.handle('"+channel+"'")[1]?.split('\n')[0];
  assert.ok(handler?.includes('persistDesktopLyricsEnabled('+value+')'),channel+' must persist its explicit user choice');
 }
});
