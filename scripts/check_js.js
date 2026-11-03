'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');let count=0;
for(const dir of ['.','app','scripts','tests'])for(const name of fs.readdirSync(path.join(root,dir))){
 if(!name.endsWith('.js')||name.includes('.tmp.'))continue;
 const result=spawnSync(process.execPath,['--check',path.join(root,dir,name)],{encoding:'utf8'});
 if(result.status!==0){console.error(result.stderr);process.exit(result.status||1);}count++;
}
console.log(`Syntax checked ${count} JavaScript files.`);
