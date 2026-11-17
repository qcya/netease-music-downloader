# MuoniumPlayer source provenance

These unmodified Java files and the accompanying LICENSE and NOTICE are from
https://github.com/zihe114514/MuoniumPlayer-multiversion at commit
`9b4cc7e7bd143315da716075a6d024a0d4c0c81b`, Apache License 2.0.

`app/restored-player.js` and `app/restored-player.css` translate the logical
geometry from NCMScreen, NavigateBar, PlaylistPanel and ControlsBar. Original
icon fonts/PNGs and theme palettes are used from `assets/muonium`; their source
paths and SHA-256 digests are in `assets/muonium/sources.json`.
`scripts/verify_muonium_layout.js` checks key coordinates against those formulas
at the screenshot viewport. These Java files depend on the
Minecraft/Skija runtime and are retained for source attribution and comparison;
they are not executed by this desktop application. Audio, playlists and window
management use this application's existing implementations.
