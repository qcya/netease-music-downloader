'use strict';
const fs=require('node:fs');
const path=require('node:path');
const AUDIO=new Set(['.mp3','.flac','.m4a','.ogg','.wav','.aac']);
async function importMusic({sources,destination,maxFiles=10000}){
  if(!Array.isArray(sources)||typeof destination!=='string')throw new Error('导入参数无效');
  await fs.promises.mkdir(destination,{recursive:true});
  const found=[];
  async function scan(p){
    if(found.length>=maxFiles)return;
    let st;try{st=await fs.promises.lstat(p)}catch{return}
    if(st.isSymbolicLink())return;
    if(st.isFile()){
      if(AUDIO.has(path.extname(p).toLowerCase()))found.push(p);
      return;
    }
    if(!st.isDirectory())return;
    const entries=await fs.promises.readdir(p,{withFileTypes:true});
    entries.sort((a,b)=>a.name.localeCompare(b.name));
    for(const entry of entries){
      if(found.length>=maxFiles)break;
      if(entry.isSymbolicLink())continue;
      if(entry.isDirectory()||entry.isFile())await scan(path.join(p,entry.name));
    }
  }
  for(const source of sources)await scan(source);
  let imported=0,skipped=0,lyrics=0;const errors=[];
  for(const file of found){
    if(path.dirname(path.resolve(file))===path.resolve(destination)){skipped++;continue}
    const parsed=path.parse(file),original=parsed.name,ext=parsed.ext;
    let target=null,sidecar=null,srcLyric=path.join(parsed.dir,original+'.lrc');
    const hasLyric=fs.existsSync(srcLyric);
    for(let i=0;i<10000;i++){
      const base=i===0?original:original+' (导入 '+(i+1)+')';
      const possible=path.join(destination,base+ext),lrc=path.join(destination,base+'.lrc');
      if(!fs.existsSync(possible)&&(!hasLyric||!fs.existsSync(lrc))){target=possible;sidecar=lrc;break}
    }
    if(!target){skipped++;errors.push('重名过多：'+parsed.base);continue}
    try{
      await fs.promises.copyFile(file,target,fs.constants.COPYFILE_EXCL);
      imported++;
      if(hasLyric){
        try{await fs.promises.copyFile(srcLyric,sidecar,fs.constants.COPYFILE_EXCL);lyrics++}
        catch(e){errors.push(parsed.base+' 歌词复制失败：'+e.message)}
      }
    }catch(e){skipped++;errors.push(parsed.base+' 导入失败：'+e.message)}
  }
  return {imported,skipped,lyrics,limitReached:found.length>=maxFiles,errors:errors.slice(0,12)};
}
module.exports={importMusic};
