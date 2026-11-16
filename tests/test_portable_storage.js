'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {bootstrapPortableStorage} = require('../portable_storage');

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-player-'));
  t.after(() => fs.rmSync(base, {recursive:true, force:true}));
  const old = path.join(base, 'AppData', 'netease-music-desktop-electron');
  const music = path.join(base, 'Music');
  const shipped = path.join(base, 'ZIP folder');
  const paths = {userData:old, appData:path.dirname(old), music, exe:path.join(shipped, 'Player.exe')};
  const calls = [], switches = [], env = {};
  const app = {isPackaged:true, getPath:name => {calls.push(name); return paths[name];}, setPath:(name, value) => {paths[name] = value;},
    setAppLogsPath:value => {paths.logs = value;}, commandLine:{appendSwitch:(...args) => switches.push(args)}};
  const write = (name, value) => {const file=path.join(old,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='object'&&!Buffer.isBuffer(value)?JSON.stringify(value):value);return file;};
  return {base, old, music, shipped, paths, app, env, calls, switches, write, boot:options => bootstrapPortableStorage({app,env,createProfileKeys:()=>null,...options})};
}

test('ZIP layout and native Electron caches/temp/log paths remain beside the executable', t => {
  const f=fixture(t), originalTemp=process.env.TEMP, p=f.boot();
  assert.equal(p.root,f.shipped);assert.equal(p.userData,path.join(f.shipped,'data'));
  assert.equal(p.downloadsDir(),path.join(f.shipped,'下载'));
  assert.equal(p.playlistFile('user-playlists.json'),path.join(f.shipped,'playlists','user-playlists.json'));
  assert.equal(f.paths.userData,p.userData);assert.equal(f.paths.sessionData,p.sessionData);assert.equal(f.paths.temp,p.temp);
  assert.equal(f.paths.logs,p.logs);assert.equal(f.paths.crashDumps,p.crashDumps);
  assert.equal(f.env.TEMP,p.temp);assert.equal(f.env.TMP,p.temp);assert.equal(f.env.NETEASE_DOWNLOAD_DIR,p.downloadsDir());
  assert.equal(process.env.TEMP,originalTemp);assert.deepEqual(f.switches,[['disk-cache-dir',path.join(p.sessionData,'Cache')]]);
});

test('Chinese portable folders upgrade together including an existing migration marker and account key',t=>{
 const f=fixture(t),old=path.join(f.shipped,'播放器数据'),lists=path.join(f.shipped,'歌单');
 fs.mkdirSync(old,{recursive:true});fs.mkdirSync(lists,{recursive:true});
 const key=Buffer.from('DPAPI fixture key').toString('base64');
 for(const [name,value] of Object.entries({'settings.json':'{"quality":"lossless"}','portable-migration-v1.json':'{}','chromium-encryption-key.json':JSON.stringify({os_crypt:{encrypted_key:key}}),'netease-account-v3.enc':'encrypted fixture'}))fs.writeFileSync(path.join(old,name),value);
 fs.writeFileSync(path.join(lists,'user-playlists.json'),'{"playlists":["keep"]}');
 fs.mkdirSync(path.join(f.shipped,'data'));fs.mkdirSync(path.join(f.shipped,'playlists'));
 const p=f.boot();assert.equal(fs.existsSync(old),false);assert.equal(fs.existsSync(lists),false);
 assert.equal(fs.readFileSync(p.persistentFile('netease-account-v3.enc'),'utf8'),'encrypted fixture');
 assert.equal(fs.readFileSync(p.playlistFile('user-playlists.json'),'utf8'),'{"playlists":["keep"]}');
 assert.equal(JSON.parse(fs.readFileSync(p.encryptionKeyFile,'utf8')).os_crypt.encrypted_key,key);
 fs.unlinkSync(p.persistentFile('netease-account-v3.enc'));f.boot();assert.equal(fs.existsSync(p.persistentFile('netease-account-v3.enc')),false);
});

test('conflicting portable profiles remain complete and never mix account encryption keys',t=>{
 const f=fixture(t),old=path.join(f.shipped,'播放器数据'),current=path.join(f.shipped,'data');
 for(const [dir,account] of [[old,'older'],[current,'current']]){
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'netease-account-v3.enc'),account);
  fs.writeFileSync(path.join(dir,'portable-migration-v1.json'),'{}');
  fs.writeFileSync(path.join(dir,'chromium-encryption-key.json'),JSON.stringify({os_crypt:{encrypted_key:Buffer.from(account+' key').toString('base64')}}));
 }
 const p=f.boot();assert.equal(fs.readFileSync(p.persistentFile('netease-account-v3.enc'),'utf8'),'current');
 assert.equal(fs.readFileSync(path.join(current,'legacy-profile','netease-account-v3.enc'),'utf8'),'older');assert.equal(fs.existsSync(old),false);
});

test('development root and test override never depend on Electron executable install directory', t => {
  const f=fixture(t);f.app.isPackaged=false;
  assert.equal(f.boot({devRoot:path.join(f.base,'source')}).root,path.join(f.base,'source'));
  const g=fixture(t);g.env.MUSIC_DOWNLOADER_TEST_USER_DATA=path.join(g.base,'isolated');
  g.write('settings.json',{password:'must-never-be-read'});
  g.write('netease-account-v3.enc','must-never-be-read');g.write('Local State',{os_crypt:{encrypted_key:Buffer.from('DPAPI isolated fixture').toString('base64')}});
  g.app.getPath=name=>{g.calls.push(name);throw Error('test mode read a real OS user directory');};
  const p=g.boot();assert.equal(p.userData,g.env.MUSIC_DOWNLOADER_TEST_USER_DATA);
  assert.deepEqual(g.calls,[]);assert.equal(fs.existsSync(p.persistentFile('settings.json')),false);
  assert.equal(fs.existsSync(p.persistentFile('Local State')),false);assert.equal(fs.existsSync(p.persistentFile('netease-account-v3.enc')),false);
  assert.equal(p.report.copied.length,0);assert.ok(p.cache.startsWith(p.root+path.sep));assert.ok(p.downloadsDir().startsWith(p.root+path.sep));
});

test('only small persistent JSON and opaque encrypted account bytes migrate; originals remain intact', t => {
  const f=fixture(t), defaults=path.join(f.music,'NeteaseDownloads');
  const source=f.write('settings.json',{downloadDir:defaults,favoritesDir:path.join(defaults,'收藏'),quality:'lossless',floatingLyrics:{mouseThrough:false}});
  f.write('user-playlists.json',{version:1,playlists:[{id:'default',name:'我的歌单',tracks:['song.flac']}]});
  f.write('favorites.json',['song.flac']);f.write('download-history.json',{completed:['song.flac']});
  f.write('library-roots.json',{directories:[defaults,path.join(defaults,'收藏'),path.join(f.base,'用户音乐')]});
  const encrypted=Buffer.from([0,1,2,0xff,0x80,44]);f.write('netease-account-v3.enc',encrypted);
  const profileKey=Buffer.from('DPAPI encrypted test key').toString('base64');
  const boundKey=Buffer.from('APPB encrypted test key').toString('base64');
  f.write('Local State',{os_crypt:{encrypted_key:profileKey,app_bound_encrypted_key:boundKey,plaintext:'never-copy-plaintext'},browser:{cookie:'never-copy-browser'},token:'never-copy-token'});
  f.write('netease-account.json',{cookie:'do-not-copy'});f.write('audio-cache/1.mp3','audio');f.write('lyric-cache/1.json',{});
  f.write('Cache/entries','browser');f.write('discovery-cache.json',{songs:[]});f.write('logs/application.log','MUSIC_U=do-not-copy');
  const p=f.boot(), settings=JSON.parse(fs.readFileSync(p.persistentFile('settings.json'),'utf8'));
  assert.equal(settings.downloadDir,p.downloadsDir());assert.equal(settings.favoritesDir,p.favoritesDir());assert.equal(settings.quality,'lossless');assert.deepEqual(settings.floatingLyrics,{mouseThrough:false});
  assert.deepEqual(fs.readFileSync(p.persistentFile('netease-account-v3.enc')),encrypted);
  assert.deepEqual(JSON.parse(fs.readFileSync(p.encryptionKeyFile,'utf8')),{os_crypt:{encrypted_key:profileKey,app_bound_encrypted_key:boundKey}});
  assert.deepEqual(JSON.parse(fs.readFileSync(p.browserStateFile,'utf8')),{os_crypt:{encrypted_key:profileKey,app_bound_encrypted_key:boundKey}});
  assert.equal(fs.readFileSync(p.encryptionKeyFile,'utf8').includes('never-copy'),false);
  assert.equal(JSON.parse(fs.readFileSync(source,'utf8')).downloadDir,defaults);
  assert.deepEqual(JSON.parse(fs.readFileSync(p.playlistFile('library-roots.json'),'utf8')).directories,[path.join(f.base,'用户音乐')]);
  assert.equal(JSON.parse(fs.readFileSync(p.playlistFile('user-playlists.json'),'utf8')).playlists[0].tracks[0],'song.flac');
  for(const name of ['netease-account.json','audio-cache','lyric-cache','discovery-cache.json','Cache','logs'])assert.equal(fs.existsSync(path.join(p.userData,name)),false,name);
  assert.equal(fs.readdirSync(p.audioDir()).length,0);assert.equal(fs.readdirSync(p.logs).length,0);
  assert.equal(JSON.stringify(p.report).includes('do-not-copy'),false);
});

test('explicit custom paths and unknown settings survive normalization', t => {
  const f=fixture(t), custom=path.join(f.base,'custom'), customFavorites=path.join(f.base,'favorites');
  f.write('settings.json',{downloadDir:custom,favoritesDir:customFavorites,experimental:{mode:2}});
  const p=f.boot(), settings=JSON.parse(fs.readFileSync(p.persistentFile('settings.json'),'utf8'));
  assert.deepEqual(settings,{downloadDir:custom,favoritesDir:customFavorites,experimental:{mode:2}});
  assert.deepEqual(p.normalizeSettings(settings),settings);
  assert.equal(p.normalizeSettings(null),null);assert.equal(p.normalizeLibraryRoots(null),null);
});

test('existing portable files win, and migration marker prevents resurrecting logout/deleted playlists', t => {
  const f=fixture(t), existing=path.join(f.shipped,'播放器数据');fs.mkdirSync(existing,{recursive:true});
  fs.writeFileSync(path.join(existing,'settings.json'),JSON.stringify({quality:'higher'}));
  f.write('settings.json',{quality:'lossless'});f.write('netease-account-v3.enc',Buffer.from('encrypted fixture'));
  f.write('user-playlists.json',{version:1,playlists:[]});
  const p=f.boot();assert.deepEqual(JSON.parse(fs.readFileSync(p.persistentFile('settings.json'),'utf8')),{quality:'higher'});
  fs.unlinkSync(p.persistentFile('netease-account-v3.enc'));fs.unlinkSync(p.playlistFile('user-playlists.json'));
  const next=f.boot();assert.equal(next.report.alreadyMigrated,true);
  assert.equal(fs.existsSync(next.persistentFile('netease-account-v3.enc')),false);assert.equal(fs.existsSync(next.playlistFile('user-playlists.json')),false);
});

test('deleting the complete cache preserves login, settings, downloaded audio and playlist metadata', t => {
  const f=fixture(t), p=f.boot();
  const files=[p.persistentFile('netease-account-v3.enc'),p.persistentFile('Local State'),p.persistentFile('settings.json'),p.playlistFile('user-playlists.json'),path.join(p.downloadsDir(),'song.flac')];
  for(const file of files)fs.writeFileSync(file,'persistent');
  fs.writeFileSync(path.join(p.audioDir(),'audio.flac'),'cache');fs.writeFileSync(path.join(p.lyricDir(),'1.json'),'cache');
  fs.rmSync(p.cache,{recursive:true});for(const file of files)assert.equal(fs.readFileSync(file,'utf8'),'persistent');
  assert.equal(fs.existsSync(p.cache),false);assert.equal(fs.existsSync(p.audioDir()),true);
  assert.equal(fs.existsSync(p.lyricDir()),true);assert.equal(fs.existsSync(p.temp),true);assert.equal(fs.existsSync(p.sessionData),true);
  fs.rmSync(p.cache,{recursive:true});fs.writeFileSync(p.cacheFile('discovery-cache.json'),'{}');assert.equal(fs.existsSync(p.temp),true);
});

test('OSCrypt keys migrate only alongside their source encrypted account and never overwrite destination', t => {
  const key=Buffer.from('DPAPI encrypted fixture').toString('base64');
  const noAccount=fixture(t);noAccount.write('Local State',{os_crypt:{encrypted_key:key}});
  const p=noAccount.boot();assert.equal(fs.existsSync(p.persistentFile('Local State')),false);
  const mixed=fixture(t);mixed.write('Local State',{os_crypt:{encrypted_key:key}});
  const other=path.join(mixed.base,'other-profile');fs.mkdirSync(other,{recursive:true});fs.writeFileSync(path.join(other,'netease-account-v3.enc'),'other profile account');
  const mixedStore=mixed.boot({legacyRoots:[mixed.old,other]});assert.equal(fs.existsSync(mixedStore.persistentFile('Local State')),false);
  const existingAccount=fixture(t);existingAccount.write('Local State',{os_crypt:{encrypted_key:key}});existingAccount.write('netease-account-v3.enc','legacy-encrypted');
  const dir=path.join(existingAccount.shipped,'播放器数据');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'netease-account-v3.enc'),'portable-encrypted');
  const q=existingAccount.boot();assert.equal(fs.existsSync(q.persistentFile('Local State')),false);
  const existingKey=fixture(t);existingKey.write('Local State',{os_crypt:{encrypted_key:key}});existingKey.write('netease-account-v3.enc','legacy-encrypted');
  const keyDir=path.join(existingKey.shipped,'播放器数据');fs.mkdirSync(keyDir,{recursive:true});
  const untouched=JSON.stringify({os_crypt:{encrypted_key:Buffer.from('existing key').toString('base64')},existingSetting:true});fs.writeFileSync(path.join(keyDir,'Local State'),untouched);
  const r=existingKey.boot();assert.equal(fs.readFileSync(r.persistentFile('Local State'),'utf8'),untouched);
  fs.unlinkSync(r.persistentFile('netease-account-v3.enc'));fs.unlinkSync(r.persistentFile('Local State'));
  const again=existingKey.boot();assert.equal(fs.existsSync(again.persistentFile('Local State')),false);assert.equal(fs.existsSync(again.persistentFile('netease-account-v3.enc')),false);
});

test('persistent encryption key restores browser profile after cache deletion while preserving other browser JSON',t=>{
 const f=fixture(t),key=Buffer.from('DPAPI encrypted lifecycle fixture').toString('base64');
 const p=f.boot({createProfileKeys:()=>({os_crypt:{encrypted_key:key},ignored:'never persist'})});
 assert.deepEqual(JSON.parse(fs.readFileSync(p.encryptionKeyFile,'utf8')),{os_crypt:{encrypted_key:key}});
 fs.writeFileSync(p.browserStateFile,JSON.stringify({browser:{session:'disposable'},os_crypt:{encrypted_key:key,unrelated:true},cookie:'do not persist'}));
 assert.equal(p.persistEncryptionKeys(),true);assert.equal(fs.readFileSync(p.encryptionKeyFile,'utf8').includes('do not persist'),false);
 p.restoreEncryptionKeys();assert.equal(JSON.parse(fs.readFileSync(p.browserStateFile,'utf8')).browser.session,'disposable');
 fs.rmSync(p.cache,{recursive:true});assert.equal(fs.existsSync(p.encryptionKeyFile),true);
 const next=f.boot({createProfileKeys:()=>{throw Error('must reuse existing key');}});
 assert.equal(JSON.parse(fs.readFileSync(next.browserStateFile,'utf8')).os_crypt.encrypted_key,key);
 assert.equal(next.persistEncryptionKeys(),true);
});

test('invalid or oversized encrypted profile keys are skipped without copying plaintext fields', t => {
  for(const invalid of ['plaintext secret', 'A'.repeat(65540), '', 32, null]){
    const f=fixture(t);f.write('netease-account-v3.enc','encrypted fixture');
    f.write('Local State',{os_crypt:{encrypted_key:invalid,plaintext:'hidden-secret'},browser:{token:'hidden-secret'}});
    const p=f.boot();assert.equal(fs.existsSync(p.persistentFile('Local State')),false);
    assert.equal(JSON.stringify(p.report).includes('hidden-secret'),false);
  }
});

test('malformed, oversized, directory and symlink legacy entries are skipped without exposing content', t => {
  const f=fixture(t);f.write('settings.json','{ secret-token');f.write('favorites.json',' '.repeat(4*1024*1024+1));
  fs.mkdirSync(path.join(f.old,'overlay-layout.json'));f.write('settings.json.bak',{quality:'best'});
  const target=f.write('unrelated.json',{cookie:'not copied'});let linked=false;
  try{fs.symlinkSync(target,path.join(f.old,'lyric-position-policy.json'),'file');linked=true;}catch(error){if(!['EPERM','EACCES'].includes(error.code))throw error;}
  const p=f.boot();assert.equal(fs.existsSync(p.persistentFile('settings.json')),false);assert.equal(fs.existsSync(p.playlistFile('favorites.json')),false);
  assert.equal(fs.existsSync(p.persistentFile('overlay-layout.json')),false);if(linked)assert.equal(fs.existsSync(p.persistentFile('lyric-position-policy.json')),false);
  assert.deepEqual(JSON.parse(fs.readFileSync(p.persistentFile('settings.json.bak'),'utf8')),{quality:'best'});
  assert.equal(JSON.stringify(p.report).includes('secret-token'),false);assert.equal(JSON.stringify(p.report).includes('not copied'),false);
  assert.throws(()=>p.cacheFile('../settings.json'),/filename/);assert.throws(()=>p.persistentFile('..'),/filename/);
});
