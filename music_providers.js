'use strict';
// Keep downloader and player defaults aligned. Regression test checks Python's list.
const DEFAULT_MUSIC_APIS=Object.freeze(['https://musicapi.qijieya.cn','https://api.qijieya.cn']);
function effectiveMusicApis(configured,env=process.env){
 if(Array.isArray(configured)&&configured.length)return configured;
 const inherited=String(env.NETEASE_API_BASE_URL||'').split(',').map(s=>s.trim()).filter(Boolean);
 return inherited.length?inherited:[...DEFAULT_MUSIC_APIS];
}
module.exports={DEFAULT_MUSIC_APIS,effectiveMusicApis};
