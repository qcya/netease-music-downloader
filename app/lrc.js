'use strict';
(function (root) {
  function splitBilingual(raw) {
    const text = String(raw || '').trim();
    // Example: 迎えたくはないな1秒前（不想接受事实的1秒前）
    // Match a trailing Chinese translation without stripping ordinary Chinese song subtitles.
    const m = /^(.*?)\s*[（(]\s*([^（）()]*[\u3400-\u9fff][^（）()]*)\s*[）)]\s*$/.exec(text);
    if (!m) return {original:text, translation:''};
    const original=m[1].trim(), translated=m[2].trim();
    const nonChinese = /[\u3040-\u30ff\uac00-\ud7af]/.test(original) || /[A-Za-z]{2,}/.test(original);
    if (!original || !nonChinese || !translated) return {original:text, translation:''};
    return {original, translation:translated};
  }
  function parseLrc(text, translated = '') {
    const rows = [];
    const offsetTag = /\[offset\s*:\s*(-?\d+)\s*\]/i.exec(text || '');
    const offset = offsetTag ? Number(offsetTag[1]) / 1000 : 0;
    const translatedMap = new Map();
    const extract = (source, dest) => {
      for (const line of String(source || '').split(/\r?\n/)) {
        const stamps = [...line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
        if (!stamps.length) continue;
        const words = line.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim();
        if (!words) continue;
        for (const hit of stamps) {
          const ms = hit[3] ? Number(hit[3].padEnd(3, '0')) : 0;
          const timestamp = Math.max(0, Number(hit[1]) * 60 + Number(hit[2]) + ms / 1000 + offset);
          if (dest instanceof Map) dest.set(Math.round(timestamp * 100), words);
          else dest.push({time: timestamp, text: words});
        }
      }
    };
    extract(text, rows);
    extract(translated, translatedMap);
    rows.sort((a, b) => a.time - b.time);
    for (const row of rows) {
      const bilingual=splitBilingual(row.text);
      row.text=bilingual.original;
      // Dedicated tlyric is authoritative; inline translations are a fallback.
      row.translation=translatedMap.get(Math.round(row.time * 100)) || bilingual.translation;
      row.translation=row.translation.replace(/^[（(]\s*|\s*[）)]$/g, '').trim();
    }
    return rows;
  }
  // NetEase YRC: [line-start-ms,duration-ms](word-start-ms,duration-ms,flag)text.
  // Uses the same absolute word timestamps as upstream LyricParser (Apache-2.0).
  function parseLyrics(text,translated='',yrc=''){
    const ordinary=parseLrc(text,translated),translations=parseLrc(translated),rows=[];
    const offset=Number(/\[offset\s*:\s*(-?\d+)\]/i.exec(yrc)?.[1]||0)/1000;
    for(const raw of String(yrc).split(/\r?\n/)){
      const line=/^\[(\d+),(\d+)\](.*)$/.exec(raw.trim());if(!line)continue;
      const tokens=[...line[3].matchAll(/\((\d+),(\d+),\d+\)/g)];if(!tokens.length||tokens.length>500)continue;
      const words=tokens.map((m,i)=>({time:Math.max(0,Number(m[1])/1000+offset),duration:Math.max(0,Number(m[2])/1000),text:line[3].slice(m.index+m[0].length,tokens[i+1]?.index)})).filter(w=>w.text);
      const time=Math.max(0,Number(line[1])/1000+offset),original=words.map(w=>w.text).join('');if(!original||original.length>2000)continue;
      const match=translations.concat(ordinary.filter(r=>r.translation)).map(r=>({r,d:Math.abs(r.time-time)})).filter(x=>x.d<=.8).sort((a,b)=>a.d-b.d)[0]?.r;
      rows.push({time,duration:Number(line[2])/1000,text:original,words,translation:match?(match.translation||match.text):''});
    }
    return rows.length?rows.sort((a,b)=>a.time-b.time):ordinary;
  }
  const api = Object.freeze({parseLrc,parseLyrics,splitBilingual});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MusicLRC = api;
})(typeof window !== 'undefined' ? window : null);
