# Agent 入口

这是「青春沿岸の音乐播放器」项目目录。先读 [AGENTS.md](AGENTS.md)；若包内有 [README.md](README.md)，也读它了解项目结构、运行方式和数据位置。网易云歌曲搜索、歌单查询和下载的专用 Agent Skill 在 [skills/netease-music-downloader/SKILL.md](skills/netease-music-downloader/SKILL.md)；需要本机 HTTP 调用时再看它的 API 参考。

发行包自带 `agent.cmd` 和 `resources/backend/music_backend.exe`。它们独立于播放器 GUI，默认把歌曲写到 `下载/`，把临时搜索状态写到 `缓存/agent/`。
