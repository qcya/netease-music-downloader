'use strict';
// Optional live smoke test in an isolated app profile. No user credentials are used.
const {connect,pages}=require('./cdp_client'),assert=require('node:assert/strict');
const port=Number(process.argv[2]||19393),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label){for(let i=0;i<300;i++){try{const value=await fn();if(value)return value}catch{}await sleep(100)}throw Error(label)}
(async()=>{const panel=await connect(await wait(async()=>(await pages(port)).find(p=>p.url.endsWith('/panel.html')),'播放器未就绪'));let website,qq;
 try{assert.equal((await panel.run('musicBridge.accountOpenWebLogin()')).open,true);
  website=await connect(await wait(async()=>(await pages(port)).find(p=>/^https:\/\/music\.163\.com\//.test(p.url)),'网易云官方页面未打开'));
  await wait(()=>website.run("!!document.querySelector('[data-action=login]')"),'官网登录入口未出现');
  await website.run("document.querySelector('[data-action=login]').click()");await wait(()=>website.run("[...document.querySelectorAll('a')].some(e=>e.textContent.includes('选择其他登录模式'))"),'登录方式选择未出现');
  await website.run("[...document.querySelectorAll('a')].find(e=>e.textContent.includes('选择其他登录模式')).click()");await wait(()=>website.run("[...document.querySelectorAll('a')].some(e=>e.textContent.trim()==='QQ登录')"),'QQ 登录入口未出现');
  // This is a disposable, anonymous test session; no account is used.
  await website.run("document.querySelector('#j-official-terms')?.click();[...document.querySelectorAll('a')].find(e=>e.textContent.trim()==='QQ登录').click()");
  qq=await connect(await wait(async()=>(await pages(port)).find(p=>/^https:\/\/graph\.qq\.com\//.test(p.url)),'QQ 官方授权页面未打开'));
  assert.equal((await panel.run('musicBridge.accountStatus()')).loggedIn,false);
  console.log(JSON.stringify({ok:true,checks:['packaged official login window','QQ OAuth page','no account or credential used']}));
 }finally{try{await qq?.send('Page.close')}catch{}qq?.close();try{await website?.send('Page.close')}catch{}website?.close();try{await panel.run("musicBridge.windowAction('quit')")}catch{}panel.close()}
})().catch(error=>{console.error(error.message);process.exitCode=1});
