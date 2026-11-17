'use strict';
(()=>{
 const mounted=new WeakMap(),translations=new WeakMap();
 const segmenter=typeof Intl!=='undefined'&&Intl.Segmenter?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
 const graphemes=text=>segmenter?Array.from(segmenter.segment(text||''),part=>part.segment):Array.from(text||'');
 // A translated sentence is not sung. Reveal its graphemes over the actual
 // original vocal intervals, excluding rests; do not invent alignment results.
 function translationProgress(words,time){
  if(!words?.length)return null;
  let total=0,sung=0;
  for(const word of words){const duration=Math.max(0,Number(word.duration)||0);total+=duration;sung+=Math.max(0,Math.min(duration,time-word.time));}
  return total?Math.max(0,Math.min(1,sung/total)):Number(time>=words.at(-1).time);
 }
 function paintTranslation(node,line,time){
  const text=line?.translation||'',words=line?.words;
  if(!words?.length){if(translations.get(node)!==text){node.textContent=text;translations.set(node,text);}return;}
  let entry=translations.get(node);
  if(!entry||typeof entry==='string'||entry.text!==text){
   node.replaceChildren();for(const unit of graphemes(text)){const span=document.createElement('span');span.className='translation-unit';span.textContent=unit;node.append(span);}
   entry={text};translations.set(node,entry);
  }
  const progress=translationProgress(words,time),count=time<words[0].time?0:Math.max(1,Math.ceil(progress*node.children.length));
  const singing=words.some(w=>time>=w.time&&time<w.time+Math.max(.12,w.duration));
  for(let i=0;i<node.children.length;i++){const unit=node.children[i];unit.style.opacity=i<count?'1':'0';unit.classList.toggle('is-singing',singing&&i===count-1);}
 }
 function paint(node,line,time){
  const words=line?.words;if(!words?.length){if(mounted.get(node)!==line?.text){node.textContent=line?.text||'';mounted.set(node,line?.text);}return;}
  let entry=mounted.get(node);
  if(!entry||typeof entry==='string'||entry.words!==words){const key=JSON.stringify(words);if(!entry||entry.key!==key){node.replaceChildren();for(const word of words){const span=document.createElement('span');span.className='timed-word';span.textContent=word.text;node.append(span);}}entry={words,key};mounted.set(node,entry);}
  for(let i=0;i<words.length;i++){const w=words[i],n=node.children[i];n.style.opacity=time>=w.time?'1':'0';n.classList.toggle('is-singing',time>=w.time&&time<w.time+Math.max(.12,w.duration));}
 }
 // Only runs while this caption is visible and its song is playing; a hidden or
 // paused caption owns no animation loop. New clock samples also handle seeks.
 function clock(paintFrame){let raf=0,base=0,at=0,playing=false;function stop(){cancelAnimationFrame(raf);raf=0;}function draw(){paintFrame(base+(playing?(performance.now()-at)/1000:0));if(playing&&!document.hidden)raf=requestAnimationFrame(draw);}return {sample(time,run){stop();base=Number(time)||0;at=performance.now();playing=!!run;draw();},stop};}
 window.MusicWords=Object.freeze({paint,paintTranslation,translationProgress,graphemes,clock});
})();
