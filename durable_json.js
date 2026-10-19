'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

function damaged(file, cause) {
  const error = new Error('数据文件损坏，已保留原文件，请先备份并从 .bak 恢复：' + path.basename(file));
  error.code = 'DATA_CORRUPT'; error.cause = cause; return error;
}
function readJSON(file, fallback) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
  try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch (error) { throw damaged(file, error); }
}
function replaceBytes(file, bytes) {
  const temp = file + '.' + process.pid + '.' + randomUUID() + '.tmp';
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function writeJSONAtomic(file, value) {
  const encoded = JSON.stringify(value, null, 2);
  if (encoded === undefined) throw new Error('不能保存空的数据对象');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  let prior;
  try { prior = fs.readFileSync(file, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (prior !== undefined) {
    try { JSON.parse(prior.replace(/^\uFEFF/, '')); }
    catch (error) { throw damaged(file, error); }
    if (prior === encoded) return;
    replaceBytes(file + '.bak', prior);
  }
  replaceBytes(file, encoded);
}
module.exports = {readJSON, writeJSONAtomic};
