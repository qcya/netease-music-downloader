'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { Readable } = require('node:stream');
const { createDownloadQueue } = require('./download_queue.js');
const { createFloatingLyricsController } = require('./floating_window.js');
const { createPlaylistStore } = require('./local_playlist.js');
const {normalizeLyrics,DEFAULT_LYRICS}=require('./lyric_preferences.js');
const {embeddedBackend}=require('./backend_runtime.js');
const {createLogger}=require('./app_logger.js');

// 开发版使用独立的 Windows 任务栏分组，避免复用旧版 EXE 的固定图标。
const APPLICATION_ID = app.isPackaged ? 'top.qcya.netease.music.desktop' : 'top.qcya.netease.music.desktop.dev';
const AUDIO_EXTS = new Set(['.mp3','.flac','.m4a','.ogg','.wav','.aac']);
const BACKGROUND_EXTS=new Set(['.mp4','.webm','.png','.jpg','.jpeg','.webp']);
let win;
const downloadHistory=new Map();
let historyFlushTimer=null;
let activeCliProcesses = 0;
const favoriteRequests = new Map();
const previewRequests = new Map();
const downloadQueue = createDownloadQueue({limit:3, onState:task => {
  const old=downloadHistory.get(task.key)||{};
  downloadHistory.set(task.key,{...old,...task,time:Date.now()});
  if(downloadHistory.size>500)downloadHistory.delete(downloadHistory.keys().next().value);
  if(win && !win.isDestroyed()) win.webContents.send('download:task',task);
  if(historyFlushTimer)clearTimeout(historyFlushTimer);
  historyFlushTimer=setTimeout(()=>{try{writeJSONAtomic(historyFile(),[...downloadHistory.values()].slice(-300))}catch(e){console.warn('历史保存失败',e.message)}},500);
}});
let cachedPython = null;
let previewPlaying = false;
const grantedMedia = new Map();
const remotePreview = new Map();
const previewSourceCache=new Map();
const previewSourcePending=new Map();
const lyricsPending=new Map();
if (protocol?.registerSchemesAsPrivileged) {
  protocol.registerSchemesAsPrivileged([{scheme:'music-media', privileges:{standard:true, secure:true, stream:true, supportFetchAPI:true}},{scheme:'music-preview',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true}}]);
}

function resources(...p) {
  return app.isPackaged ? path.join(process.resourcesPath, ...p) : path.join(__dirname, ...p);
}
function backendFile() { return resources('skill', 'scripts', 'music_skill.py'); }
function appIcon() { return app.isPackaged ? path.join(process.resourcesPath, 'app.ico') : path.join(__dirname, 'assets', 'app.ico'); }
function configFile() { return path.join(app.getPath('userData'), 'settings.json'); }
function getDefaultDir() { return path.join(app.getPath('music'), 'NeteaseDownloads'); }
function cacheDir() { return path.join(app.getPath('userData'), 'audio-cache'); }
function lyricDir() { return path.join(app.getPath('userData'), 'lyric-cache'); }
function manifestFile() { return path.join(cacheDir(), 'manifest.json'); }
function favoritesFile() { return path.join(app.getPath('userData'), 'favorites.json'); }
function playlistsFile(){return path.join(app.getPath('userData'),'my-playlists.json')}
function favoritesDir() { return config().favoritesDir; }
function historyFile(){return path.join(app.getPath('userData'),'download-history.json');}
function cacheMaintenanceFile() { return path.join(app.getPath('userData'), 'cache-maintenance.json'); }
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function weeklyCacheCleanup(now=Date.now()) {
  const data = readJSON(cacheMaintenanceFile(), null);
  const previous = Number(data?.lastClear || 0);
  if (previous && now >= previous && now - previous < WEEK_MS) return false;
  // 永不触碰已下载文件、收藏目录和收藏索引。
  fs.rmSync(cacheDir(),{recursive:true,force:true});
  fs.rmSync(lyricDir(),{recursive:true,force:true});
  grantedMedia.clear();
  writeJSONAtomic(cacheMaintenanceFile(),{lastClear:now});
  return true;
}
function readFavorites() {
  const rows = readJSON(favoritesFile(), {});
  return rows && typeof rows==='object' && !Array.isArray(rows) ? rows : {};
}
function validFavorite(row, id) {
  if (!row || !validId(id) || typeof row.audioPath !== 'string') return null;
  const full = path.resolve(row.audioPath);
  // 独立保存收藏路径；旧收藏在用户切换下载目录后也依然有效。
  if (!path.isAbsolute(row.audioPath) || !AUDIO_EXTS.has(path.extname(full).toLowerCase()) || !fs.existsSync(full)) return null;
  const lyric=typeof row.lyricPath==='string' && path.resolve(row.lyricPath)===lrcSidecar(full) ? row.lyricPath : '';
  return {...row,id,audioPath:full,lyricExists:!!(lyric&&fs.existsSync(lyric))};
}
function listFavorites() {return Object.entries(readFavorites()).map(([id,r])=>validFavorite(r,id)).filter(Boolean).sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));}
function lrcSidecar(audioPath) {return path.join(path.dirname(audioPath),path.parse(audioPath).name+'.lrc');}
async function saveFavoriteLyrics(id, audioPath) {
  const text = await fetchLyrics(id, true);
  if (!text.found || !text.lrc?.trim()) return {lyricsAvailable:false,diagnostic:text.diagnostic || []};
  const sidecar=lrcSidecar(audioPath);
  fs.writeFileSync(sidecar,text.lrc, 'utf8');
  return {lyricsAvailable:true,lyricPath:sidecar};
}
async function addFavoriteImpl(track) {
  if (!track || !validId(track.id)) throw new Error('歌曲信息无效');
  const sid=String(track.id);
  const known=validFavorite(readFavorites()[sid],sid);
  if(known) return known;
  const dir=favoritesDir();
  fs.mkdirSync(dir,{recursive:true});
  const result=await downloadTrack(sid, dir, 'lossless', 'favorite');
  const row=result;
  if(!row?.ok || typeof row.path!=='string')throw new Error(row?.error || '该歌曲无法获得真实无损音频');
  const full=path.resolve(row.path);
  if(!inDirectory(dir,full)||!fs.existsSync(full)||!['.flac','.wav'].includes(path.extname(full).toLowerCase()))throw new Error('接口没有返回真实无损音频，已停止收藏');
  const saved={id:sid,name:String(track.name||row.song?.name||'未知歌曲'),artists:String(track.artists||row.song?.artists||''),
               album:String(track.album||''),audioPath:full,addedAt:Date.now(),lyricsAvailable:false};
  try{Object.assign(saved,await saveFavoriteLyrics(sid,full));}
  catch(e){saved.lyricError=String(e.message || e);}
  const index=readFavorites();index[sid]=saved;writeJSONAtomic(favoritesFile(),index);
  return {...saved,lyricExists:!!saved.lyricPath};
}
function addFavorite(track) {
  if (!track || !validId(track.id)) return Promise.reject(new Error('歌曲信息无效'));
  const id=String(track.id);
  if (favoriteRequests.has(id)) return favoriteRequests.get(id);
  const promise=addFavoriteImpl(track).finally(()=>favoriteRequests.delete(id));
  favoriteRequests.set(id,promise);
  return promise;
}

async function refreshFavoriteLyrics(id) {
  const rows=readFavorites();const found=validFavorite(rows[id],id);
  if(!found)throw new Error('未找到收藏中的歌曲');
  const updated=await saveFavoriteLyrics(id,found.audioPath);
  rows[id]={...rows[id],...updated};
  writeJSONAtomic(favoritesFile(),rows);
  return validFavorite(rows[id],id);
}

function validId(id) { return /^\d{1,20}$/.test(String(id || '')); }
function writeJSONAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}
function readJSON(file, fallback) {try {return JSON.parse(fs.readFileSync(file, 'utf8'));} catch{return fallback;}}
function inDirectory(directory, file) {
  const root = path.resolve(directory) + path.sep;
  const full = path.resolve(file);
  return full.startsWith(root);
}
/** A single playlist shares the download directory; [歌单] is a real filename prefix.
 * Legacy multiple-playlist JSON is merged without deleting files. */
const localPlaylist=createPlaylistStore({
  getDir:()=>config().downloadDir,
  getIndexFile:()=>playlistsFile(),
  readJSON,writeJSONAtomic
});
function availableLocalTrack(name){return localPlaylist.localFile(name)}
function readPlaylists(){return localPlaylist.list()}
function changeLocalPlaylist(id,name,add){
  return add?localPlaylist.add(id,name):localPlaylist.remove(id,name);
}
function cachedManifest() {
  const rows = readJSON(manifestFile(), {});
  return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
}
function cacheItem(id) {
  if (!validId(id)) return null;
  const row = cachedManifest()[id];
  if (!row || typeof row.file !== 'string' || path.basename(row.file) !== row.file || !AUDIO_EXTS.has(path.extname(row.file).toLowerCase())) return null;
  const full = path.join(cacheDir(), row.file);
  if (!inDirectory(cacheDir(), full) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return {...row, full};
}
function grantMedia(file) {
  if (!fs.existsSync(file) || ![...AUDIO_EXTS,...BACKGROUND_EXTS].includes(path.extname(file).toLowerCase())) throw new Error('不是允许的本地媒体文件');
  const token = randomUUID();
  grantedMedia.set(token, file);
  if (grantedMedia.size > 150) grantedMedia.delete(grantedMedia.keys().next().value);
  return `music-media://audio/${token}`;
}
/** Direct local file loading is required for reliable native audio seeking in Electron.
 * The custom protocol.handle Response path can report a song duration but expose zero seekable ranges. */
function localAudioUrl(file) {
  const full=path.resolve(file);
  if(!AUDIO_EXTS.has(path.extname(full).toLowerCase())||!fs.statSync(full).isFile())throw new Error('本地音频不存在或格式不允许');
  return pathToFileURL(full).href;
}
function mimeAudio(file) {
  return ({'.mp3':'audio/mpeg','.flac':'audio/flac','.wav':'audio/wav','.m4a':'audio/mp4','.ogg':'audio/ogg','.aac':'audio/aac','.mp4':'video/mp4','.webm':'video/webm','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'})[path.extname(file).toLowerCase()] || 'application/octet-stream';
}
async function mediaResponse(request) {
  const parsed = new URL(request.url);
  const token = parsed.hostname === 'audio' ? parsed.pathname.slice(1) : '';
  const file = grantedMedia.get(token);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('Not found', {status:404});
  const size = fs.statSync(file).size;
  const value = request.headers.get('range');
  let start = 0, end = size - 1, status = 200;
  if (value) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(value);
    if (!match || (!match[1] && !match[2])) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix <= 0) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
      start = Math.max(0, size-suffix);
    } else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(size-1, Number(match[2]));
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      return new Response(null, {status:416,headers:{'Content-Range':`bytes */${size}`}});
    }
    status = 206;
  }
  const headers = {'Content-Type':mimeAudio(file),'Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Cache-Control':'no-store'};
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  return new Response(Readable.toWeb(fs.createReadStream(file,{start,end})),{status,headers});
}
function cachedToDownloads(id, targetDir, quality) {
  const item = cacheItem(id);
  if (!item || item.purpose === 'preview') return null;
  const ext = path.extname(item.file).toLowerCase();
  if (quality === 'lossless' && !['.flac','.wav'].includes(ext)) return null;
  if (quality === 'mp3' && ext !== '.mp3') return null;
  const clean = value => String(value || '未知歌曲').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 120);
  const base = clean(`${item.name} - ${item.artists || '未知歌手'}`);
  const target = path.join(targetDir,`${base} [${id}]${ext}`);
  const state = fs.existsSync(target) ? 'skipped_exists' : 'copied_from_cache';
  if (state !== 'skipped_exists') fs.copyFileSync(item.full,target,fs.constants.COPYFILE_EXCL);
  return {ok:true,status:state,path:target,format:ext.slice(1),song:{id,name:item.name,artists:item.artists}};
}

function statsCache() {
  let count=0,bytes=0;
  try {for(const file of fs.readdirSync(cacheDir(),{withFileTypes:true})) {
    if(file.isFile() && AUDIO_EXTS.has(path.extname(file.name).toLowerCase())) {count++;bytes+=fs.statSync(path.join(cacheDir(),file.name)).size;}
  }} catch {}
  return {count,bytes,cacheDir:cacheDir()};
}
function pruneCache(limitMB=1024, excludeId=null) {
  const rows = cachedManifest();
  const candidates = [];
  for (const [id, entry] of Object.entries(rows)) {
    const item = cacheItem(id);
    if (item && id !== excludeId) candidates.push({id,entry, size:fs.statSync(item.full).size,full:item.full});
    if (!item) delete rows[id];
  }
  let bytes = statsCache().bytes;
  const max = limitMB*1024*1024;
  candidates.sort((a,b)=>(a.entry.accessed || 0)-(b.entry.accessed || 0));
  for(const entry of candidates){
    if(bytes<=max) break;
    fs.rmSync(entry.full,{force:true});bytes-=entry.size;delete rows[entry.id];
  }
  writeJSONAtomic(manifestFile(), rows);
}


function config() {
  const defaultSettings = { downloadDir: getDefaultDir(), favoritesDir:path.join(getDefaultDir(),'收藏'), setupCompleted:false, disclaimerAcceptedVersion:0,desktopLyricsEnabled:false,playerBackgroundPath:'', quality: 'best', apiBases: [], cacheLimitMB: 1024, parallelDownloads: 3, floatingLyrics:normalizeLyrics() };
  try {
    const stored = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
    if (stored && typeof stored === 'object') {
      const dir = (typeof stored.downloadDir === 'string' && stored.downloadDir.trim()) ? stored.downloadDir : defaultSettings.downloadDir;
      const quality = 'best'; // No legacy MP3-only preference in the new download-first UI.
      const bases = Array.isArray(stored.apiBases) ? stored.apiBases.filter(x => typeof x === 'string') : [];
      const cacheLimitMB = [512,1024,2048,5120].includes(stored.cacheLimitMB) ? stored.cacheLimitMB : 1024;
      const parallelDownloads = [1,2,3,4,6].includes(stored.parallelDownloads) ? stored.parallelDownloads : 3;
      return {downloadDir:dir, favoritesDir:typeof stored.favoritesDir==='string'&&path.isAbsolute(stored.favoritesDir)?stored.favoritesDir:path.join(dir,'收藏'),setupCompleted:stored.setupCompleted===true,disclaimerAcceptedVersion:Number(stored.disclaimerAcceptedVersion)===1?1:0,desktopLyricsEnabled:stored.desktopLyricsEnabled===true,playerBackgroundPath:typeof stored.playerBackgroundPath==='string'&&path.isAbsolute(stored.playerBackgroundPath)&&BACKGROUND_EXTS.has(path.extname(stored.playerBackgroundPath).toLowerCase())?stored.playerBackgroundPath:'',quality,apiBases:bases,cacheLimitMB,parallelDownloads,floatingLyrics:normalizeLyrics(stored.floatingLyrics)};
    }
  } catch { /* first run */ }
  return defaultSettings;
}
function ensureData() { fs.mkdirSync(app.getPath('userData'), {recursive:true}); }
function writeConfig(value) {
  if (!value || typeof value !== 'object') throw new Error('设置格式无效');
  const dir = typeof value.downloadDir === 'string' ? value.downloadDir.trim() : '';
  if (!dir || dir.length > 1024 || !path.isAbsolute(dir)) throw new Error('保存目录必须是完整的本地路径');
  const favoritesDir=typeof value.favoritesDir==='string'&&path.isAbsolute(value.favoritesDir)&&value.favoritesDir.length<=1024?value.favoritesDir:path.join(dir,'收藏');
  const setupCompleted=value.setupCompleted===true;
  const quality = 'best'; // Search-result downloads always request the highest available format.
  const bases = Array.isArray(value.apiBases) ? value.apiBases : [];
  if (bases.length > 8) throw new Error('接口数量最多 8 个');
  const clean = bases.map(raw => {
    if (typeof raw !== 'string') throw new Error('接口地址格式错误');
    const value = raw.trim().replace(/\/+$/g, '');
    const url = new URL(value);
    if (!['https:','http:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
      throw new Error('API 地址必须是 http(s) 根地址，不能带账号、查询参数或锚点');
    }
    return value;
  });
  const cacheLimitMB = [512,1024,2048,5120].includes(value.cacheLimitMB) ? value.cacheLimitMB : 1024;
  const parallelDownloads = [1,2,3,4,6].includes(value.parallelDownloads) ? value.parallelDownloads : 3;
  const result = {downloadDir:dir,favoritesDir,setupCompleted,disclaimerAcceptedVersion:Number(value.disclaimerAcceptedVersion)===1?1:0,desktopLyricsEnabled:value.desktopLyricsEnabled===true,playerBackgroundPath:typeof value.playerBackgroundPath==='string'&&path.isAbsolute(value.playerBackgroundPath)&&BACKGROUND_EXTS.has(path.extname(value.playerBackgroundPath).toLowerCase())?value.playerBackgroundPath:'',quality,apiBases:[...new Set(clean)],cacheLimitMB,parallelDownloads,floatingLyrics:normalizeLyrics(value.floatingLyrics)};
  ensureData();
  fs.writeFileSync(configFile() + '.tmp', JSON.stringify(result, null, 2), 'utf8');
  fs.renameSync(configFile() + '.tmp', configFile());
  downloadQueue.setLimit(parallelDownloads);
  floatingLyrics.applySettings(result.floatingLyrics);
  return result;
}

function invokeProcess(executable, args, timeoutMs, environment = process.env, progress = null, signal = null) {
  return new Promise((resolve, reject) => {
    if(signal?.aborted)return reject(new Error('任务已取消'));
    const child = spawn(executable, args, { windowsHide:true, env:environment, cwd: path.dirname(backendFile()) });
    // setEncoding uses StringDecoder to preserve multibyte UTF-8 across chunks.
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    const terminate=()=>{try{child.kill()}catch{}};
    if(signal)signal.addEventListener('abort',terminate,{once:true});
    let stdout = '', stderr = '', settled = false, pendingProgress = '';
    const timeout = setTimeout(() => {
      child.kill();
      finalize(new Error('执行超时。接口可能不可用，请检查网络或稍后重试。'));
    }, timeoutMs);
    function finalize(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if(signal)signal.removeEventListener('abort',terminate);
      if(signal?.aborted)return reject(new Error('任务已取消'));
      if (error) reject(error);
      else resolve(result);
    }
    child.on('error', err => finalize(new Error(`无法启动 Python：${err.message}`)));
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 8_000_000) { child.kill(); finalize(new Error('接口结果过大')); }
    });
    child.stderr.on('data',chunk=>{
      const line=chunk;stderr+=line;
      if(stderr.length>100_000)stderr=stderr.slice(-100_000);
      pendingProgress+=line;
      while(pendingProgress.includes('\n')){
        const end=pendingProgress.indexOf('\n');const one=pendingProgress.slice(0,end);pendingProgress=pendingProgress.slice(end+1);
        if(progress)progress(one);
      }
    });
    child.on('close',code=>{if(progress&&pendingProgress.trim())progress(pendingProgress);finalize(null,{code,stdout,stderr})});
  });
}
function pythonCandidates() {
  const candidates = [];
  if (process.env.MUSIC_PYTHON_EXE) candidates.push([process.env.MUSIC_PYTHON_EXE, []]);
  if (process.platform === 'win32') {
    candidates.push(['py', ['-3.10']], ['py', ['-3']], ['python', []]);
  } else {
    candidates.push(['python3', []], ['python', []]);
  }
  return candidates;
}
async function findPython() {
  if (cachedPython) return cachedPython;
  const embedded=embeddedBackend(process.resourcesPath,app.isPackaged);
  if(embedded){cachedPython=embedded;return embedded;}
  for (const [exe, prefix] of pythonCandidates()) {
    try {
      const result = await invokeProcess(exe, [...prefix,'-c','import sys;print(sys.version_info.major,sys.version_info.minor)'], 7000);
      const match = result.stdout.trim().match(/^(\d+) (\d+)$/);
      if (result.code === 0 && match && (+match[1] > 3 || (+match[1] === 3 && +match[2] >= 10))) {
        cachedPython = {exe, prefix};
        return cachedPython;
      }
    } catch { /* try the next candidate */ }
  }
  throw new Error('没有找到 Python 3.10+。请先安装 Python，并执行「安装依赖.bat」。');
}
async function runCli(cmd, args = [], opts = {}) {
  activeCliProcesses++;
  try {
    const python = await findPython();
    const settings = config();
    const baseArgs = settings.apiBases.flatMap(b => ['--api-base', b]);
    const env = {...process.env, PYTHONIOENCODING:'utf-8', PYTHONUTF8:'1', PYTHONUNBUFFERED:'1'};
    const result = await invokeProcess(python.exe, [...python.prefix,...(python.standalone?[]:[backendFile()]),...baseArgs,cmd,...args],
      opts.timeoutMs || 90_000, env, line => {
        if (opts.progress && win && !win.isDestroyed()) {
          for(const chunk of line.split('\n')){
            const match=chunk.match(/PROGRESS_JSON:(\{[^\n]*\})/);
            if(match){try{const parsed=JSON.parse(match[1]);win.webContents.send('download:progress',{id:opts.songId||null,progress:parsed});if(opts.onProgress)opts.onProgress(parsed)}catch{}}
            else if(chunk.trim())win.webContents.send('download:progress',{id:opts.songId||null,message:chunk.slice(0,500)});
          }
        }
      }, opts.signal || null);
    let data;
    try { data = JSON.parse(result.stdout.trim()); }
    catch { throw new Error(`Python 未能返回有效数据：${(result.stderr || result.stdout || '未知错误').slice(-700)}`); }
    if (!data || (data.ok === false && !('results' in data))) {
      throw new Error(data?.error || result.stderr.trim() || '操作失败');
    }
    return data;
  } finally {
    activeCliProcesses--;
  }
}

/** One Python process per track, up to three processes active globally.
 * All file downloads for a given destination/ID/quality are coalesced. */
function downloadTrack(id, targetDir, quality, purpose='download') {
  const [sid] = songIds([id]);
  const directory=path.resolve(targetDir);
  const key=[directory,quality,sid].join('\0');
  const meta={id:sid, purpose, name:sid};
  return downloadQueue.enqueue(key,meta,async(signal,reportProgress)=>{
    const data=await runCli('download',['--id',sid,'--quality',quality,'--out',directory],
      {progress:true,songId:sid,timeoutMs:240_000,signal,onProgress:reportProgress});
    const item=data?.results?.[0];
    if(!item || !item.ok) return item || {ok:false,song:{id:sid},error:'下载没有返回结果'};
    return item;
  });
}

function songIds(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) throw new Error('请选择 1–100 首歌曲');
  const result = [...new Set(ids.map(String))];
  if (result.some(x => !/^\d{1,20}$/.test(x))) throw new Error('无效歌曲 ID');
  return result;
}
async function prepareAudioImpl(id) {
  const [sid] = songIds([id]);
  let entry = cacheItem(sid);
  // v4 无损试听缓存不能用于 v5 的快速 MP3 试听；自动重新获取一次小文件。
  if (entry && path.extname(entry.file).toLowerCase() !== '.mp3') {
    fs.rmSync(entry.full,{force:true});
    entry = null;
  }
  const fromCache = !!entry;
  if (!entry) {
    fs.mkdirSync(cacheDir(),{recursive:true});
    const result=await runCli('download',['--id',sid,'--quality','preview','--out',cacheDir()],{timeoutMs:180_000});
    const first=result?.results?.[0];
    if(!first?.ok || typeof first.path!=='string') throw new Error(first?.error || '暂时无法获取 MP3 试听音源');
    const full=path.resolve(first.path);
    if(!inDirectory(cacheDir(),full) || !fs.existsSync(full) || path.extname(full).toLowerCase()!=='.mp3')throw new Error('试听必须使用 MP3，接口没有提供有效 MP3');
    entry={file:path.basename(full),name:first.song?.name || sid,artists:first.song?.artists || '',quality:'mp3',purpose:'preview',accessed:Date.now(),full};
  }
  const data=cachedManifest();
  data[sid]={file:entry.file,name:entry.name,artists:entry.artists,quality:'mp3',purpose:'preview',accessed:Date.now()};
  writeJSONAtomic(manifestFile(),data);
  pruneCache(config().cacheLimitMB,sid);
  return {ok:true,id:sid,name:entry.name,artists:entry.artists,quality:'mp3',fromCache,url:grantMedia(entry.full)};
}
function prepareAudio(id) {
  const [sid]=songIds([id]);
  if (previewRequests.has(sid)) return previewRequests.get(sid);
  const request=prepareAudioImpl(sid).finally(()=>previewRequests.delete(sid));
  previewRequests.set(sid,request);
  return request;
}

async function fetchLyrics(id, force=false) {
  const [sid] = songIds([id]);
  if(lyricsPending.has(sid))return lyricsPending.get(sid);
  const task=(async()=>{
    const file=path.join(lyricDir(),sid+'.json');
    const favorite=validFavorite(readFavorites()[sid],sid);
    if(!force && favorite?.lyricExists){
      const text=fs.readFileSync(favorite.lyricPath,'utf8');
      return {id:sid,found:true,lrc:text,translated_lrc:'',fromFavorite:true};
    }
    const saved=readJSON(file,null);
    if(!force && saved && saved.schema===2 && Date.now()-saved.checkedAt < (saved.found ? 30*24*3600e3 : 10*60_000)) {
      return {id:sid,found:saved.found,lrc:saved.lrc,translated_lrc:saved.translated_lrc,diagnostic:saved.diagnostic||[],fromCache:true};
    }
    const fresh=await runCli('lyric',['--id',sid],{timeoutMs:90_000});
    const out={schema:2,id:sid,found:!!fresh.found,lrc:fresh.lrc||'',translated_lrc:fresh.translated_lrc||'',
               diagnostic:fresh.diagnostic||[],checkedAt:Date.now()};
    writeJSONAtomic(file,out);
    return {...out,fromCache:false};
  })();
  lyricsPending.set(sid,task);
  try{return await task;}finally{if(lyricsPending.get(sid)===task)lyricsPending.delete(sid)}
}

const floatingLyrics=createFloatingLyricsController({BrowserWindow,Menu,baseDir:__dirname,getMainWindow:()=>win,getSettings:()=>config().floatingLyrics,screen:require('electron').screen});

function safeAudioOrigin(value) {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)))return false;
    return /(^|\.)(?:music\.126\.net|music\.163\.com|126\.net)$/.test(url.hostname) || ['localhost','127.0.0.1'].includes(url.hostname);
  }catch{return false;}
}
async function proxyPreview(req) {
  const token=new URL(req.url).pathname.slice(1);
  let uri=remotePreview.get(token);
  if(!uri)return new Response('Not found',{status:404});
  try {
    for(let i=0;i<4;i++) {
      if(!safeAudioOrigin(uri))return new Response('Unsupported audio host',{status:403});
      const headers={};const range=req.headers.get('range');if(range)headers.Range=range;
      const response=await fetch(uri,{headers,redirect:'manual',signal:AbortSignal.timeout(22000)});
      if(response.status>=300&&response.status<400){uri=new URL(response.headers.get('location'),uri).href;response.body?.cancel();continue;}
      if(!response.ok)return new Response(null,{status:response.status});
      const mime=response.headers.get('content-type')||'';
      if(!/audio\/mpeg|audio\/mp3|application\/octet-stream/.test(mime))return new Response('Not MP3',{status:415});
      const responseHeaders={'Content-Type':'audio/mpeg','Accept-Ranges':response.headers.get('accept-ranges')||'bytes','Cache-Control':'no-store'};
      for(const key of ['content-length','content-range']){const v=response.headers.get(key);if(v)responseHeaders[key]=v;}
      return new Response(response.body,{status:response.status,headers:responseHeaders});
    }
  }catch(e){console.warn('流式试听失败：',e.message)}
  return new Response(null,{status:502});
}
async function beginStream(id){
  const [sid]=songIds([id]);
  const cached=cacheItem(sid);
  if(cached&&cached.file.toLowerCase().endsWith('.mp3'))return {ok:true,fromCache:true,url:grantMedia(cached.full),name:cached.name,artists:cached.artists,id:sid};
  // A short-lived source cache avoids repeating Python startup and API calls on replay.
  let info=previewSourceCache.get(sid);
  if(!info||info.expiresAt<Date.now()){
    let pending=previewSourcePending.get(sid);
    if(!pending){pending=runCli('preview-source',['--id',sid],{timeoutMs:18000}).finally(()=>previewSourcePending.delete(sid));previewSourcePending.set(sid,pending);}
    info=await pending;
    previewSourceCache.set(sid,{...info,expiresAt:Date.now()+120000});
  }
  if(!info?.url||!safeAudioOrigin(info.url))throw new Error('未找到可信的 MP3 试听地址');
  const token=randomUUID();remotePreview.set(token,info.url);
  if(remotePreview.size>100)remotePreview.delete(remotePreview.keys().next().value);
  return {ok:true,id:sid,fromCache:false,streaming:true,url:`music-preview://audio/${token}`};
}

function createWindow() {
  win = new BrowserWindow({
    width: 1210, height: 790, minWidth: 930, minHeight: 620,
    title: '音乐下载器 v1.0.2', icon: appIcon(), backgroundColor: '#FFFAFD',
    show: false, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true, sandbox: true
    }
  });
  if (process.platform === 'win32') {
    // setAppDetails 提供任务栏标识；显式 setIcon 则更新当前运行窗口图标。
    win.setIcon(appIcon());
    win.setAppDetails({appId: APPLICATION_ID, appIconPath: appIcon(), appIconIndex:0});
  }
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // Desktop lyrics must not cover/intercept our own controls while this window is active.
  win.on?.('focus',()=>floatingLyrics.setMainFocused(true));
  win.on?.('blur',()=>floatingLyrics.setMainFocused(false));
  win.once('ready-to-show', () => {win.show();floatingLyrics.setMainFocused(true)});
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
}

app.setAppUserModelId(APPLICATION_ID);
app.whenReady().then(() => {
  const logger=createLogger(app.getPath('userData'));logger.info('start',`version=${app.getVersion?.()||'dev'} packaged=${app.isPackaged}`);
  process.on('uncaughtException',e=>logger.error('uncaught',e?.message||e));
  process.on('unhandledRejection',e=>logger.error('promise',e?.message||e));
  downloadQueue.setLimit(config().parallelDownloads);
  try {weeklyCacheCleanup();} catch(e) {console.warn('试听缓存定期清理失败：',e.message);}
  const oldHistory=readJSON(historyFile(),[]);if(Array.isArray(oldHistory))for(const entry of oldHistory){if(entry&&typeof entry.key==='string'){
    const status=['queued','running'].includes(entry.status)?'failed':entry.status;
    downloadHistory.set(entry.key,{...entry,status,progress:status==='running'?entry.progress:null,error:status==='failed'&&entry.status!==status?'程序上次关闭时任务未完成，可手动重试':entry.error});
  }}
  const maintenanceTimer=setInterval(() => {
    if(activeCliProcesses === 0 && downloadQueue.snapshot().active === 0 && downloadQueue.snapshot().waiting === 0 && previewRequests.size === 0 && !previewPlaying) {
      try{weeklyCacheCleanup();}catch(e){console.warn('试听缓存定期清理失败：',e.message);}
    }
  }, 60*60*1000);
  maintenanceTimer.unref?.();
  if (protocol?.handle){protocol.handle('music-media',mediaResponse);protocol.handle('music-preview',proxyPreview);}
  createWindow();
  floatingLyrics.setLockChange(locked=>{const settings=config();settings.floatingLyrics.mouseThrough=locked;writeConfig(settings);});
  ipcMain.on?.('lyrics:drag-begin',event=>{if(floatingLyrics.owns(event.sender))floatingLyrics.dragBegin()});
  ipcMain.on?.('lyrics:drag-move',event=>{if(floatingLyrics.owns(event.sender))floatingLyrics.dragMove()});
  ipcMain.on?.('lyrics:drag-end',event=>{if(floatingLyrics.owns(event.sender))floatingLyrics.dragEnd()});
  ipcMain.on?.('lyrics:context-menu',event=>{if(floatingLyrics.owns(event.sender))floatingLyrics.showMenu()});
  ipcMain.handle('settings:get', () => config());
  ipcMain.handle('settings:set', (_e, value) => writeConfig(value));
  ipcMain.handle('system:choose-directory', async () => {
    const r = await dialog.showOpenDialog(win, {properties:['openDirectory','createDirectory']});
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('playlists:list',()=>readPlaylists());
  ipcMain.handle('playlists:add',(_e,id,name)=>changeLocalPlaylist(id,name,true));
  ipcMain.handle('playlists:remove',(_e,id,name)=>changeLocalPlaylist(id,name,false));
  ipcMain.handle('background:choose',async()=>{
    const result=await dialog.showOpenDialog(win,{title:'选择沉浸歌词背景',properties:['openFile'],filters:[{name:'图片或视频',extensions:['mp4','webm','png','jpg','jpeg','webp']}]});
    if(result.canceled||!result.filePaths?.length)return null;
    const file=path.resolve(result.filePaths[0]),ext=path.extname(file).toLowerCase();
    if(!BACKGROUND_EXTS.has(ext))throw new Error('不支持的背景格式');
    const st=await fs.promises.stat(file);
    if(!st.isFile()||st.size>2*1024*1024*1024)throw new Error('背景文件过大或不可用');
    // User-supplied video is not tracked by Git. Keep a durable app-data copy instead of
    // retaining a fragile path to the original file or requiring it in the repository.
    const store=path.join(app.getPath('userData'),'player-backgrounds');
    await fs.promises.mkdir(store,{recursive:true});
    const installed=path.join(store,randomUUID()+ext);
    try {
      await fs.promises.copyFile(file,installed);
      if((await fs.promises.stat(installed)).size!==st.size)throw new Error('背景复制不完整');
      writeConfig({...config(),playerBackgroundPath:installed});
      return {path:installed};
    }catch(e){await fs.promises.rm(installed,{force:true}).catch(()=>{});throw e;}
  });
  ipcMain.handle('background:clear',()=>{writeConfig({...config(),playerBackgroundPath:''});return true});
  ipcMain.handle('background:get',()=>{
    const explicit=config().playerBackgroundPath;
    // Bundled GitHub asset lives inside app.asar in packaged mode, not process.resourcesPath.
    const fallback=path.join(__dirname,'assets','immersive-background-1080p.mp4');
    const file=explicit||fallback;
    if(!BACKGROUND_EXTS.has(path.extname(file).toLowerCase())||!fs.existsSync(file)||!fs.statSync(file).isFile())return {kind:explicit?'missing':'default'};
    return {kind:['.mp4','.webm'].includes(path.extname(file).toLowerCase())?'video':'image',url:grantMedia(file)};
  });
  ipcMain.handle('system:open-directory', async () => {
    const dest = config().downloadDir;
    fs.mkdirSync(dest, {recursive:true});
    const result = await shell.openPath(dest);
    if (result) throw new Error(result);
    return true;
  });
  ipcMain.handle('system:python', async () => {
    const item = await findPython();
    const result = item.standalone ? await invokeProcess(item.exe,['--runtime-info'],9000) : await invokeProcess(item.exe, [...item.prefix, '-c', 'import sys,requests;print(sys.version.split()[0])'], 9000);
    if (result.code) throw new Error('已找到 Python，但缺少 requests；请运行「安装依赖.bat」。');
    return {ok:true, version:item.standalone?'内置后端 · 免安装':result.stdout.trim()};
  });
  ipcMain.handle('music:search', async (_e, query, page=1) => {
    if (typeof query !== 'string' || !query.trim() || query.length > 120) throw new Error('请输入 1–120 字的歌名或关键词');
    if(!Number.isInteger(page)||page<1||page>500)throw new Error('页码无效');
    return await runCli('search',['--query',query.trim(),'--limit','40','--page',String(page)]);
  });
  ipcMain.handle('music:song-info', async (_e, id) => { const [sid] = songIds([id]); return (await runCli('song',['--id',sid],{timeoutMs:25000})).song; });
  ipcMain.handle('music:download', async (_e, ids) => {
    logger.info('download_batch',`count=${Array.isArray(ids)?ids.length:0}`);
    const valid = songIds(ids);
    const s = config();
    fs.mkdirSync(s.downloadDir, {recursive:true});
    // 任务之间隔离异常：某首失败不取消其余歌曲。
    const results=await Promise.all(valid.map(async id=>{
      try {
        // 下载前先检查可复用缓存，避免抢占下载并发槽位。
        const copied=cachedToDownloads(id,s.downloadDir,s.quality);
        if(copied) return copied;
        return await downloadTrack(id,s.downloadDir,s.quality,'download');
      } catch(e) {
        return {ok:false,song:{id},status:'error',error:String(e?.message||e)};
      }
    }));
    const success=results.filter(row=>row.ok).length;logger.info('download_result',`success=${success} failed=${valid.length-success}`);
    return {ok:success===valid.length,requested_count:valid.length,success_count:success,
      failed_count:valid.length-success,results,output_dir:s.downloadDir};
  });
  ipcMain.handle('download:history',()=>[...downloadHistory.values()].map(row=>({...row,progress:row.status==='running'?row.progress:null})).sort((a,b)=>(b.time||0)-(a.time||0)).slice(0,300));
  ipcMain.handle('download:cancel',(_e,id)=>{if(!validId(id))throw new Error('无效歌曲 ID');return downloadQueue.cancelSong(id)});
  ipcMain.handle('download:retry',async(_e,id)=>{
    const [sid]=songIds([id]);const s=config();fs.mkdirSync(s.downloadDir,{recursive:true});
    return downloadTrack(sid,s.downloadDir,s.quality,'download');
  });
  ipcMain.handle('music:playlist', async (_e, id) => {
    if (typeof id !== 'string' || id.length > 300 || !id.trim()) throw new Error('歌单链接或 ID 无效');
    return await runCli('playlist', ['--id',id]);
  });
  ipcMain.handle('music:prepare', async (_e, id) => prepareAudio(id));
  ipcMain.handle('music:stream',async(_e,id)=>beginStream(id));
  ipcMain.handle('music:playback-state',(_e, playing)=>{previewPlaying=playing===true;return true;});
  ipcMain.handle('music:lyric', async (_e, id) => fetchLyrics(id));
  ipcMain.handle('music:cache-stats', () => statsCache());
  ipcMain.handle('music:cache-clear', () => {
    if(previewRequests.size || previewPlaying) throw new Error('正在试听或准备音频，请暂停试听后清理缓存');
    grantedMedia.clear();
    fs.rmSync(cacheDir(),{recursive:true,force:true});
    fs.rmSync(lyricDir(),{recursive:true,force:true});
    writeJSONAtomic(cacheMaintenanceFile(),{lastClear:Date.now()});
    return statsCache();
  });
  ipcMain.handle('favorites:list',()=>listFavorites());
  ipcMain.handle('lyrics:open',()=>floatingLyrics.open());
  ipcMain.handle('lyrics:close',()=>floatingLyrics.close());
  ipcMain.handle('lyrics:lock',(_e,lock)=>{const s=config();s.floatingLyrics.mouseThrough=!!lock;writeConfig(s);return floatingLyrics.lock(!!lock)});
  ipcMain.handle('lyrics:update',(_e,info)=>floatingLyrics.update(info));
  ipcMain.handle('lyrics:status',()=>({open:floatingLyrics.exists()}));
  ipcMain.handle('lyrics:preferences',()=>config().floatingLyrics);
  ipcMain.handle('lyrics:preview-style',(_e,style)=>{floatingLyrics.applySettings(normalizeLyrics(style));return true});
  ipcMain.handle('lyrics:resize',(event,height)=>{if(!floatingLyrics.owns(event.sender))throw new Error('仅桌面歌词窗口可调整高度');return floatingLyrics.resizeTo(height)});
  ipcMain.handle('favorites:add',async(_e, track)=>addFavorite(track));
  ipcMain.handle('favorites:retry-lyrics',async(_e, id)=>{
    const [sid]=songIds([id]);return refreshFavoriteLyrics(sid);
  });
  ipcMain.handle('favorites:remove',(_e,id)=>{
    const [sid]=songIds([id]);const rows=readFavorites();delete rows[sid];writeJSONAtomic(favoritesFile(),rows);
    // 移出收藏只删除索引，不主动删除用户已保存的文件。
    return true;
  });
  ipcMain.handle('favorites:play',(_e,id)=>{
    const [sid]=songIds([id]);const item=validFavorite(readFavorites()[sid],sid);
    if(!item)throw new Error('收藏中的文件已丢失');
    return {ok:true,url:localAudioUrl(item.audioPath),id:sid,name:item.name,artists:item.artists,fromCache:true};
  });
  ipcMain.handle('local:delete', async (_e,name,confirmed) => {
    if(confirmed!==true)throw new Error('删除歌曲前必须明确确认');
    const full=availableLocalTrack(name);
    const sidecar=full.slice(0,-path.extname(full).length)+'.lrc';
    if(typeof shell.trashItem!=='function')throw new Error('当前系统不支持回收站删除');
    await shell.trashItem(full);
    // Audio must be safely in Recycle Bin before its lyric sidecar is moved.
    if(fs.existsSync(sidecar)){
      try{await shell.trashItem(sidecar)}catch(e){console.warn('歌曲已移入回收站，但歌词文件移动失败：',e.message)}
    }
    localPlaylist.afterDelete(name);
    return {ok:true};
  });
  ipcMain.handle('local:play', (_e, name) => {
    if (typeof name !== 'string' || !name || name !== path.basename(name) || !AUDIO_EXTS.has(path.extname(name).toLowerCase())) throw new Error('无效本地文件名');
    const full=availableLocalTrack(name);
    const id = /\[(\d{1,20})\]\.[^.]+$/.exec(name)?.[1] || null;
    return {ok:true,url:localAudioUrl(full),id,name:localPlaylist.clean(name).replace(/\s*\[\d+\]\.[^.]+$/, ''),artists:'',fromCache:true};
  });
  ipcMain.handle('music:open-song', async (_e, id) => {
    const [sid] = songIds([id]);
    await shell.openExternal(`https://music.163.com/#/song?id=${sid}`);
    return true;
  });
  ipcMain.handle('local:list', async () => {
    const dir = config().downloadDir;
    if (!fs.existsSync(dir)) return [];
    const members=new Set(readPlaylists()[0].tracks);
    return fs.readdirSync(dir,{withFileTypes:true}).filter(x => x.isFile() && AUDIO_EXTS.has(path.extname(x.name).toLowerCase()))
      .map(x => ({name:x.name, size: fs.statSync(path.join(dir,x.name)).size, inPlaylist:members.has(x.name)||localPlaylist.tagged(x.name)}))
      .sort((a,b) => a.name.localeCompare(b.name,'zh-CN')).slice(0,1000);
  });
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
