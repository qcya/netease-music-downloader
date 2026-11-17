'use strict';
// Hosted Windows runners have no normal interactive GPU session. Keep renderer
// checks deterministic there; shipping app hardware acceleration is unchanged.
const {app}=require('electron'),path=require('node:path');
process.on('uncaughtException',e=>{console.error(e.stack);app.exit(1);});
process.on('unhandledRejection',e=>{console.error(e.stack||e);app.exit(1);});
if(process.env.CI)app.disableHardwareAcceleration();
const file=process.argv[2];if(!file)throw Error('Expected a verification script');
console.log('Starting hidden Electron check: '+path.basename(file));
process.argv.splice(1,1);require(path.resolve(file));
