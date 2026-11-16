'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {readJSON,writeJSONAtomic} = require('./durable_json');

const PLAYLIST_FILES = new Set(['favorites.json', 'my-playlists.json', 'playlist-categories.json', 'user-playlists.json', 'library-roots.json', 'download-history.json']);
const SETTINGS_FILES = ['settings.json', 'overlay-layout.json', 'lyric-position-policy.json'];
const MARKER = 'portable-migration-v1.json';
const MAX_JSON_BYTES = 4 * 1024 * 1024;

// Electron 37 writes Local State under sessionData. Keep only encrypted key
// material persistently, and project it back before Chromium initializes.
function encryptedProfileKeys(value) {
  const keys = {};
  for (const name of ['encrypted_key', 'app_bound_encrypted_key']) {
    const key = value?.os_crypt?.[name];
    if (typeof key === 'string' && key.length >= 8 && key.length <= 65536 &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(key) &&
        Buffer.from(key, 'base64').toString('base64') === key) keys[name] = key;
  }
  if (!Object.keys(keys).length) throw Error('No supported encrypted profile key');
  return {os_crypt:keys};
}

let dpapi;
function createWindowsProfileKeys() {
  if(process.platform!=='win32')return null;
  if(!dpapi){
    const k=require('koffi'),crypt=k.load('crypt32.dll'),kernel=k.load('kernel32.dll');
    const blob=k.struct('PortablePlayerDataBlob',{cbData:'uint32',pbData:'void *'});
    dpapi={k,protect:crypt.func('bool __stdcall CryptProtectData(PortablePlayerDataBlob *, str16, void *, void *, void *, uint32, _Out_ PortablePlayerDataBlob *)'),
      free:kernel.func('void * __stdcall LocalFree(void *)')};
  }
  const key=randomBytes(32),output={};
  try{
    // CurrentUser DPAPI, UI forbidden. Chromium's OSCrypt format is a DPAPI
    // envelope prefixed with DPAPI, base64 encoded (Chromium 138 os_crypt_win).
    if(!dpapi.protect({cbData:key.length,pbData:key},'Music Player',null,null,null,4,output))throw Error('Unable to protect player encryption key');
    const encrypted=Buffer.from(dpapi.k.decode(output.pbData,'uint8',output.cbData));
    return {os_crypt:{encrypted_key:Buffer.concat([Buffer.from('DPAPI'),encrypted]).toString('base64')}};
  }finally{key.fill(0);if(output.pbData)dpapi.free(output.pbData);}
}

function fileName(name) {
  if (typeof name !== 'string' || !name || name !== path.basename(name) || /[\\/\x00-\x1f]/.test(name) || name === '.' || name === '..') throw Error('Invalid portable data filename');
  return name;
}
const samePath = (a, b) => typeof a === 'string' && typeof b === 'string' && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Call before app.whenReady(), sessions, logs, services, or any getPath-based store.
 * Only this process's environment changes. No registry / OS environment edits.
 * Test userData intentionally stays at the exact override for existing fixtures.
 */
function bootstrapPortableStorage({app, devRoot = __dirname, env = process.env, legacyRoots, createProfileKeys=createWindowsProfileKeys} = {}) {
  if (!app || typeof app.getPath !== 'function' || typeof app.setPath !== 'function') throw Error('Electron app paths are required');
  const testMode = typeof env.MUSIC_DOWNLOADER_TEST_USER_DATA === 'string' && !!env.MUSIC_DOWNLOADER_TEST_USER_DATA.trim();
  const oldUserData = testMode ? null : app.getPath('userData');
  const oldMusic = testMode ? null : app.getPath('music');
  const root = path.resolve(testMode ? env.MUSIC_DOWNLOADER_TEST_USER_DATA : app.isPackaged ? path.dirname(app.getPath('exe')) : devRoot);
  const userData = testMode ? root : path.join(root, 'data');
  const playlists = path.join(root, 'playlists');
  const cache = path.join(root, '缓存');
  const downloads = path.join(root, '下载');
  const sessionData = path.join(cache, '浏览器');
  const temp = path.join(cache, '临时');
  const logs = path.join(cache, '日志');
  const audio = path.join(cache, '音频');
  const lyrics = path.join(cache, '歌词');
  const crashDumps = path.join(cache, '崩溃报告');
  const mkdir = directory => { fs.mkdirSync(directory, {recursive:true}); return directory; };
  function ensureCache() {
    for (const dir of [cache, sessionData, temp, logs, audio, lyrics, crashDumps]) mkdir(dir);
    return cache;
  }
  const persistentFile = name => path.join(mkdir(userData), fileName(name));
  const playlistFile = name => path.join(mkdir(playlists), fileName(name));
  const cacheFile = name => path.join(ensureCache(), fileName(name));
  const defaults = oldMusic ? [path.join(oldMusic, 'NeteaseDownloads')] : [];
  function isLegacyDefault(value) { return defaults.some(directory => samePath(directory, value)); }
  function isLegacyFavoriteDefault(value) { return defaults.some(directory => samePath(path.join(directory, '收藏'), value)); }
  function normalizeSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const result = {...value};
    const previousDefault = isLegacyDefault(value.downloadDir);
    if (previousDefault) result.downloadDir = downloads;
    if (isLegacyFavoriteDefault(value.favoritesDir)) result.favoritesDir = path.join(result.downloadDir || downloads, '收藏');
    return result;
  }
  function normalizeLibraryRoots(value) {
    if (!value || !Array.isArray(value.directories)) return value;
    return {...value, directories:value.directories.filter(directory => !isLegacyDefault(directory) && !isLegacyFavoriteDefault(directory))};
  }
  // Preserve each account and its encryption key together. Existing English
  // profiles win; archive a second profile whole instead of mixing credentials.
  function migrateDirectory(oldName,newName){
    const source=path.resolve(root,oldName),destination=path.resolve(root,newName);
    if(path.dirname(source)!==root||path.dirname(destination)!==root)throw Error('Invalid portable migration path');
    if(!fs.existsSync(source))return;
    const stat=fs.lstatSync(source);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Portable migration requires a real directory');
    if(fs.existsSync(destination)){
      const target=fs.lstatSync(destination);
      if(!target.isDirectory()||target.isSymbolicLink())throw Error('Invalid portable destination');
      if(fs.readdirSync(destination).length===0)fs.rmdirSync(destination);
      else{
        let backup=path.join(destination,'legacy-profile'),index=1;
        while(fs.existsSync(backup))backup=path.join(destination,'legacy-profile-'+index++);
        fs.renameSync(source,backup);return;
      }
    }
    fs.renameSync(source,destination);
  }
  if(!testMode){migrateDirectory('播放器数据','data');migrateDirectory('歌单','playlists');}
  for (const directory of [userData, playlists, downloads]) mkdir(directory);
  ensureCache();

  // Never scan AppData or any other real installation when using a test override.
  const sources = testMode ? [] : [...new Set((legacyRoots || [oldUserData, path.join(app.getPath('appData'), 'netease-music-desktop-electron')]).filter(Boolean).map(directory => path.resolve(directory)))].filter(directory => !samePath(directory, userData));
  const report = {copied:[], skipped:[], alreadyMigrated:false};
  const marker = persistentFile(MARKER);
  const encryptionKeyFile=persistentFile('chromium-encryption-key.json');
  const browserStateFile=path.join(sessionData,'Local State');
  function copySmall(source, destination, json, transform) {
    if (fs.existsSync(destination)) return false;
    let bytes;
    try {
      const stat = fs.lstatSync(source);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > (json ? MAX_JSON_BYTES : 64 * 1024)) { report.skipped.push(path.basename(source)); return false; }
      bytes = fs.readFileSync(source);
      if (json) {
        const value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
        bytes = Buffer.from(JSON.stringify(transform ? transform(value) : value, null, 2));
      }
    } catch (error) {
      if (error.code !== 'ENOENT') report.skipped.push(path.basename(source));
      return false;
    }
    // Exclusive creation makes concurrent starts and existing portable files safe.
    // Never include bytes, paths, cookies, or exception messages in diagnostics.
    try { fs.writeFileSync(destination, bytes, {flag:'wx', mode:0o600}); report.copied.push(path.basename(destination)); return true; }
    catch (error) { if (error.code !== 'EEXIST') throw Error('Unable to migrate portable player data'); }
    return false;
  }
  if (!testMode && !fs.existsSync(marker)) {
    for (const directory of sources) {
      for (const name of [...SETTINGS_FILES, ...PLAYLIST_FILES]) {
        const target = PLAYLIST_FILES.has(name) ? playlistFile(name) : persistentFile(name);
        const transform = name === 'settings.json' ? normalizeSettings : name === 'library-roots.json' ? normalizeLibraryRoots : undefined;
        copySmall(path.join(directory, name), target, true, transform);
        copySmall(path.join(directory, name + '.bak'), target + '.bak', true, transform);
      }
      // DPAPI safeStorage bytes remain encrypted; no plaintext-account variants,
      // Chromium cookies, session databases, audio, downloads or caches migrate.
      if (copySmall(path.join(directory, 'netease-account-v3.enc'), persistentFile('netease-account-v3.enc'), false)) {
        copySmall(path.join(directory, 'Local State'), encryptionKeyFile, true, encryptedProfileKeys);
      }
    }
    try { fs.writeFileSync(marker, JSON.stringify({version:1}), {flag:'wx', mode:0o600}); }
    catch (error) { if (error.code !== 'EEXIST') throw Error('Unable to record portable data migration'); }
  } else report.alreadyMigrated = !testMode;

  function readKeys(file){
    try{
      const stat=fs.lstatSync(file);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_JSON_BYTES)return null;
      return encryptedProfileKeys(readJSON(file,null));
    }catch{return null;}
  }
  function restoreEncryptionKeys(){
    let keys=readKeys(encryptionKeyFile);
    if(!keys){
      // Recover earlier portable layouts and already-generated browser keys
      // locally even if the legacy migration marker has been written.
      keys=readKeys(browserStateFile)||readKeys(persistentFile('Local State'));
      if(!keys&&!fs.existsSync(encryptionKeyFile))keys=createProfileKeys();
      if(keys){keys=encryptedProfileKeys(keys);writeJSONAtomic(encryptionKeyFile,keys);}
    }
    if(!keys)return false;
    let browser=readJSON(browserStateFile,{});
    if(!browser||typeof browser!=='object'||Array.isArray(browser))throw Error('Invalid browser Local State; original preserved');
    browser={...browser,os_crypt:{...(browser.os_crypt&&typeof browser.os_crypt==='object'?browser.os_crypt:{}),...keys.os_crypt}};
    writeJSONAtomic(browserStateFile,browser);return true;
  }
  function persistEncryptionKeys(){
    const keys=readKeys(browserStateFile);
    if(!keys)return false;
    writeJSONAtomic(encryptionKeyFile,keys);return true;
  }
  // Chromium does not flush a newly generated key before app quit events. Seed
  // a DPAPI-wrapped key before ready instead, so a crash cannot strand login.
  restoreEncryptionKeys();

  app.setPath('userData', userData);
  app.setPath('sessionData', sessionData);
  app.setPath('temp', temp);
  app.setPath('crashDumps', crashDumps);
  app.setAppLogsPath?.(logs);
  app.commandLine?.appendSwitch('disk-cache-dir', path.join(sessionData, 'Cache'));
  env.TEMP = temp;
  env.TMP = temp;
  env.NETEASE_DOWNLOAD_DIR = downloads;
  return Object.freeze({root, userData, playlists, cache, sessionData, temp, logs, crashDumps, testMode, report,encryptionKeyFile,browserStateFile,restoreEncryptionKeys,persistEncryptionKeys,
    persistentFile, playlistFile, cacheFile, ensureCache, normalizeSettings, normalizeLibraryRoots, isLegacyDefault,
    downloadsDir:() => mkdir(downloads), favoritesDir:() => mkdir(path.join(downloads, '收藏')),
    audioDir:() => { ensureCache(); return audio; }, lyricDir:() => { ensureCache(); return lyrics; }});
}
module.exports = {bootstrapPortableStorage};
