'use strict';
(function(root){
  /** Returns null for missing or invalid LRC timestamps, never silently seeks to 0. */
  function seekTime(time, duration) {
    if(typeof time !== 'number' || !Number.isFinite(time) || time < 0) return null;
    const d=Number(duration);
    if(Number.isFinite(d) && d>0) return Math.min(time,Math.max(0,d-.01));
    return time;
  }
  const api=Object.freeze({seekTime});
  if(typeof module === 'object'&&module.exports)module.exports=api;
  if(root)root.MusicLyricNavigation=api;
})(typeof window !== 'undefined'?window:null);
