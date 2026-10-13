'use strict';
(function (root) {
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
    for (const row of rows) row.translation = translatedMap.get(Math.round(row.time * 100)) || '';
    return rows;
  }
  const api = Object.freeze({parseLrc});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MusicLRC = api;
})(typeof window !== 'undefined' ? window : null);
