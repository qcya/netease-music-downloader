'use strict';
function inspectAudio(value){
 const b=Buffer.from(value);
 if(b.length>=42&&b.toString('ascii',0,4)==='fLaC'&&(b[4]&127)===0&&b.readUIntBE(5,3)===34){const n=b.readBigUInt64BE(18),sampleRate=Number(n>>44n),bitDepth=Number((n>>36n)&31n)+1;if(sampleRate>0)return {actualQuality:sampleRate>48000||bitDepth>16?'hires':'lossless',lossless:true,format:'flac',sampleRate,bitDepth,qualityVerified:true};}
 if(b.length>=36&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WAVE'&&[1,3].includes(b.readUInt16LE(20))){const sampleRate=b.readUInt32LE(24),bitDepth=b.readUInt16LE(34);return {actualQuality:sampleRate>48000||bitDepth>16?'hires':'lossless',lossless:true,format:'wav',sampleRate,bitDepth,qualityVerified:true};}
 let start=0;if(b.length>=10&&b.toString('ascii',0,3)==='ID3')start=10+((b[6]&127)<<21)+((b[7]&127)<<14)+((b[8]&127)<<7)+(b[9]&127);
 for(let i=start;i+4<=b.length;i++){if(b[i]!==255||(b[i+1]&224)!==224)continue;const version=(b[i+1]>>3)&3,layer=(b[i+1]>>1)&3,index=b[i+2]>>4;if(version===1||layer!==1||index===0||index===15||((b[i+2]>>2)&3)===3)continue;const kbps=(version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[index];return {actualQuality:kbps<=128?'standard':kbps<=192?'higher':'exhigh',lossless:false,format:'mp3',bitrate:kbps*1000,qualityVerified:true};}
 return null;
}
async function probeAudioQuality(fetchImpl,url,signal){
 const read=async(offset,length)=>{const response=await fetchImpl(url,{headers:{Range:`bytes=${offset}-${offset+length-1}`,'Accept-Encoding':'identity'},cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(2000)])});if(!response.ok||!response.body||offset>0&&(response.status!==206||!response.headers.get('content-range')?.startsWith('bytes '+offset+'-'))){void response.body?.cancel();return Buffer.alloc(0);}const reader=response.body.getReader();let bytes=Buffer.alloc(0);try{while(bytes.length<length){const p=await reader.read();if(p.done)break;bytes=Buffer.concat([bytes,Buffer.from(p.value).subarray(0,length-bytes.length)]);}}finally{void reader.cancel().catch(()=>{});}return bytes;};
 const first=await read(0,16384),direct=inspectAudio(first);if(direct)return direct;
 if(first.length>=10&&first.toString('ascii',0,3)==='ID3'){const offset=10+((first[6]&127)<<21)+((first[7]&127)<<14)+((first[8]&127)<<7)+(first[9]&127);if(offset>=first.length&&offset<=8*1024*1024)return inspectAudio(await read(offset,4096));}
 return null;
}
module.exports={inspectAudio,probeAudioQuality};
