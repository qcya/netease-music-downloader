# Neutral transparent client correction

Request: zero background fill, no brightening/darkening, independent slight blur, visible outline, ordinary mouse interaction. Do not change text/icons/layout. Tests must not obstruct the user's computer.

Evidence before change: identical gray patches sampled from the old composited foreground changed RGB 48 to 129, 112 to 168 and 176 to 207 even without the separate blur host. This rules out only changing the host opacity as a complete fix.

Correction: disable native non-client rendering/material, clear extended client frame margins and explicitly request no system backdrop, while retaining separate accent blur and corner preference. The CSS root fill is now transparent; its only extra drawing is an inset thin outline. UI JS/font/HTML files compare byte-for-byte unchanged against preview.9.

Regression: real offscreen Electron check failed before the native correction (non-client rendering enabled) and passed afterwards. Verified native rendering disabled across blur toggle and resize, corner preference 2, zero-alpha client sample, unchanged foreground opacity, no alpha-based mouse passthrough, and HTCLIENT in an empty transparent area. Full JS tests: 268 passed, one opt-in test skipped. Python: 41 passed. Renderer layout/playback checks, idle/hidden playback checks and seven-scenario packaged verification passed. Package source byte comparison and no-user-data archive inspection passed.

Scope of evidence: new release was tested fully hidden/offscreen. There was no new on-screen brightness capture after the user requested non-disruptive testing. Native state and client-alpha checks must not be presented as a new desktop pixel comparison. The running production preview.9 was not terminated or replaced. Deliverable: preview.10 ZIP.
