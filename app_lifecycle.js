'use strict';
/**
 * A portable Electron build must not remain invisible when Chromium omits
 * ready-to-show; neither should hidden tool windows keep the app running.
 */
function wireMainWindow({window,app,onShown,onFailure,closeChildren,timeoutMs=10000}){
  let shown=false,closing=false,failed=false;
  const alive=()=>window&&!window.isDestroyed?.();
  function closeTools(){
    if(closing)return;
    closing=true;
    try{closeChildren?.()}catch(e){onFailure?.('关闭辅助窗口失败',e)}
  }
  function show(){
    if(!alive()||shown||failed)return;
    shown=true;clearTimeout(watchdog);
    window.show();
    onShown?.();
  }
  function fail(reason,error){
    if(failed||closing)return;
    failed=true;clearTimeout(watchdog);
    onFailure?.(reason,error);
  }
  const watchdog=setTimeout(()=>{
    if(!shown)fail('主窗口加载超过十秒仍未完成',new Error('Electron 主窗口未触发就绪事件'));
  },timeoutMs);
  watchdog.unref?.();
  window.once('ready-to-show',show);
  window.webContents.on('did-finish-load',show);
  window.webContents.on('did-fail-load',(_event,code,description,url,isMainFrame)=>{
    if(isMainFrame!==false)fail('界面文件加载失败',new Error(`错误码 ${code}：${description||'未知错误'}`));
  });
  window.webContents.on('render-process-gone',(_event,details)=>{
    fail('界面进程异常退出',new Error(details?.reason||'render-process-gone'));
  });
  window.on?.('close',closeTools);
  window.on?.('closed',()=>{
    closeTools();
    if(process.platform!=='darwin')app.quit();
  });
  return {show,fail,closeTools};
}
module.exports={wireMainWindow};
