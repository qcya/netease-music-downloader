'use strict';
(()=>{
 const mounted=new WeakMap(),segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
 const clamp=n=>Math.max(0,Math.min(1,n));
 const wordProgress=(word,time)=>clamp((time-word.time)/Math.max(.001,Number(word.duration)||.001));
 function lineProgress(line,end,time){return Number.isFinite(end)&&end>line.time?clamp((time-line.time)/(end-line.time)):null;}
 function clear(node,text=''){mounted.delete(node);node.textContent=text;}
 function units(node,key,texts){
  if(mounted.get(node)!==key){node.replaceChildren();for(const text of texts){const span=document.createElement('span');span.className='karaoke-word';span.textContent=text;span.dataset.text=text;span.setAttribute('aria-label',text);node.append(span);}mounted.set(node,key);}
 }
 function progress(node,index,value){const n=node.children[index];n.dataset.progress=String(value);n.style.setProperty('--karaoke-progress',value*100+'%');}
 function paintLine(node,line,text,time,end){const p=lineProgress(line,end,time);if(p===null){clear(node,text);return;}units(node,'line:'+text,[text]);node.firstElementChild.classList.add('karaoke-line');progress(node,0,p);}
 function paint(node,line,time,end){
  const words=line?.words;if(!words?.length){paintLine(node,line,line?.text||'',time,end);return;}
  units(node,JSON.stringify(words),words.map(w=>w.text));for(let i=0;i<words.length;i++)progress(node,i,wordProgress(words[i],time));
 }
 function paintTranslation(node,line,time,end){
  const words=line?.words,text=line?.translation||'';if(!words?.length){paintLine(node,line,text,time,end);return;}
  const chars=Array.from(segmenter.segment(text),x=>x.segment);units(node,'translation:'+text,chars);
  // Translation is a visual sync to the original vocal intervals, not ASR.
  const total=words.reduce((sum,w)=>sum+Math.max(0,w.duration),0),sung=words.reduce((sum,w)=>sum+Math.max(0,Math.min(w.duration,time-w.time)),0),p=total?clamp(sung/total):Number(time>=words.at(-1).time);
  for(let i=0;i<chars.length;i++)progress(node,i,clamp(p*chars.length-i));
 }
 window.KaraokeLyrics=Object.freeze({paint,paintTranslation,wordProgress,lineProgress,clear});
})();
