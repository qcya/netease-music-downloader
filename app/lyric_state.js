'use strict';
(function(root){
 function payload({row,title='桌面歌词',selected=false,status='idle',autoHideEmpty=false,hasTimeline=false}={}){
  if(row?.text?.trim())return {title,line:row.text,translation:row.translation||''};
  let line='';
  if(!autoHideEmpty){
   if(!selected)line='桌面歌词已开启 · 播放歌曲后显示歌词';
   else if(status==='loading')line='正在获取歌词…';
   else if(status==='error')line='歌词获取失败 · 请在播放器中重试';
   else if(hasTimeline)line='♪ '+title;
   else line='♪ 暂无同步歌词';
  }
  return {title,line,translation:''};
 }
 const api={payload};if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.MusicLyricState=api;
})(typeof window==='undefined'?null:window);
