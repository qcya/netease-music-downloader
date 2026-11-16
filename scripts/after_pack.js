'use strict';
const fs=require('node:fs'),path=require('node:path');
module.exports=async({appOutDir})=>{
 for(const name of ['下载','缓存','playlists','data'])fs.mkdirSync(path.join(appOutDir,name),{recursive:true});
 // Remove only our generated readme from a reused build output.
 fs.rmSync(path.join(appOutDir,'使用说明.txt'),{force:true});
};
