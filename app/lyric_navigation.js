'use strict';
(function(root){
  /** Never silently clamp a lyric many seconds beyond the actual audio duration to its start/end. */
  function seekTime(time, duration) {
    if(typeof time !== 'number' || !Number.isFinite(time) || time < 0) return null;
    const d=Number(duration);
    if(Number.isFinite(d) && d>0){
      if(time>d+1) return null;
      return Math.min(time,Math.max(0,d-.01));
    }
    return time;
  }
  /** One momentum frame, in pixels per millisecond. Manual scrolling must bypass CSS smooth scrolling. */
  function inertiaStep(velocity, elapsedMs){
    const dt=Math.max(0,Math.min(40,Number(elapsedMs)||0));
    return {pixels:velocity*dt, velocity:velocity*Math.exp(-dt/350)};
  }
  const api=Object.freeze({seekTime,inertiaStep});
  if(typeof module === 'object'&&module.exports)module.exports=api;
  if(root)root.MusicLyricNavigation=api;
})(typeof window !== 'undefined'?window:null);
