'use strict';
// No BrowserWindow or real account. The parent kills the seed process before
// Chromium flushes preferences, then starts again after deleting the cache.
const {app,safeStorage}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {bootstrapPortableStorage}=require('../../portable_storage');
const storage=bootstrapPortableStorage({app});
const report=path.join(storage.userData,'runtime-result.json');
const encrypted=storage.persistentFile('encryption-fixture.enc');
const keyPersistedBeforeReady=fs.existsSync(storage.encryptionKeyFile);
const fixture='portable-test-fixture-with-no-account-credential';
app.whenReady().then(()=>{
 if(!safeStorage.isEncryptionAvailable())throw Error('Safe storage unavailable');
 if(!storage.persistEncryptionKeys())throw Error('Encryption key not persisted');
 const snapshot=JSON.parse(fs.readFileSync(storage.encryptionKeyFile,'utf8'));
 const keyOnlyEncrypted=Object.keys(snapshot).join(',')==='os_crypt'&&Object.keys(snapshot.os_crypt).every(key=>['encrypted_key','app_bound_encrypted_key'].includes(key));
 if(process.env.MUSIC_DOWNLOADER_CRYPTO_PHASE==='seed'){
  fs.writeFileSync(encrypted,safeStorage.encryptString(fixture));
  fs.writeFileSync(report,JSON.stringify({phase:'seed',keyPersistedBeforeReady,keyOnlyEncrypted,available:true}));
  setInterval(()=>{},1000);
 }else{
  const decrypted=safeStorage.decryptString(fs.readFileSync(encrypted))===fixture;
  if(!decrypted)throw Error('Fixture did not decrypt');
  fs.writeFileSync(report,JSON.stringify({phase:'verify',keyPersistedBeforeReady,keyOnlyEncrypted,decrypted}));
  app.quit();
 }
}).catch(()=>{fs.writeFileSync(report,JSON.stringify({failed:true}));app.exit(1);});
