---
name: netease-music-downloader
description: Search NetEase Cloud Music, inspect songs or playlists, and download user-requested music through the backend included with this player package. Use for song discovery, playlist lookup, and video soundtrack sourcing; do not auto-download when the user only asks to search.
metadata:
  short-description: Search and download NetEase music from this package
---

# 网易云音乐搜索与下载

使用当前播放器包自带的后端，不依赖 Codex 全局技能、Python 安装或播放器窗口。先从包根目录运行 `agent.cmd`；发行包会把歌曲写入 `下载/`，搜索状态放在 `缓存/agent/`。

## 搜歌与下载

```powershell
.\agent.cmd search --query "歌曲名 歌手" --limit 15
.\agent.cmd download --id 33894312 --quality best
.\agent.cmd playlist --id 2619366284
.\agent.cmd playlist-download --id 2619366284 --yes
```

- 只要求查找或推荐时，只搜索并列出候选，不下载。
- 搜索结果不唯一时，展示编号、歌名、歌手和专辑，等用户选择后再运行 `select --indices "1,3"` 或按确认的 ID 下载。不得把相似歌曲当成目标。
- 下载用户明确指定的单曲或歌单。批量歌单先预览；下载整单需要明确要求，并使用 `--yes`。接口标为可能不完整时不要声称已完整下载。
- 默认优先保存服务实际提供的最高可用原始音质；`lossless` 与 `mp3` 是严格格式请求，缺少时如实报告。不得改扩展名、转码冒充无损或编造成功。
- 搜索/下载输出是单个 JSON 对象。以 `ok`、`results`、`success_count`、`failed_count` 和实际文件 `path` 为准；部分失败要明确列出。
- 账号权限和歌曲版权仍由网易云与音源服务决定。不要尝试绕过 DRM/会员限制；不要索取或在聊天中粘贴 Cookie。不要把账号 Cookie 发给默认公共 API。

## HTTP API

只有调用方确实需要 HTTP 时才启动可选本机服务。运行 `.\agent.cmd serve --port 0`，它会输出随机端口和连接文件路径；连接文件在 `缓存/agent/agent-api/connection.json`，含短期 bearer token。将令牌作为 `Authorization: Bearer <token>`，服务仅绑定 `127.0.0.1`、不开放 CORS，并在闲置五分钟后退出。令牌不得出现在聊天、普通日志或远端服务中。接口地址、JSON 字段和示例见 [references/API.md](references/API.md)。

## 项目上下文

此项目是 Windows Electron 网易云播放器，播放界面和 Agent 下载命令共用随包后端，但相互独立。Agent 搜索/下载不需要控制 GUI。项目开发约定与目录说明见根目录 `AGENTS.md`、`README.md`；不覆盖 `下载/`、`data/`、`playlists/`、`缓存/` 等用户数据。
