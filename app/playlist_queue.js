'use strict';
(function(root) {
  const navigation = typeof module === 'object' && module.exports ? require('./playback_navigation') : root.MusicPlaybackNavigation;
  function ordered(tracks, meta) {
    const known = new Set(tracks), seen = new Set();
    return [...(Array.isArray(meta?.order) ? meta.order : []), ...tracks].filter(name => {
      if (!known.has(name) || seen.has(name)) return false;
      seen.add(name); return true;
    });
  }
  function reconcile(queue, current, tracks, meta) {
    if (!queue || queue.kind==='online' || ['local', 'discovery-local', 'temporary'].includes(queue.id)) return queue;
    const categories = meta.categories || [], assignments = meta.assignments || {};
    const id = queue.id === 'default' || !categories.some(c => c.id === queue.id) ? 'default' : queue.id;
    const rows = ordered(tracks, meta).filter(name => (assignments[name] || 'default') === id);
    const detached = !!current && !rows.includes(current);
    // Removing a playing item from a list must not interrupt its current audio.
    if (detached) rows.unshift(current);
    if (!rows.length) return null;
    const result = {...navigation.createQueue(rows, Math.max(0, rows.indexOf(current)), queue.mode), id,
      stopAfterDetached: detached && rows.length === 1};
    if (result.mode === 'shuffle') {
      const map = indices => (indices || []).map(i => rows.indexOf(queue.tracks[i])).filter(i => i >= 0 && i !== result.index);
      const newNames = rows.map((name, i) => !queue.tracks.includes(name) && i !== result.index ? i : -1).filter(i => i >= 0);
      result.unplayed = [...new Set([...map(queue.unplayed), ...newNames])];
      result.past = map(queue.past); result.ahead = map(queue.ahead);
    }
    return result;
  }
  const api = {ordered, reconcile};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MusicPlaylistQueue = api;
})(typeof window !== 'undefined' ? window : null);
