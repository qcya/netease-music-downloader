'use strict';
// Mock Electron shell; execute actual Electron IPC handlers and Python CLI against a localhost API.
const assert = require('node:assert/strict');
const {test} = require('node:test');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const Module = require('node:module');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'netease-electron-test-'));
process.env.MUSIC_PYTHON_EXE = process.env.MUSIC_PYTHON_EXE || '/opt/pyvenv/bin/python';
const handlers = new Map();
let mediaHandler = null;
let previewHandler = null;
class Window {
  constructor(o){this.opts=o;this.webContents={send(){},on(){},setWindowOpenHandler(){}};this.closed=false;}
  loadFile(p){assert.ok(fs.existsSync(p),p)}
  once(evt,cb){if(evt==='ready-to-show')cb()}
  show(){}
  isDestroyed(){return this.closed}
  setAppDetails(){}
  setIcon(){}
  static getAllWindows(){return []}
}
const electron = {
  app:{
    isPackaged:false,
    getPath(k){if(k==='userData')return path.join(temp,'userData');if(k==='music')return path.join(temp,'music');return temp;},
    setAppUserModelId(){},whenReady:async()=>{},on(){},quit(){}
  },
  BrowserWindow:Window,
  ipcMain:{handle(k,cb){handlers.set(k,cb)}},
  dialog:{showOpenDialog:async()=>({canceled:true,filePaths:[]})},
  shell:{openPath:async()=>'',openExternal:async()=>true,trashItem:async file=>fs.rmSync(file)},
  protocol:{registerSchemesAsPrivileged(x){assert.equal(x[0].scheme,'music-media')},handle(scheme,cb){if(scheme==='music-media')mediaHandler=cb;else if(scheme==='music-preview')previewHandler=cb;}}
};
const nativeLoad=Module._load;
Module._load=function(request,parent,isMain){if(request==='electron')return electron;return nativeLoad.call(this,request,parent,isMain)};
require('../main.js');
Module._load=nativeLoad;

function serverFixture() {
  return http.createServer((req,res)=>{
    const u=new URL(req.url,'http://localhost');
    const songs=[{id:12345,name:'我的悲伤是水做的',ar:[{name:'洛天依'}],al:{name:'专辑'},dt:230000}];
    if(u.pathname==='/search')return send({code:200,result:{songs,songCount:1}});
    if(u.pathname==='/lyric/new' || u.pathname==='/lyric')return send({code:200,lrc:{lyric:'[00:00.50]我的悲伤\n[00:02.00]是水做的'},tlyric:{lyric:'[00:00.50]My sadness'}});
    if(u.pathname==='/song/detail')return send({code:200,songs});
    if(u.pathname==='/playlist/track/all')return send({total:1,songs:u.searchParams.get('offset')==='0'?songs:[]});
    if(u.pathname==='/song/url/v1') {const preview=['standard','higher','exhigh'].includes(u.searchParams.get('level'));return send({code:200,data:[{url:`http://127.0.0.1:${server.address().port}/audio/track.${preview?'mp3':'flac'}`,level:preview?'standard':'lossless',freeTrialInfo:null,br:preview?128000:1400000}]});}
    if(u.pathname==='/audio/track.mp3') {
      res.writeHead(200,{'Content-Type':'audio/mpeg'});
      res.end(Buffer.concat([Buffer.from('ID3'),Buffer.alloc(3001)]));return;
    }
    if(u.pathname==='/audio/track.flac') {
      res.writeHead(200,{'Content-Type':'application/octet-stream'});
      res.end(Buffer.concat([Buffer.from('fLaC'),Buffer.alloc(3000)]));return;
    }
    res.statusCode=404;res.end('no');
    function send(payload){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(payload))}
  });
}
const server=serverFixture();
test('Electron IPC ↔ Python real CLI: search, playlist, download, local files and icon', async t=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>{server.close();fs.rmSync(temp,{recursive:true,force:true})});
  for(let i=0;i<40 && !handlers.has('music:search');i++)await new Promise(r=>setTimeout(r,15));
  assert.ok(handlers.has('music:search'));
  const invoke=(name,...args)=>handlers.get(name)(null,...args);
  const dl=path.join(temp,'download');
  await invoke('settings:set',{downloadDir:dl,quality:'best',apiBases:[`http://127.0.0.1:${server.address().port}`]});
  const savedSettings=await invoke('settings:get');
  assert.equal(savedSettings.setupCompleted,false);
  // Drag coordinates are owned by the main process, not by a renderer snapshot.
  const settingsPath=path.join(temp,'userData','settings.json');
  fs.mkdirSync(path.dirname(settingsPath),{recursive:true});
  fs.writeFileSync(settingsPath,JSON.stringify({...savedSettings,floatingLyricsPosition:{x:415,y:205}}));
  assert.deepEqual((await invoke('settings:get')).floatingLyricsPosition,{x:415,y:205});
  await invoke('settings:set',{...savedSettings,cacheLimitMB:2048});
  assert.deepEqual((await invoke('settings:get')).floatingLyricsPosition,{x:415,y:205},
    'saving stale settings must not restore the old lyric coordinates');
  await invoke('lyrics:reset-position');
  assert.equal((await invoke('settings:get')).floatingLyricsPosition,null,
    'only explicit reset should clear the saved location');

  await invoke('lyrics:lock',true);
  assert.equal((await invoke('settings:get')).floatingLyrics.mouseThrough,true,'lock is persisted immediately');
  await invoke('lyrics:lock',false);
  assert.equal((await invoke('settings:get')).floatingLyrics.mouseThrough,false,'unlock is persisted immediately');
  assert.equal(await invoke('lyrics:preview-style',{glow:22,originalColor:'#FFFFFF'}),true,'live style preview IPC is available');
  assert.equal((await invoke('settings:get')).floatingLyrics.glow,14,'preview must not silently persist the appearance');

  assert.equal(savedSettings.favoritesDir,path.join(dl,'收藏'));
  const stream=await invoke('music:stream','12345');
  assert.match(stream.url,/^music-preview:\/\/audio\//);
  assert.ok(previewHandler);
  const partial=await previewHandler(new Request(stream.url,{headers:{Range:'bytes=0-3'}}));
  assert.equal(partial.status,200);
  assert.equal(partial.headers.get('content-type'),'audio/mpeg');
  assert.equal(Buffer.from(await partial.arrayBuffer()).subarray(0,3).toString(),'ID3');
  const s=await invoke('music:search','我的悲伤是水做的');
  assert.equal(s.results.length,1);
  assert.equal(s.results[0].artists,'洛天依');
  const pl=await invoke('music:playlist','123');
  assert.equal(pl.tracks.length,1);
  const downloaded=await invoke('music:download',['12345']);
  assert.equal(downloaded.success_count,1,JSON.stringify(downloaded));
  assert.ok(fs.existsSync(downloaded.results[0].path));
  assert.equal(path.extname(downloaded.results[0].path),'.flac');
  const found=await invoke('local:list');
  assert.equal(found.length,1);
  assert.match(found[0].name,/洛天依/);
  assert.ok(fs.readFileSync(path.join(__dirname,'..','assets','app.ico')).length > 10000);
  const prepared=await invoke('music:prepare','12345');
  assert.equal(prepared.fromCache,false);
  assert.match(prepared.url,/^music-media:\/\/audio\//);
  assert.equal(prepared.quality,'mp3');
  const cached=await invoke('music:prepare','12345');
  assert.equal(cached.fromCache,true);
  fs.rmSync(downloaded.results[0].path,{force:true});
  const fromCache=await invoke('music:download',['12345']);
  assert.equal(fromCache.results[0].status,'downloaded'); // 试听 MP3 不得替代无损正式下载
  assert.ok(fs.existsSync(fromCache.results[0].path));
  assert.equal((await invoke('music:cache-stats')).count,1);
  const part=await mediaHandler(new Request(cached.url,{headers:{Range:'bytes=0-3'}}));
  assert.equal(part.status,206);
  assert.equal(part.headers.get('content-range'),'bytes 0-3/3004');
  assert.equal(Buffer.from(await part.arrayBuffer()).toString('utf8'),'ID3\u0000');
  const missing=await mediaHandler(new Request('music-media://audio/unknown'));
  assert.equal(missing.status,404);
  // v4 版本曾缓存错误的无歌词状态；v5 必须重新请求。
  const oldLyricDir=path.join(temp,'userData','lyric-cache');
  fs.mkdirSync(oldLyricDir,{recursive:true});
  fs.writeFileSync(path.join(oldLyricDir,'12345.json'),JSON.stringify({id:'12345',found:false,lrc:'',translated_lrc:'',checkedAt:Date.now()}));
  const lyric=await invoke('music:lyric','12345');
  assert.equal(lyric.found,true);
  assert.match(lyric.lrc,/是水做的/);
  const lyricFile=path.join(oldLyricDir,'12345.json');
  fs.writeFileSync(lyricFile,'{');
  assert.equal((await invoke('music:lyric','12345')).found,true,'corrupt optional cache cannot hide valid lyrics');
  assert.equal(fs.readFileSync(lyricFile,'utf8'),'{','corrupt cache preserved');
  fs.unlinkSync(lyricFile);
  await invoke('music:lyric','12345');
  const lyricCached=await invoke('music:lyric','12345');
  assert.equal(lyricCached.fromCache,true);
  const favorite=await invoke('favorites:add',s.results[0]);
  assert.match(favorite.audioPath,/\.flac$/);
  assert.equal(favorite.lyricExists,true);
  assert.ok(fs.existsSync(favorite.lyricPath));
  assert.equal((await invoke('favorites:list')).length,1);
  const favoritePlay=await invoke('favorites:play','12345');
  assert.match(favoritePlay.url,/^file:\/\//);
  const local=await invoke('local:play',found[0].name);
  assert.match(local.url,/^file:\/\//);
  assert.equal(new URL(local.url).protocol,'file:');
  assert.throws(()=>invoke('local:play','../settings.json'),/无效本地文件名/);
  await assert.rejects(invoke('music:download',['; rm -rf .']),/无效歌曲 ID/);
  await invoke('music:cache-clear');
  assert.equal((await invoke('music:cache-stats')).count,0);
  assert.ok(fs.existsSync(downloaded.results[0].path),'清缓存不能删除正式下载目录的文件');
  assert.ok(fs.existsSync(favorite.audioPath),'清缓存不能删除收藏音频');
  assert.ok(fs.existsSync(favorite.lyricPath),'清缓存不能删除收藏歌词');
  const lyricOffline=await invoke('music:lyric','12345');
  assert.equal(lyricOffline.fromFavorite,true);
  assert.ok(lyricOffline.lrc);
  await invoke('favorites:remove','12345');
  assert.equal((await invoke('favorites:list')).length,0);
  assert.ok(fs.existsSync(favorite.audioPath),'移出收藏不应删除无损文件');
  // User-managed local playlist: add, real disk prefix, playback, remove, and safe delete.
  const originalFile=path.basename(downloaded.results[0].path);
  const added=await invoke('playlists:add','default',originalFile);
  assert.deepEqual(added[0].tracks,['[歌单] '+originalFile]);
  const inList=await invoke('local:list');
  assert.equal(inList.some(file=>file.inPlaylist&&file.name==='[歌单] '+originalFile),true);
  const fromPlaylist=await invoke('local:play','[歌单] '+originalFile);
  assert.match(fromPlaylist.url,/^file:\/\//);
  assert.equal(fromPlaylist.id,'12345');
  const restored=await invoke('playlists:remove','default','[歌单] '+originalFile);
  assert.deepEqual(restored[0].tracks,[]);
  assert.ok(fs.existsSync(path.join(dl,originalFile)));
  await invoke('playlists:add','default',originalFile);
  await assert.rejects(invoke('local:delete','[歌单] '+originalFile,false),/确认/);
  await invoke('local:delete','[歌单] '+originalFile,true);
  assert.deepEqual((await invoke('playlists:list'))[0].tracks,[]);
  assert.ok(!(await invoke('local:list')).some(file=>file.name==='[歌单] '+originalFile));

});
