'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const dir=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(dir,p),'utf8');
test('readme documents every maintained folder and developer startup',()=>{
 const doc=read('README.md');
 for(const folder of ['app/','assets/','skill/','skill/scripts/','skill/references/','skill/agents/','scripts/','tests/','.github/workflows/'])assert.ok(doc.includes('`'+folder+'`'),folder);
 assert.match(doc,/启动桌面版\.bat/);
});
test('old uploader and duplicated icon extraction are removed',()=>{
 for(const name of ['GITHUB_上传说明.md','UPGRADE_V2.md','V2.1_RELEASE.md','check_exe_icon.ps1','publish_github.ps1','一键创建并上传GitHub.bat'])assert.equal(fs.existsSync(path.join(dir,name)),false,name);
 assert.equal(fs.existsSync(path.join(dir,'验证EXE图标.ps1')),true);
});
test('dev taskbar identity differs from packaged app and uses bundled icon',()=>{
 const s=read('main.js');
 assert.match(s,/app\.isPackaged \? 'top\.qcya\.netease\.music\.desktop' : 'top\.qcya\.netease\.music\.desktop\.dev'/);
 assert.match(s,/win\.setIcon\(appIcon\(\)\)/);
 assert.match(s,/win\.setAppDetails/);
});
