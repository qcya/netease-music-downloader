'use strict';
(function(root){
 // Only a known missing online address (without a playable trial/local copy) is
 // moved down. Unknown/network errors stay in their original position.
 function unavailable(track,availability){
  if(track.local)return !!track.conflict||!!track.missing;
  const status=availability.get(String(track.id));
  return !!status&&status.state==='unavailable'&&!status.trialAvailable&&!status.fromLocal;
 }
 function pageOrder(rows,availability){
  const first=[],last=[];
  for(const row of rows)(unavailable(row,availability)?last:first).push(row);
  return first.concat(last);
 }
 const api={unavailable,pageOrder};if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.MusicTrackOrder=api;
})(typeof window!=='undefined'?window:null);
