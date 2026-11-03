'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const src=p=>fs.readFileSync(path.join(root,p),'utf8');

test('floating lyrics window has no header and transparent chrome',()=>{
 const js=src('floating_window.js');
 assert.match(js,/frame:false,title:'',titleBarStyle:'hidden',autoHideMenuBar:true,transparent:true,hasShadow:false,thickFrame:false/);
 const html=src('app/floating-lyrics.html');
 assert.doesNotMatch(html,/class="bar"|class="header"/);
 const css=src('app/floating-lyrics.css');
 assert.match(css,/\.widget\[data-background="none"\].*background:rgba\(0,0,0,0\)/);
 assert.doesNotMatch(css,/rgba\(24,25,38,\.006\)/);
 assert.match(css,/--glow/);
 assert.match(css,/-webkit-user-select:none/);
 assert.match(css,/::selection\{background:transparent/);
 assert.match(js,/setIgnoreMouseEvents\(locked,\{forward:true\}\)/);
});
