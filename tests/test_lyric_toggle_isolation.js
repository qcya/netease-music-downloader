'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const renderer=fs.readFileSync(path.join(root,'app/renderer.js'),'utf8');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');

// Execute the real event handler with a stale renderer snapshot, as happened in
// the failed Windows streaming test. Changing lyrics must not replace the API.
test('desktop lyric toggle cannot overwrite unrelated settings from a stale renderer',async()=>{
 const original={downloadDir:'C:/old',apiBases:[],desktopLyricsEnabled:false};
 let persisted={...original,downloadDir:'D:/music',apiBases:['http://127.0.0.1:12345'],floatingLyricsPosition:{x:45,y:70}};
 let writes=0;const state={settings:structuredClone(original),floating:false};
 const button={disabled:false};
 const bridge={
  showFloatingLyrics:async()=>{persisted.desktopLyricsEnabled=true;},
  closeFloatingLyrics:async()=>{persisted.desktopLyricsEnabled=false;},
  saveSettings:async value=>{writes++;persisted=structuredClone(value);return value;}
 };
 const source=renderer.slice(renderer.indexOf('  async function toggleDesktopLyrics('),renderer.indexOf('  function renderSettings()'));
 assert.ok(source.includes('toggleDesktopLyrics'));
 const run=vm.runInNewContext(source+';toggleDesktopLyrics',{state,bridge,$:()=>button,updateFloatingLine(){},updateDesktopLyricsToggle(){},showToast(message){throw Error(message);},errMessage:e=>e.message});
 await run(true);
 assert.deepEqual(persisted.apiBases,['http://127.0.0.1:12345'],'enabling lyrics must preserve the current audio provider');
 assert.equal(persisted.downloadDir,'D:/music');
 assert.deepEqual(persisted.floatingLyricsPosition,{x:45,y:70});
 assert.equal(state.settings.desktopLyricsEnabled,true);
 await run(false);
 assert.equal(persisted.desktopLyricsEnabled,false);
 assert.equal(writes,0,'toggle must not send a complete old settings snapshot');
 assert.equal(button.disabled,false);
});

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
