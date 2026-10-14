'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {normalizeLyrics,DEFAULT_LYRICS}=require('../lyric_preferences.js');
const {embeddedBackend,backendArgs}=require('../backend_runtime.js');
test('floating lyric preference defaults and user input normalization',()=>{
 const d=normalizeLyrics();assert.equal(d.background,'none');assert.equal(d.originalColor,'#F6A8C8');assert.equal(d.outlineColor,'#FFFFFF');
 assert.deepEqual(d,DEFAULT_LYRICS);
 const s=normalizeLyrics({background:'glass',originalColor:'url(evil)',fontSize:500,width:-1,opacity:'15',
    showOriginal:false,showTranslation:false,mouseThrough:true,outlineWidth:2.5,align:'left'});
 assert.equal(s.originalColor,'#F6A8C8');assert.equal(s.fontSize,64);assert.equal(s.width,420);assert.equal(s.opacity,30);
 assert.equal(s.outlineWidth,2.5);assert.equal(s.mouseThrough,true);assert.equal(s.showOriginal,false);
});
test('floating long text wraps and resize request sent through isolated bridge',()=>{
 const css=read('app/floating-lyrics.css'),js=read('app/floating-lyrics.js'),html=read('app/index.html');
 assert.match(css,/white-space:pre-wrap/);assert.match(css,/overflow-wrap:anywhere/);
 assert.doesNotMatch(css,/text-overflow:ellipsis[^\n]*\.lyric/);
 assert.match(js,/scrollHeight/);assert.match(js,/floatingBridge\.resize/);
 for(const id of ['lyr-background','lyr-original-color','lyr-outline-color','lyr-translation-color','lyr-width',
 'lyr-mouse-through','lyr-show-translation','lyr-align','lyr-shadow'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(read('main.js'),/ipcMain\.handle\('lyrics:resize'/);
});
test('packaged runtime requires local embedded backend and has no system Python fallback',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'netease-backend-'));
 try {
  assert.equal(embeddedBackend(dir,false),null);
  assert.throws(()=>embeddedBackend(dir,true),/music_backend\.exe/);
  fs.mkdirSync(path.join(dir,'backend'));fs.writeFileSync(path.join(dir,'backend','music_backend.exe'),'fake');
  const run=embeddedBackend(dir,true);assert.equal(run.standalone,true);
  assert.deepEqual(backendArgs(run,'unused.py','search',['--query','hello']),['search','--query','hello']);
  assert.match(read('main.js'),/embeddedBackend\(process\.resourcesPath,app\.isPackaged\)/);
  const p=JSON.parse(read('package.json'));
  assert.ok(p.build.extraResources.some(x=>x.to==='backend/music_backend.exe'));
  assert.ok(p.scripts['build:win'].includes('build:backend'));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Windows standalone build and CI artifact path are version aligned',()=>{
 const p=JSON.parse(read('package.json'));const bat=read('构建Windows_EXE.bat');const workflow=read('.github/workflows/windows-build.yml');
 assert.equal(p.version,'2.4.0');assert.ok(bat.includes('MusicDownloader-2.4.0-portable.exe'));
 assert.ok(workflow.includes('MusicDownloader-2.4.0-portable.exe'));
 assert.ok(fs.existsSync(path.join(root,'scripts/build_backend.py')));
});
