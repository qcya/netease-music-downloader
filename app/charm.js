'use strict';
const cord=document.getElementById('cord');let held=false;
cord.onpointerdown=e=>{if(e.button!==0)return;held=true;cord.setPointerCapture(e.pointerId);charmBridge.action({type:'begin',kind:'pull',native:true,x:window.screenX+e.clientX,y:window.screenY+e.clientY});};
cord.onpointermove=e=>{if(held)charmBridge.action({type:'move',x:window.screenX+e.clientX,y:window.screenY+e.clientY});};
cord.onpointerup=()=>{if(held){held=false;charmBridge.action({type:'end'});}};
cord.onpointercancel=()=>{held=false;charmBridge.action({type:'cancel'});};
cord.onlostpointercapture=()=>{if(held){held=false;charmBridge.action({type:'cancel'});}};
cord.onkeydown=e=>{if(e.key==='Enter'||e.code==='Space'){e.preventDefault();charmBridge.action({type:'expand'});}};
charmBridge.onPull(value=>{document.querySelector('.pendant').style.transform='translateY('+Math.min(20,value/4)+'px)';document.querySelector('.thread').style.height=78+Math.min(20,value/4)+'px';});
