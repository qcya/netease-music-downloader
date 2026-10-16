'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createQueue,step,normalizeMode}=require('../app/playback_navigation.js');
const {createFloatingLyricsController}=require('../floating_window.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('sequential loop and reverse order, including the previous button',()=>{
 let q=createQueue(['A','B','C'],1,'sequence');
 assert.equal(step(q,1).index,2);assert.equal(step(step(q,1),1).index,0);
 assert.equal(step(q,-1).index,0);
 q=createQueue(['A','B','C'],1,'reverse');
 assert.equal(step(q,1).index,0);
 assert.equal(step(q,-1).index,2);
 assert.equal(step(createQueue(['A'],0,'reverse'),1).index,0);
 assert.equal(normalizeMode('bogus'),'sequence');
});
test('shuffle exhausts unique songs before repeating, remembers history, supports forward again',()=>{
 const draws=[.8,.2,.1,.5,.9];let pos=0;
 const random=()=>draws[(pos++)%draws.length];
 let q=createQueue(['A','B','C','D'],0,'shuffle',random);
 const order=[q.index];
 for(let i=0;i<3;i++){q=step(q,1,random);order.push(q.index)}
 assert.equal(new Set(order).size,4,'repeat before traversing entire playlist');
 const played=q.index;
 const prior=step(q,-1,random);
 assert.notEqual(prior.index,played);
 const again=step(prior,1,random);
 assert.equal(again.index,played,'forward should retrace history after previous');
 const next=step(q,1,random);
 assert.notEqual(next.index,q.index,'end of shuffle cycle must not immediately repeat current song');
 assert.equal(step(createQueue(['A','B'],0,'shuffle'),-1),null,'no prior history yet');
});
test('transport controls and lyric lock exist in main and immersive player, wired to bridge',()=>{
 const html=read('app/index.html'),js=read('app/renderer.js'),pre=read('preload.js'),main=read('main.js');
 for(const id of ['player-prev','player-next','player-mode','immersive-prev','immersive-next','immersive-mode','toggle-desktop-lyrics','toggle-desktop-lock','lyric-style-preview'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/src="playback_navigation\.js"/);
 assert.match(js,/advancePlaylist\(dir,'manual'\)/);
 assert.match(js,/changePlaybackMode\(\$\('#'\+id\)\.value\)/);
 assert.match(js,/await bridge\.lockFloatingLyrics\(wanted\)/);
 assert.match(js,/previewFloatingLyricsStyle/);
 assert.match(js,/lyr-mouse-through'\)\.addEventListener\('change'/);
 assert.match(js,/desktop-lyrics-enabled'\)\.addEventListener\('change'/);
 assert.match(main,/ipcMain\.handle\('lyrics:preview-style'/);
 assert.match(pre,/previewFloatingLyricsStyle/);
});
test('desktop lyric remains visible while main app has focus and lock stays click-through',()=>{
 let fake,locks=[],events=[];
 class Window {
   constructor(opts){this.opts=opts;this.visible=false;this.webContents={once:(name,fn)=>{this.loaded=fn},send:(name,msg)=>events.push([name,msg]),setWindowOpenHandler(){},on(){}};fake=this}
   loadFile(){this.loaded?.()}
   setBackgroundColor(){}
   on(){}
   show(){this.visible=true}
   showInactive(){this.visible=true}
   hide(){this.visible=false}
   setIgnoreMouseEvents(value,opts){locks.push({value,opts})}
   isDestroyed(){return false}
 }
 const ctrl=createFloatingLyricsController({BrowserWindow:Window,Menu:{},baseDir:process.cwd(),getMainWindow:()=>null,getSettings:()=>({width:800,mouseThrough:false,alwaysOnTop:true})});
 ctrl.open();
 ctrl.update({line:'今夜的星光',translation:'星の光'});
 assert.equal(fake.visible,true,'lyrics should remain visible while the main player has focus');
 ctrl.setMainFocused(false);
 assert.equal(fake.visible,true,'appears over other apps when main window loses focus');
 ctrl.lock(true);
 assert.equal(locks.at(-1).value,true);
 assert.deepEqual(locks.at(-1).opts,{forward:true});
 ctrl.setMainFocused(true);
 assert.equal(fake.visible,true,'the user must see lyrics while adjusting settings in the main app');
 ctrl.setMainFocused(false);
 assert.equal(fake.visible,true);
 ctrl.update({line:''});
 assert.equal(fake.visible,false,'no blank transparent hit-test window');
});
