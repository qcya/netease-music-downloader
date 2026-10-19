from pathlib import Path
p=Path('scripts/verify_packaged_playlist.js');s=p.read_text(encoding='utf8')
def replace(a,b):
    global s
    assert s.count(a)==1,(a[:80],s.count(a))
    s=s.replace(a,b)
replace("const userData = process.argv[3];", "const userData = process.argv[3];\nconst processName=process.env.MUSIC_DOWNLOADER_TEST_PROCESS==='electron'?'electron':'MusicDownloader';")
replace("      const cut=Math.min(start+128044,end+1);res.write(pcm.subarray(start,cut));\n      const timer=setTimeout(()=>{completed++;res.end(pcm.subarray(cut,end+1));},9000);\n      res.on('close',()=>clearTimeout(timer));return;", """      // A direct-HTTP control also stalls with only 128044 bytes of this WAV.
      // Deliver progressive decoder input, then keep most of the body pending.
      // The before-completion assertion below remains mandatory.
      let cursor=start,timer;
      const prefixEnd=Math.min(start+256*1024,end+1);
      const send=()=>{
        const next=Math.min(cursor+32*1024,prefixEnd);
        res.write(pcm.subarray(cursor,next));cursor=next;
        if(cursor>=end+1){completed++;res.end();return;}
        if(cursor<prefixEnd)timer=setTimeout(send,100);
        else timer=setTimeout(()=>{completed++;res.end(pcm.subarray(cursor,end+1));},9000);
      };
      send();res.on('close',()=>clearTimeout(timer));return;""")
replace("Get-Process -Name MusicDownloader", 'Get-Process -Name "+processName+"')
replace("    await realClick('.discovery-play');", "    const streamingClickAt=Date.now();\n    await realClick('.discovery-play');")
replace("    assert.equal(fixture.completed(),0,'must play before complete response arrives');", "    assert.equal(fixture.completed(),0,'must play before complete response arrives');\n    console.log('STREAM START EVIDENCE',JSON.stringify({elapsedMs:Date.now()-streamingClickAt,completedResponses:fixture.completed(),currentTime:await c.run('document.getElementById(\"music-audio\").currentTime')}));")
replace("        assert.equal((await c.run('musicBridge.floatingLyricsStatus()')).visible,true);", "        assert.equal((await c.run('musicBridge.floatingLyricsStatus()')).visible,true);\n        const shot=await lyricClient.command('Page.captureScreenshot',{format:'png'});\n        fs.writeFileSync(path.join(userData,'desktop-lyrics-minimized.png'),Buffer.from(shot.data,'base64'));\n        console.log('DESKTOP LYRIC EVIDENCE',JSON.stringify(await c.run('musicBridge.floatingLyricsStatus()')));")
replace("      throw new Error(reason);", "      console.error('AUDIO FAILURE STATE',await c.run('(()=>{const a=document.getElementById(\"music-audio\");return {document:document.readyState,icons:document.querySelectorAll(\".nav-icon svg\").length,environment:document.getElementById(\"python-label\")?.textContent,ready:a.readyState,network:a.networkState,time:a.currentTime,paused:a.paused,error:a.error&&{code:a.error.code,message:a.error.message}}})()'));\n      throw new Error(reason);")
replace("  const c = await client(target.webSocketDebuggerUrl);let fixture;", "  const c = await client(target.webSocketDebuggerUrl);let fixture;\n  const initialized='document.readyState===\"complete\" && !!document.querySelector(\".nav-icon svg\") && /就绪/.test(document.getElementById(\"python-label\")?.textContent||\"\")';")
replace("    await wait('!!document.getElementById(\"playlist-create-category\")','Playlist creation button absent');", "    await wait('!!document.getElementById(\"playlist-create-category\")','Playlist creation button absent');\n    await wait(initialized,'Renderer initialization did not finish before input',150);")
replace("    await wait('!!window.musicBridge && !!document.getElementById(\"playlist-create-category\")','Renderer did not reload');", "    await wait('!!window.musicBridge && !!document.getElementById(\"playlist-create-category\")','Renderer did not reload');\n    await wait(initialized,'Renderer initialization did not finish after reload',150);")
p.write_text(s,encoding='utf8')
