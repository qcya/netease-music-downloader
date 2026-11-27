'use strict';
const path=require('node:path');

function startRightShift(onTap,onError){
 if(process.platform!=='win32'||process.env.MUSIC_DOWNLOADER_TEST_USER_DATA)return ()=>{};
 let stop;
 try{
  const directory=process.resourcesPath&&require('electron').app.isPackaged?process.resourcesPath:__dirname;
  const library=require('koffi').load(path.join(directory,'backend','neutral_composition.dll'));
  const start=library.func('int __stdcall PlayerRightShiftStart()');
  const wait=library.func('int __stdcall PlayerRightShiftWait()');
  stop=library.func('void __stdcall PlayerRightShiftStop()');
  if(!start())throw Error('无法注册右 Shift 监听');
  let active=true;
  const close=()=>{if(active){active=false;stop();}};
  function listen(){
   wait.async((error,pressed)=>{
    if(!active)return;
    if(error||!pressed){close();onError('右 Shift 监听中断');return;}
    try{onTap();}finally{if(active)listen();}
   });
  }
  listen();
  return close;
 }catch{
  stop?.();
  onError('右 Shift 监听无法启动');
  return ()=>{};
 }
}

module.exports={startRightShift};
