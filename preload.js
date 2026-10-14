'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('musicBridge', Object.freeze({
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: s => ipcRenderer.invoke('settings:set',s),
  chooseDirectory: () => ipcRenderer.invoke('system:choose-directory'),
  openDirectory: () => ipcRenderer.invoke('system:open-directory'),
  checkPython: () => ipcRenderer.invoke('system:python'),
  search: (q,page=1) => ipcRenderer.invoke('music:search',q,page),
  download: ids => ipcRenderer.invoke('music:download',ids),
  playlist: id => ipcRenderer.invoke('music:playlist',id),
  openSong: id => ipcRenderer.invoke('music:open-song',id),
  listFiles: () => ipcRenderer.invoke('local:list'),
  downloadHistory:()=>ipcRenderer.invoke('download:history'),
  pauseDownloads:val=>ipcRenderer.invoke('download:pause',val),
  cancelDownload:id=>ipcRenderer.invoke('download:cancel',id),
  retryDownload:id=>ipcRenderer.invoke('download:retry',id),
  showFloatingLyrics:()=>ipcRenderer.invoke('lyrics:open'),
  closeFloatingLyrics:()=>ipcRenderer.invoke('lyrics:close'),
  lockFloatingLyrics:locked=>ipcRenderer.invoke('lyrics:lock',locked),
  updateFloatingLyrics:data=>ipcRenderer.invoke('lyrics:update',data),
  floatingLyricsStatus:()=>ipcRenderer.invoke('lyrics:status'),
  lyricsPreferences:()=>ipcRenderer.invoke('lyrics:preferences'),
  onFloatingLyricsStatus:cb=>{const listener=(_e,data)=>cb(data);ipcRenderer.on('lyrics:status',listener);return()=>ipcRenderer.removeListener('lyrics:status',listener)},
  listFavorites:()=>ipcRenderer.invoke('favorites:list'),
  addFavorite:track=>ipcRenderer.invoke('favorites:add',track),
  playFavorite:id=>ipcRenderer.invoke('favorites:play',id),
  removeFavorite:id=>ipcRenderer.invoke('favorites:remove',id),
  retryFavoriteLyrics:id=>ipcRenderer.invoke('favorites:retry-lyrics',id),
  prepareAudio: id => ipcRenderer.invoke('music:prepare', id),
  streamAudio: id => ipcRenderer.invoke('music:stream', id),
  setPlaybackState:playing=>ipcRenderer.invoke('music:playback-state',!!playing),
  fetchLyrics: id => ipcRenderer.invoke('music:lyric', id),
  playLocal: name => ipcRenderer.invoke('local:play', name),
  cacheStats: () => ipcRenderer.invoke('music:cache-stats'),
  clearCache: () => ipcRenderer.invoke('music:cache-clear'),
  onDownloadTask: cb => {
    const listener=(_e, data)=>cb(data);
    ipcRenderer.on('download:task',listener);
    return ()=>ipcRenderer.removeListener('download:task',listener);
  },
  onProgress: cb => {
    const listener = (_e, text) => cb(text);
    ipcRenderer.on('download:progress',listener);
    return () => ipcRenderer.removeListener('download:progress',listener);
  }
}));
