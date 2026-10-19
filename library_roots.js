'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {readJSON, writeJSONAtomic} = require('./durable_json');
const AUDIO = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.aac']);
function createLibraryRoots({getFile, getCurrent}) {
  function list() {
    const raw = readJSON(getFile(), {directories: []});
    if (!raw || !Array.isArray(raw.directories)) throw new Error('音乐库目录记录格式损坏，已保留原文件');
    return [...new Set([...raw.directories, getCurrent()].filter(p => typeof p === 'string' && path.isAbsolute(p)).map(p => path.resolve(p)))];
  }
  function remember(...directories) {
    const rows = [...new Set([...list(), ...directories].map(p => path.resolve(p)))];
    writeJSONAtomic(getFile(), {directories: rows});
  }
  async function files() {
    const result = [];
    for (const directory of list()) {
      let entries;
      try { entries = await fs.promises.readdir(directory, {withFileTypes: true}); }
      catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) continue; throw error; }
      for (const entry of entries) {
        if (!entry.isFile() || !AUDIO.has(path.extname(entry.name).toLowerCase())) continue;
        try {
          const stat = await fs.promises.stat(path.join(directory, entry.name));
          result.push({name: entry.name, size: stat.size, directory});
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    const counts = new Map();
    for (const row of result) counts.set(row.name, (counts.get(row.name) || 0) + 1);
    for (const row of result) row.conflict = counts.get(row.name) > 1;
    return result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.directory.localeCompare(b.directory));
  }
  return {list, remember, files};
}
module.exports = {createLibraryRoots};
