'use strict';
// End-to-end smoke test for the ACTUAL packed Windows executable.
// Invocation: node scripts/verify_packaged_playlist.js <CDP-port> <user-data-dir>
// The executable must be launched with --remote-debugging-port=<CDP-port>.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const port = Number(process.argv[2]);
const userData = process.argv[3];
if (!Number.isInteger(port) || port < 1 || !userData) throw new Error('Usage: node scripts/verify_packaged_playlist.js PORT USER_DATA');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const endAt = Date.now() + 30000;
async function debuggerTarget() {
  while (Date.now() < endAt) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list', {signal:AbortSignal.timeout(1500)});
      if (response.ok) {
        const pages = await response.json();
        const target = pages.find(x => x.type === 'page' && /index\.html/i.test(x.url));
        if (target && target.webSocketDebuggerUrl) return target;
      }
    } catch { /* The packaged process might still be starting. */ }
    await delay(250);
  }
  throw new Error('Packaged Electron renderer did not expose a CDP page at port ' + port);
}
async function client(url) {
  const socket = new WebSocket(url);
  let serial = 0;
  const pending = new Map();
  socket.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once:true});
    socket.addEventListener('error', reject, {once:true});
  });
  return {
    async command(method,params) {
      const id = ++serial;
      const resultPromise = new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
      socket.send(JSON.stringify({id,method,params}));
      const result = await Promise.race([
        resultPromise,
        delay(15000).then(()=>{throw new Error('CDP Runtime.evaluate timed out: '+expression.slice(0,140));})
      ]);
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result;
    },
    async run(expression) {
      const result = await this.command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      return result.result?.value;
    },
    close() { socket.close(); }
  };
}
async function main() {
  const target = await debuggerTarget();
  console.log('Renderer URL:',target.url);
  const c = await client(target.webSocketDebuggerUrl);
  try {
    async function wait(condition, reason) {
      for (let attempt=0;attempt<70;attempt++) {
        if (await c.run(condition)) return;
        await delay(180);
      }
      throw new Error(reason);
    }
    async function realClick(selector) {
      const point = await c.run('(()=>{let e=document.querySelector('+JSON.stringify(selector)+');if(!e)return null;e.scrollIntoView({block:"center"});let r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
      if (!point) throw new Error('Click target not found: '+selector);
      const hit = await c.run('document.elementFromPoint('+point.x+','+point.y+')?.outerHTML?.slice(0,150)');
      console.log('Click',selector,'hit',hit);
      await c.command('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
      await c.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
    }
    await wait('!!document.getElementById("playlist-create-category")','Playlist creation button absent');
    // Complete first-launch consent before any pointer testing, so a modal cannot cover controls.
    const disclaimer = await c.run('!document.getElementById("first-run").hidden');
    if (disclaimer) {
      await c.run('(()=>{const box=document.getElementById("agree-disclaimer");box.checked=true;box.dispatchEvent(new Event("change",{bubbles:true}));return true})()');
      await realClick('#first-confirm');
      await wait('document.getElementById("first-run").hidden','First-run disclaimer could not be dismissed');
    }
    await realClick('.nav-item[data-view=playlists]');
    await wait('document.getElementById("view-playlists").classList.contains("active")',
      'My Playlists did not open');

    // A clean install has no songs: default section must still be visible and renamable.
    await wait('!!document.querySelector(".playlist-category[data-category-id=uncategorized] button")',
      'Empty default playlist cannot be renamed');

    const createButton = '#playlist-create-category';
    await realClick(createButton);
    await wait('!document.getElementById("playlist-name-dialog").hidden',
      'Clicking New Playlist did not open an input dialog');
    await c.run('(()=>{const input=document.getElementById("playlist-name-input");input.value="打包验收歌单";input.dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("playlist-name-form").requestSubmit();return true})()');
    await wait('document.getElementById("playlist-name-dialog").hidden && [...document.querySelectorAll(".playlist-category-header strong")].some(x=>x.textContent.includes("打包验收歌单"))',
      'New playlist not saved/rendered by packaged Electron');

    await realClick('.playlist-category:not([data-category-id=uncategorized]) .playlist-category-header button');
    await wait('!document.getElementById("playlist-name-dialog").hidden',
      'Clicking Rename did not open dialog');
    await c.run('(()=>{document.getElementById("playlist-name-input").value="打包验收已改名";document.getElementById("playlist-name-form").requestSubmit();return true})()');
    await wait('document.getElementById("playlist-name-dialog").hidden && [...document.querySelectorAll(".playlist-category-header strong")].some(x=>x.textContent.includes("打包验收已改名"))',
      'Named playlist rename was not persisted/displayed');

    await realClick('.playlist-category[data-category-id=uncategorized] button');
    await wait('!document.getElementById("playlist-name-dialog").hidden',
      'Default playlist rename dialog absent');
    await c.run('(()=>{document.getElementById("playlist-name-input").value="打包验收默认歌单";document.getElementById("playlist-name-form").requestSubmit();return true})()');
    await wait('document.getElementById("playlist-name-dialog").hidden && document.querySelector(".playlist-category[data-category-id=uncategorized] strong")?.textContent.includes("打包验收默认歌单")',
      'Default playlist rename not persisted/displayed');

    const filename = path.join(userData,'playlist-categories.json');
    const saved = JSON.parse(fs.readFileSync(filename,'utf8'));
    assert.equal(saved.defaultName,'打包验收默认歌单');
    assert.ok(saved.categories.some(x=>x.name==='打包验收已改名'));
    assert.equal(saved.categories.some(x=>x.name==='打包验收歌单'),false);
    console.log('PASS: packaged app New Playlist and both Rename buttons clicked, IPC succeeded, JSON persisted.');
  } finally { c.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
