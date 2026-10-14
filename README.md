<div align="center">

# 音乐下载器 · Music Studio

![pink](https://img.shields.io/badge/UI-Soft%20Pink-f5c7e3?style=flat-square) ![blue](https://img.shields.io/badge/UI-Sky%20Blue-b8dfff?style=flat-square) ![dev](https://img.shields.io/badge/status-开发版-96b7df?style=flat-square)

**下载完整音乐 · 本地整理歌单 · 同步歌词 · 桌面悬浮歌词**

</div>

## 快速运行

Windows 11，Python 3.10+，Node.js 20+。第一次运行 `安装依赖.bat`，以后直接双击 **`启动桌面版.bat`**，或在 CMD 中运行 `npm start`。本阶段只开发、测试源码；不需要打包 EXE。

## 功能概览

- **首页**：搜索、导入歌单、批量下载，默认尽可能选择真实无损音频，不可用时回退并提醒。
- **我的歌单**：从已下载的本地歌曲建立歌单，不会重新下载或复制音频。
- **本地**：直接播放完整下载文件，查看未完成任务、取消或重试。
- **歌词**：点击播放器左侧封面进入左唱片、右滚动歌词的沉浸界面；也可在设置中启用粉蓝桌面歌词，使用自定义快捷键锁定与解锁。
- **背景**：可在设置中选择本地图片或 MP4/WebM 视频。模板与《柠檬》视频仅用作设计参考，仓库不重新分发用户提供的第三方素材。
- **AI Skill**：`skill/SKILL.md` 和 `skill/scripts/music_skill.py` 保持独立，供 AI 调用。

> **时长与权限说明**：搜索会过滤元数据明确不超过 20 秒的歌曲，下载会在能读取实际容器时拒绝明显短于歌曲时长的试听片段。第三方接口无法保证每首歌都有完整授权音频；本项目不尝试绕过版权、会员或 DRM 限制。

## 目录说明

| 路径 | 用途 |
|---|---|
| `app/` | HTML/CSS/JavaScript 前端、沉浸播放器与桌面歌词页面 |
| `assets/` | 新版图标和程序头像 |
| `skill/` | AI Skill、Python 音频与歌词接口、依赖及使用说明 |
| `skill/scripts/` | Skill 实现代码，单独可被其他 AI 调用 |
| `skill/references/` | API 参数与示例参考 |
| `skill/agents/` | AI Agent 识别 Skill 的元信息 |
| `scripts/` | 将来发行版的构建辅助脚本（当前无需运行） |
| `tests/` | 回归测试、下载与 UI 结构校验 |
| `.github/workflows/` | GitHub 自动测试；Windows EXE 构建需手动触发 |

根目录的 `main.js` 负责 Electron 主进程与本地 IPC，`preload.js` 是安全的界面桥接；`download_queue.js` 管理下载并发，`floating_window.js` 管理桌面歌词窗口。

## 自检

```bat
npm run check
node --test tests/*.js
python -m pytest -q tests
```

本项目为第三方工具，非网易云音乐官方客户端。音乐与歌词版权归原权利人所有，请在获得授权及适用法律允许的范围内使用。
