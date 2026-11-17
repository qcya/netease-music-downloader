'use strict';
// One DIP radius for the Chromium surface and the native Composition backdrop.
((root)=>{const shape=Object.freeze({radius:32});if(typeof module==='object'&&module.exports)module.exports=shape;else root.MusicWindowShape=shape;})(typeof window==='undefined'?globalThis:window);
