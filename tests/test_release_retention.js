'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('automatic release cleanup excludes previews when selecting and checking stable releases',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/prune-releases.yml'),'utf8');
 const filter="select(.draft == false and .prerelease == false)";
 assert.equal(workflow.split(filter).length-1,2,'both deletion candidates and final assertion must preserve previews');
});
