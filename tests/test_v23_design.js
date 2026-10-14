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
test('full lyrics page adapted to supplied left-vinyl right-lyrics HTML reference',()=>{
 const html=read('app/index.html'),css=read('app/immersive.css');
 assert.match(html,/immersive-record/);assert.match(html,/immersive-right/);
 assert.match(css,/grid-template-columns/);assert.match(css,/scroll-behavior:smooth/);
 assert.match(html,/immersive-bg-video/);
});
test('desktop lyrics defaults to off and shortcut is configurable',()=>{
 const main=read('main.js'),html=read('app/index.html');
 assert.match(main,/desktopLyricsEnabled:false/);assert.match(main,/globalShortcut\.register/);
 assert.match(html,/id="lyrics-shortcut"/);
 assert.ok(!read('app/floating-lyrics.html').includes('title="左键拖动'));
});
