'use strict';
// Optional network smoke test for the packaged app; does not scan or reveal QR data.
const {connect,pages}=require('./cdp_client'),assert=require('node:assert/strict');
const port=Number(process.argv[2]||19390),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn){for(let i=0;i<240;i++){try{const value=await fn();if(value)return value}catch{}await sleep(100)}throw Error('打包版扫码登录服务未就绪');}
(async()=>{const client=await connect(await wait(async()=>(await pages(port)).find(p=>p.url.endsWith('/panel.html'))));try{
 const qr=await client.run('musicBridge.accountBegin()');assert.ok(/^data:image\/png;base64,/.test(qr.image),'QR missing');
 const result=await client.run('musicBridge.accountPoll()');assert.equal(result.state,'waiting');
 await client.run('musicBridge.accountCancel()');assert.equal((await client.run('musicBridge.accountStatus()')).loggedIn,false);
 console.log(JSON.stringify({ok:true,checks:['packaged local API process','live QR','waiting without credentials','cancel']}));
 await client.run("musicBridge.windowAction('quit')");
 }finally{client.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
