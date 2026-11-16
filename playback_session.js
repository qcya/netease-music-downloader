'use strict';
const path=require('node:path');
const {readJSON,writeJSONAtomic}=require('./durable_json');
const AUDIO=new Set(['.mp3','.flac','.m4a','.ogg','.wav','.aac']);
const MODES=new Set(['sequence','reverse','shuffle','stop-after','repeat-one']);
const MAX_TIME=7*24*60*60;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function normalize(value){
 const data=object(value)?value:{};
 const file=typeof data.file==='string'&&data.file===path.basename(data.file)&&
  !/[\\/:*?"<>|\x00-\x1f]/.test(data.file)&&AUDIO.has(path.extname(data.file).toLowerCase())?data.file:null;
 return {file,time:typeof data.time==='number'&&Number.isFinite(data.time)&&data.time>=0?Math.min(data.time,MAX_TIME):0,
  mode:MODES.has(data.mode)?data.mode:'sequence',
  volume:typeof data.volume==='number'&&Number.isFinite(data.volume)&&data.volume>=0&&data.volume<=1?data.volume:0.75};
}
/** Playback preferences persist independently of disposable browser localStorage.
 * Reading a damaged file never removes or repairs it; durable_json also protects
 * that original against a later save until it has been explicitly recovered.
 */
function createPlaybackSessionStore({getFile}){
 if(typeof getFile!=='function')throw TypeError('Playback session file is required');
 function read(){try{return normalize(readJSON(getFile(),null));}catch{return normalize(null);}}
 function save(value){
  if(!object(value))throw TypeError('Playback session must be an object');
  const result=normalize(value);writeJSONAtomic(getFile(),result);return result;
 }
 return {read,save};
}
module.exports={createPlaybackSessionStore};
