# Reference player refinement — implementation plan

> For agentic workers: execute the scoped tasks below; use superpowers:dispatching-parallel-agents for independent storage, audio, and renderer domains. Root integrates main/preload/panel and performs the final real UI acceptance.

Goal: Match the supplied Muonium screenshot with the user's exact exceptions, ship a folder ZIP, and make local music work without network/login.
Architecture: Retain Electron/native DWM glass and existing lyric engine. Adapt upstream geometry/assets in renderer; use existing official NetEase service for account playlists/FM. Keep all portable data adjacent to EXE.
Tech stack: Electron 37, vanilla JS, existing Java NetEase transport and Python download backend.
Spec: User message dated 2026-11-16 (five reference screenshots); preserved below.

## Binding requirements
- Name above sidebar search; song/playlist segmented search. Remove source selector and five bottom theme/font/size/refresh/download tools; remove nontransparent theme switching implementation.
- Sidebar home, official personal FM (daily random radio), downloaded music, actual signed-in cloud playlists with covers; account own avatar/nickname bottom left. No login gate for local files.
- Home hot/recommended playlist cover grid. Selected playlist header cover left of title; selected/current row matches upstream cyan outline/equalizer, unselected transparent rows; next/add/like actions remain.
- Footer upstream arrangement: art+title, previous/pause/next, five working modes (sequence/reverse/shuffle/stop-after/repeat-one), compact seek, queue, actual quality selection, lyric character, volume.
- Lyric button hover explains left toggle/right lock; small lock overlay reflects lock. Preserve existing desktop/fullscreen lyrics implementation.
- White return arrow without dark rectangle, tiny dark-gray stroke; no upper-right refresh button.
- Free dragging past taskbar and all screen sides, including partially outside; no steady-cursor drift; preserve INS-only toggle and native smooth light glass, no dark overlay.
- Folder distribution ZIP, no installer/self-extracting portable executable. Download/cache/playlist/settings persist beside EXE; cache deletion never removes downloads, login, or playlists; no default C:/Users Music directory.

## Tasks
- [x] Storage: portable path module, safe small-data legacy migration, migration tests; root wires main bootstrap/path factories, packaging ZIP.
- [x] Audio: requested quality travels to real resolution and source cache keys; mode assets and semantics verified; no fake lossless labels.
- [x] Renderer: exact user-specified sidebar/header/footer; authenticated cloud list updates on login/logout; add to real online playlist; FM loading queue uses official endpoint; no obsolete theme code.
- [x] Root integration: local playback doesn't wait on account/API, bridge quality/lyric/settings contracts, native drag unclamping, ZIP packaging and Chinese folders/docs.
- [x] Verify: targeted regressions, full JS tests/syntax/Python as appropriate; packaged offline local playback, real public playlists, mocked authenticated playlist/quality fixtures with no real account writes, delete-cache recovery, free dragging; inspect actual ZIP-built UI.

## Review focus
Account switching must discard stale cloud playlists; credentials never sent to public providers. Cache deletion must preserve persistent files. Portable path migration must not copy missing/deleted music or modify unrelated data. Quality switches must preserve seek/paused state and cancel stale requests. Offscreen movement must not drift or clamp at taskbar. UI handles small windows/empty downloads/guest states.

## Ledger
Existing workspace has extensive user-authorized uncommitted preview work; preserve it and work in place. No pushes/releases or remote playlist writes during verification. User has fully specified design and repeatedly requested direct implementation, so no additional design approval round.

Preview.8: packaged 7-check verification passed (offline playback/LRC, quality fallback and seek, lyric toggle/lock, five modes, cache deletion restart preserving preferences/downloads/playlists); 262 JS tests and 41 Python tests passed, plus opt-in real safeStorage forced-termination/cache-deletion decryption. Actual D:/应用 extraction successfully migrated saved account and loaded its ten cloud playlists, actual avatar and public recommendations.

Preview.9 follow-up (same session): larger application branding with icon; remove duplicate home welcome; adjacent SVG refresh; only avatar/nickname account footer; SVG lyric lock; larger and vertically centered footer, seek bottom clearance. Real Electron 1670/760 width geometry and 9 scenario checks passed, including refresh-to-heading gap <=20px. HTTP cloud-cover URLs normalized to trusted HTTPS; all ten actual account thumbnails loaded successfully. Native diagnostic found the existing visible, non-minimized HWND had lost WS_EX_TOPMOST: explicit post-show native topmost restoration regression passed. Material uses a bounded 25% opacity native blur host beneath opaque foreground UI; hidden state destroys that host, including delayed-load races. Native round preference, no GDI cutout and no accidental show from material configuration verified. Checkerboard comparison visually confirmed a substantially clearer 25% material; actual packaged home/playlist UI inspected, both window edges overlap. Do not claim the Windows Gaussian blur radius itself is adjustable; the host mixing ratio is adjusted. Further foreground-vs-host A/B comparison was occluded by a user's system overlay and was not used as evidence or to change production code.

Final verification: 267 JS tests passed with one opt-in integration skipped in that invocation; opt-in real Electron encryption test separately passed. All 41 Python tests, syntax checks, native overlay regressions, real renderer scenario checks, silent startup/hidden audio/idle worker release checks, packaged seven-scenario checks and final packaged-source byte comparison passed. ZIP/runtime-directory privacy check and final D-drive copy recorded in .validation. No GitHub push or release performed this turn.
