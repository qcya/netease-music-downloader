'use strict';
// Isolated development launch: never overwrite the user's real settings.
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'../.validation/preview-data');
fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
const settings=path.join(dir,'settings.json');
if(!fs.existsSync(settings))fs.writeFileSync(settings,JSON.stringify({disclaimerAcceptedVersion:1,desktopLyricsEnabled:false,miniPlayerEnabled:true,downloadDir:path.join(dir,'music')}));
require('../main');
