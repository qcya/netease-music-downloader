# v1.1.1: desktop lyrics and memory-only online listening
Scope: fix silent desktop-lyric visibility/fetch failures; replace discovery download-and-play with explicit online Play and separate Download. Preserve local library, playlist and preference storage.
1. Add regression tests for streaming with no audio filesystem calls, partial streaming, cancellation, MIME/range/host rejection and trial denial.
2. Extract anonymous online source and lyric access, with memory-only bounded metadata, no disk cache, no full-file download fallback. Disable Chromium HTTP cache while preserving localStorage preferences.
3. Connect online playback to search/discovery and next/previous. Download is explicit only.
4. Desktop lyric status feedback, reliable public lyric source, background synchronization, native load errors, saved position/lock unchanged.
5. Run baseline/regressions/browser and packaged Windows E2E: play before complete body, no audio/cache writes, native lyric text and visibility with main minimized. Probe actual public endpoints separately. Report provider restrictions honestly.
