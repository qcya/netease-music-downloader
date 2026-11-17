const {test}=require('node:test'),assert=require('node:assert/strict'),{inspectAudio}=require('../audio_quality');
test('audio bytes distinguish real FLAC/Hi-Res and MPEG bitrate regardless of API labels',()=>{
 const b=Buffer.alloc(42);b.write('fLaC');b.writeUIntBE(34,5,3);b.writeBigUInt64BE((44100n<<44n)|(15n<<36n),18);assert.equal(inspectAudio(b).actualQuality,'lossless');b.writeBigUInt64BE((96000n<<44n)|(23n<<36n),18);assert.equal(inspectAudio(b).actualQuality,'hires');
 for(const [header,quality]of [[0x90,'standard'],[0xb0,'higher'],[0xe0,'exhigh']])assert.equal(inspectAudio(Buffer.from([255,251,header,100])).actualQuality,quality);
 assert.equal(inspectAudio(Buffer.from('{"type":"flac"}')),null);assert.equal(inspectAudio(Buffer.from('ID3')),null);
});
test('large embedded MP3 artwork is skipped with a bounded second range instead of inventing a quality',async()=>{
 const {probeAudioQuality}=require('../audio_quality'),ranges=[],header=Buffer.alloc(16384);header.write('ID3');header[6]=0;header[7]=4;header[8]=0;header[9]=0;
 const result=await probeAudioQuality(async(_url,o)=>{ranges.push(o.headers.Range);assert.equal(o.credentials,'omit');return ranges.length===1?new Response(header):new Response(Buffer.from([255,251,224,100]),{status:206,headers:{'Content-Range':'bytes 65546-65549/90000'}});},'https://m7.music.126.net/test',new AbortController().signal);
 assert.deepEqual(ranges,['bytes=0-16383','bytes=65546-69641']);assert.equal(result.actualQuality,'exhigh');
});
