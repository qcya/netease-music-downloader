'use strict';
// Keep the one-time policy separate from settings so ordinary saves cannot erase it.
function createFirstPositionPolicy({readState,writeState,lock}){
 let state=null;
 function save(mode){const next={version:1,mode};writeState(next);state=next;}
 function start(){
  const stored=readState();
  if(stored==null)save('eligible');
  else if(stored.version===1&&['eligible','pending','done'].includes(stored.mode))state=stored;
  else throw Error('桌面歌词首次定位状态无法读取');
  if(state.mode==='pending'){lock();save('done');}
 }
 function positionChanged(before,after){
  if(!state||state.mode!=='eligible'||!before||!after||!Number.isFinite(before.x)||!Number.isFinite(before.y)||!Number.isFinite(after.x)||!Number.isFinite(after.y)||(before.x===after.x&&before.y===after.y))return false;
  save('pending');return true;
 }
 function userChoice(){if(state?.mode==='pending')save('done');}
 return {start,positionChanged,userChoice};
}
module.exports={createFirstPositionPolicy};
