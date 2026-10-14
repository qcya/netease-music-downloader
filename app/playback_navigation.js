'use strict';
(function(root){
 const MODES=Object.freeze(['sequence','shuffle','reverse']);
 const normalizeMode=mode=>MODES.includes(mode)?mode:'sequence';
 function shuffleIndices(length,exclude,rng=Math.random){
   const rows=Array.from({length},(_,i)=>i).filter(i=>i!==exclude);
   for(let i=rows.length-1;i>0;i--){
     const n=Number(rng()),j=Math.min(i,Math.max(0,Math.floor((Number.isFinite(n)?n:0)* (i+1))));
     [rows[i],rows[j]]=[rows[j],rows[i]];
   }
   return rows;
 }
 function createQueue(tracks,index=0,mode='sequence',rng=Math.random){
   const rows=Array.isArray(tracks)?[...tracks]:[];
   const pos=rows.length?Math.max(0,Math.min(rows.length-1,Math.trunc(Number(index)||0))):0;
   const type=normalizeMode(mode);
   return {tracks:rows,index:pos,mode:type,unplayed:type==='shuffle'?shuffleIndices(rows.length,pos,rng):[],past:[],ahead:[]};
 }
 function step(queue,direction=1,rng=Math.random){
   if(!queue?.tracks?.length)return null;
   const q={...queue,tracks:[...queue.tracks],unplayed:[...(queue.unplayed||[])],past:[...(queue.past||[])],ahead:[...(queue.ahead||[])]};
   const n=q.tracks.length,back=direction<0;
   if(q.mode!=='shuffle'){
     const delta=(q.mode==='reverse'?-1:1)*(back?-1:1);
     q.index=(q.index+delta+n)%n;
     return q;
   }
   if(back){
     if(!q.past.length)return null;
     q.ahead.push(q.index);
     q.index=q.past.pop();
     return q;
   }
   q.past.push(q.index);
   if(q.ahead.length){q.index=q.ahead.pop();return q;}
   if(!q.unplayed.length)q.unplayed=shuffleIndices(n,q.index,rng);
   q.index=q.unplayed.length?q.unplayed.pop():q.index;
   return q;
 }
 const api=Object.freeze({MODES,createQueue,step,normalizeMode});
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.MusicPlaybackNavigation=api;
})(typeof window!=='undefined'?window:null);
