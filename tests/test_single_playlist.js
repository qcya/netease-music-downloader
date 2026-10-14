'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createPlaylistStore,PREFIX,validName}=require('../local_playlist.js');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'music-playlist-')),index=path.join(root,'playlist.json');
 const store=createPlaylistStore({getDir:()=>root,getIndexFile:()=>index,
   readJSON:(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return d}},
   writeJSONAtomic:(f,d)=>{const tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(d));fs.renameSync(tmp,f)}
 });
 return {root,index,store,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('single playlist renames audio and the matching bilingual LRC, then restores on removal',t=>{
 const f=fixture();t.after(f.close);
 fs.writeFileSync(path.join(f.root,'A [123].flac'),'fLaC');
 fs.writeFileSync(path.join(f.root,'A [123].lrc'),'[00:01]你好');
 const pl=f.store.add('default','A [123].flac')[0];
 assert.deepEqual(pl.tracks,['[歌单] A [123].flac']);
 assert.equal(fs.existsSync(path.join(f.root,'A [123].flac')),false);
 assert.equal(fs.readFileSync(path.join(f.root,'[歌单] A [123].lrc'),'utf8'),'[00:01]你好');
 const original=f.store.remove('default','[歌单] A [123].flac')[0];
 assert.deepEqual(original.tracks,[]);
 assert.equal(fs.existsSync(path.join(f.root,'A [123].flac')),true);
 assert.equal(fs.existsSync(path.join(f.root,'A [123].lrc')),true);
 assert.equal(fs.existsSync(path.join(f.root,'[歌单] A [123].flac')),false);
});
test('upgrade old multiple playlists into a single list without data loss',t=>{
 const f=fixture();t.after(f.close);
 for(const name of ['A.flac','B.mp3'])fs.writeFileSync(path.join(f.root,name),'test');
 fs.writeFileSync(f.index,JSON.stringify([{id:'old1',name:'a',tracks:['A.flac']},{id:'old2',name:'b',tracks:['B.mp3','A.flac']}]));
 const playlists=f.store.list();
 assert.deepEqual(playlists,[{id:'default',name:'我的歌单',tracks:['[歌单] A.flac','[歌单] B.mp3']}]);
 assert.equal(f.store.list().length,1);
 for(const name of playlists[0].tracks)assert.ok(fs.existsSync(path.join(f.root,name)));
});
test('existing destinations are never overwritten, and path traversal is rejected',t=>{
 const f=fixture();t.after(f.close);
 fs.writeFileSync(path.join(f.root,'A.mp3'),'original');
 fs.writeFileSync(path.join(f.root,'[歌单] A.mp3'),'existing');
 assert.throws(()=>f.store.localFile('../A.mp3'),/无效/);
 assert.equal(validName('..\\A.mp3'),false);
 // Already tagged files may be reconciled; conflict cannot overwrite either file.
 assert.equal(f.store.list()[0].tracks.includes('[歌单] A.mp3'),true);
 assert.equal(fs.readFileSync(path.join(f.root,'A.mp3'),'utf8'),'original');
 assert.equal(fs.readFileSync(path.join(f.root,'[歌单] A.mp3'),'utf8'),'existing');
});
test('playlist records are removed after a song goes to recycle bin',t=>{
 const f=fixture();t.after(f.close);
 fs.writeFileSync(path.join(f.root,'M.flac'),'fLaC');
 f.store.add('default','M.flac');
 fs.rmSync(path.join(f.root,'[歌单] M.flac'));
 f.store.afterDelete('[歌单] M.flac');
 assert.deepEqual(f.store.list()[0].tracks,[]);
});
