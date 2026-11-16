'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('real Electron Windows safeStorage decrypts after forced shutdown and cache deletion',{
 skip:process.platform!=='win32'||process.env.MUSIC_DOWNLOADER_RUN_ELECTRON_STORAGE_TEST!=='1',timeout:25000
},async t=>{
 fs.mkdirSync(path.join(__dirname,'..','.validation'),{recursive:true});
 const root=fs.mkdtempSync(path.join(__dirname,'..','.validation','encryption-runtime-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const executable=path.join(__dirname,'..','node_modules','electron','dist','electron.exe');
 const report=path.join(root,'runtime-result.json');
 const run=phase=>{
  const env={...process.env,MUSIC_DOWNLOADER_TEST_USER_DATA:root,MUSIC_DOWNLOADER_CRYPTO_PHASE:phase};delete env.ELECTRON_RUN_AS_NODE;
  return spawn(executable,[path.join(__dirname,'helpers','portable_encryption_runtime.js')],{env,stdio:'ignore',windowsHide:true});
 };
 const waitReport=async phase=>{
  for(let i=0;i<150;i++){
   try{const value=JSON.parse(fs.readFileSync(report,'utf8'));if(value.failed)throw Error('Isolated Electron encryption failed');if(value.phase===phase)return value;}
   catch(error){if(error.message==='Isolated Electron encryption failed')throw error;}
   await sleep(50);
  }
  throw Error('Isolated Electron encryption timed out');
 };
 const seed=run('seed');t.after(()=>{if(seed.exitCode===null)seed.kill();});
 const initial=await waitReport('seed');assert.equal(initial.keyPersistedBeforeReady,true);assert.equal(initial.keyOnlyEncrypted,true);
 const exited=new Promise(resolve=>seed.once('exit',resolve));seed.kill();await exited;
 fs.rmSync(path.join(root,'缓存'),{recursive:true,force:true});
 assert.equal(fs.existsSync(path.join(root,'chromium-encryption-key.json')),true);
 assert.equal(fs.existsSync(path.join(root,'encryption-fixture.enc')),true);
 const verify=run('verify');t.after(()=>{if(verify.exitCode===null)verify.kill();});
 const verifyExited=new Promise(resolve=>verify.once('exit',resolve));
 const result=await waitReport('verify');assert.equal(result.decrypted,true);assert.equal(result.keyPersistedBeforeReady,true);assert.equal(result.keyOnlyEncrypted,true);
 await verifyExited;
});
