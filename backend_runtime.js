'use strict';
const path=require('node:path');
const fs=require('node:fs');
/** No PATH/Python dependency for packaged applications: backend is bundled as a Windows executable. */
function embeddedBackend(resourcesPath, packaged) {
  if(!packaged)return null;
  const exe=path.join(resourcesPath,'backend','music_backend.exe');
  if(!fs.existsSync(exe))throw new Error('发布包缺少内置音乐后端 music_backend.exe；请使用官方完整版本重新构建');
  return {exe,prefix:[],standalone:true};
}
function backendArgs(runtime,script,cmd,args=[]){return [...runtime.prefix,...(runtime.standalone?[]:[script]),cmd,...args];}
module.exports={embeddedBackend,backendArgs};
