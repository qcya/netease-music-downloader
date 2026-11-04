'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {bind}=require('../app/playlist_selection');
function fixture(){
 const handlers={},calls={changes:[],drops:[],reorders:[],playlistReorders:[],menus:[]};
 const doc={body:{append(n){n.parent=true;}},createElement(){return {style:{},remove(){this.parent=false;}};}};
 function item(kind,id,left,top){return {dataset:{selectKind:kind,selectId:id},classList:{toggle(){}},setAttribute(){},closest(s){return s.startsWith('[data-select-kind]')?this:null;},getBoundingClientRect(){return {left,top,right:left+80,bottom:top+20,width:80,height:20};}};}
 const items=[item('playlist','p',150,0),item('track','a',0,0),item('track','b',0,30),item('track','c',0,60),item('playlist','q',150,30),item('playlist','r',150,60)];
 const blank={closest(){return null;}};
 const container={ownerDocument:doc,addEventListener(t,f){handlers[t]=f;},removeEventListener(){},contains(t){return items.includes(t);},querySelectorAll(s){const kind=/data-select-kind="(.*?)"/.exec(s)[1];return items.filter(i=>i.dataset.selectKind===kind);},setPointerCapture(){}};
 const binding=bind(container,{onChange:x=>calls.changes.push(x),onDropTracks:x=>calls.drops.push(x),onReorderTracks:x=>calls.reorders.push(x),onReorderPlaylists:x=>calls.playlistReorders.push(x),onContextMenu:x=>calls.menus.push(x)});
 const fire=(type,target,props={})=>handlers[type]({target,button:0,pointerId:1,clientX:0,clientY:0,preventDefault(){this.prevented=true;},...props});
 return {binding,items,blank,calls,fire};
}
test('click, Ctrl and Shift retain stable identities across redraw',()=>{
 const {binding,items,fire}=fixture();const [,a,b,c]=items;
 fire('click',a);fire('click',c,{ctrlKey:true});assert.deepEqual(binding.getSelected('track'),['a','c']);
 fire('click',b,{shiftKey:true});assert.deepEqual(binding.getSelected('track'),['b','c']);binding.refresh();assert.deepEqual(binding.getSelected('track'),['b','c']);
 fire('contextmenu',c,{clientX:10,clientY:11});assert.deepEqual(binding.getSelected('track'),['b','c']);
});
test('blank drag rectangle selects intersections and Ctrl adds previous items',()=>{
 const {binding,items,blank,fire}=fixture();const [,a,,c]=items;fire('click',c);
 fire('pointerdown',blank,{clientX:0,clientY:0,ctrlKey:true});fire('pointermove',blank,{clientX:95,clientY:50});fire('pointerup',blank,{clientX:95,clientY:50});
 assert.deepEqual(new Set(binding.getSelected('track')),new Set(['a','b','c']));
 fire('contextmenu',a);assert.deepEqual(new Set(binding.getSelected('track')),new Set(['a','b','c']));
});
test('drag selected tracks to playlist or to row half for reorder',()=>{
 const {binding,items,calls,fire}=fixture();const [p,a,b,c]=items;fire('click',a);fire('click',b,{ctrlKey:true});
 const dataTransfer={setData(){},effectAllowed:'',dropEffect:''};fire('dragstart',a,{dataTransfer});fire('drop',p,{dataTransfer});
 assert.deepEqual(calls.drops,[{trackIds:['a','b'],playlistId:'p'}]);
 fire('dragstart',a,{dataTransfer});fire('drop',c,{dataTransfer,clientY:75});assert.deepEqual(calls.reorders,[{trackIds:['a','b'],targetTrackId:'c',position:'after'}]);
 assert.deepEqual(binding.getSelected('track'),['a','b']);
});
test('drag multiple playlists to reorder without triggering song move',()=>{
 const {binding,items,calls,fire}=fixture();const [p,a,,,q,r]=items;
 fire('click',p);fire('click',q,{ctrlKey:true});const dataTransfer={setData(){},effectAllowed:'',dropEffect:''};
 fire('dragstart',p,{dataTransfer});fire('drop',a,{dataTransfer,clientY:5});assert.deepEqual(calls.drops,[]);assert.deepEqual(calls.playlistReorders,[]);
 fire('drop',r,{dataTransfer,clientY:65});assert.deepEqual(calls.playlistReorders,[{playlistIds:['p','q'],targetPlaylistId:'r',position:'before'}]);
 assert.deepEqual(binding.getSelected('playlist'),['p','q']);assert.deepEqual(calls.reorders,[]);
});

test('marquee autoscrolls long list and reverses selection correctly',()=>{
 const handlers={},frames=new Map();let nextFrame=0,scroll=0;
 const view={requestAnimationFrame(fn){const id=++nextFrame;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);}};
 const doc={defaultView:view,body:{append(){}},createElement(){return {style:{},remove(){}};}};
 const scroller={get scrollTop(){return scroll;},set scrollTop(value){scroll=Math.max(0,Math.min(200,value));},getBoundingClientRect(){return {top:0,bottom:100,height:100};},closest(s){return s==='[data-selection-scroll]'?this:null;},contains(item){return items.includes(item);}};
 const items=Array.from({length:6},(_,i)=>({dataset:{selectKind:'track',selectId:String(i)},classList:{toggle(){}},setAttribute(){},closest(s){return s.startsWith('[data-select-kind]')?this:null;},getBoundingClientRect(){const top=10+i*45-scroll;return {left:10,right:70,top,bottom:top+20,width:60,height:20};}}));
 const container={ownerDocument:doc,contains(item){return item===scroller||items.includes(item);},querySelectorAll(s){return s.includes('"track"')?items:[];},addEventListener(t,f){handlers[t]=f;},removeEventListener(){},setPointerCapture(){}};
 const selection=bind(container);const fire=(type,props)=>handlers[type]({target:scroller,button:0,pointerId:1,preventDefault(){},...props});
 const frame=()=>{const [id,callback]=frames.entries().next().value;frames.delete(id);callback();};
 fire('pointerdown',{clientX:0,clientY:20});fire('pointermove',{clientX:90,clientY:98});
 for(let i=0;i<6;i++)frame();
 assert.ok(scroll>90,'dragging near bottom scrolls downward');assert.ok(selection.getSelected('track').includes('3'),'selection reaches initially invisible rows');assert.ok(selection.getSelected('track').includes('0'),'rows scrolled out remain selected');
 fire('pointermove',{clientX:90,clientY:2});for(let i=0;i<6&&frames.size;i++)frame();
 assert.equal(scroll,0,'dragging near top reverses scroll');assert.deepEqual(selection.getSelected('track'),['0'],'selection shrinks as drag reverses');
 fire('pointerup',{clientX:90,clientY:2});assert.equal(frames.size,0,'stops scrolling on release');selection.destroy();
});
