'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
 const node=()=>({hidden:true,src:'',paused:true,pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();},removeAttribute(name){this[name]='';}});
 const video=node(),image=node(),status=node(),window={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/fullscreen-background.js'),'utf8'),{window});
 return {video,image,status,background:window.MusicFullscreenBackground.create({video,image,status})};
}
test('default is black without loading any image or video',()=>{
 const {background,video,image,status}=fixture();background.set({kind:'black'});background.setVisible(true);
 assert.equal(video.src,'');assert.equal(image.src,'');assert.equal(video.hidden,true);assert.equal(image.hidden,true);assert.equal(video.paused,true);assert.equal(status.hidden,true);
});
test('failed custom media returns to black and stale events cannot restore old media',()=>{
 const {background,video,image,status}=fixture();background.set({kind:'image',url:'file:///bad.jpg'});const failed=image.onerror;failed();
 assert.equal(image.src,'');assert.equal(video.src,'');assert.match(status.textContent,/黑色背景/);assert.equal(image.hidden,true);
 background.set({kind:'image',url:'file:///good.jpg'});failed();assert.equal(image.src,'file:///good.jpg');assert.equal(status.hidden,true);
});
test('custom video only plays while fullscreen is visible',()=>{
 const {background,video}=fixture();background.set({kind:'video',url:'file:///custom.mp4'});assert.equal(video.paused,true);
 background.setVisible(true);assert.equal(video.paused,false);background.setVisible(false);assert.equal(video.paused,true);
 background.setVisible(true);assert.equal(video.paused,false);background.dispose();assert.equal(video.paused,true);
});
test('minimizing during pending video playback does not discard the custom background',async()=>{
 const {background,video,status}=fixture();let reject;
 video.play=()=>new Promise((_resolve,fail)=>{reject=fail;});background.set({kind:'video',url:'file:///custom.mp4'});
 background.setVisible(true);background.setVisible(false);reject(Error('play aborted by pause'));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(video.src,'file:///custom.mp4');assert.equal(status.hidden,true);
});
