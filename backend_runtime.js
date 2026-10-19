'use strict';
const path=require('node:path');
const fs=require('node:fs');
/** No PATH/Python dependency for packaged applications: backend is bundled as a Windows executable. */
function embeddedBackend(resourcesPath, packaged) {
  if(!packaged)return null;
  const exe=path.join(resourcesPath,'backend','music_backend.exe');
  if(!fs.existsSync(exe))throw new Error('内置音乐后端 music_backend.exe 已丢失。请完全退出旧进程后重新运行新版 EXE；无需重装 Python。若仍失败，请检查文件是否被系统隔离');
  return {exe,prefix:[],standalone:true};
}
function backendArgs(runtime,script,cmd,args=[]){return [...runtime.prefix,...(runtime.standalone?[]:[script]),cmd,...args];}
module.exports={embeddedBackend,backendArgs};
