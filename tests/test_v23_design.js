const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const root=path.join(__dirname,'..');const read=x=>fs.readFileSync(path.join(root,x),'utf8');
test('all selectors used by the renderer are present in the HTML',()=>{
 const js=read('app/renderer.js'),html=read('app/index.html');
 const used=[...js.matchAll(/\$\('#([^']+)'\)/g)].map(x=>x[1]);
 for(const id of new Set(used))assert.ok(html.includes('id="'+id+'"'),'Missing DOM control '+id);
});
test('download action no longer changes into pause/heart buttons',()=>{
 const js=read('app/renderer.js');
 assert.match(js,/actions\.append\(download\)/);
 assert.doesNotMatch(js,/const favorite=node\(/);
 const method=js.split('function updatePlayerControls(){')[1].split('function showImmersive')[0];
 assert.ok(!method.includes(".track-action"));
});
test('immersive player centers the lyrics without vinyl artwork',()=>{
 const html=read('app/index.html'),css=read('app/immersive.css');
 assert.doesNotMatch(html,/immersive-record/);assert.match(html,/immersive-right/);
 assert.match(html,/immersive-heading/);assert.match(css,/flex-direction:column/);assert.match(css,/scroll-behavior:smooth/);
 assert.match(html,/immersive-bg-video/);
});
test('desktop lyrics stays manually controlled without registering global shortcuts',()=>{
 const main=read('main.js'),html=read('app/index.html');
 assert.match(main,/desktopLyricsEnabled:false/);assert.doesNotMatch(main,/globalShortcut/);
 assert.doesNotMatch(html,/id="lyrics-shortcut"/);
 assert.ok(!read('app/floating-lyrics.html').includes('title="左键拖动'));
});
