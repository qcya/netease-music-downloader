'use strict';
const path=require('node:path');
function createStartupSettings({app,platform=process.platform,env=process.env}){
 function options(){const exe=env.PORTABLE_EXECUTABLE_FILE||app.getPath('exe');if(!path.isAbsolute(exe))throw Error('无法确定播放器启动路径');return {path:exe,args:['--silent']};}
 function get(){if(platform!=='win32'||!app.isPackaged)return {supported:false,enabled:false};try{return {supported:true,enabled:!!app.getLoginItemSettings(options()).openAtLogin};}catch{return {supported:false,enabled:false};}}
 function set(enabled){if(platform!=='win32'||!app.isPackaged)throw Error('请在 Windows 打包版中设置开机启动');if(typeof enabled!=='boolean')throw Error('开机启动设置无效');app.setLoginItemSettings({...options(),openAtLogin:enabled});return get();}
 return {get,set};
}
module.exports={createStartupSettings};
