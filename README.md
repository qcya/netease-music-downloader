<div align="center">

# 🎵 网易云音乐下载器

**轻盈粉蓝 · 音乐搜索 / 试听 / 下载 / 同步歌词**

![Electron](https://img.shields.io/badge/Electron-桌面版-86B6E9?style=flat-square)
![Python](https://img.shields.io/badge/Python-AI%20Skill-F3A9D0?style=flat-square)
![Platform](https://img.shields.io/badge/平台-Windows-B5DDF5?style=flat-square)
![Status](https://img.shields.io/badge/状态-开发测试中-EFB6CE?style=flat-square)

搜索、播放、收藏，无须在多个页面间来回切换。界面提供粉蓝色调、桌面悬浮歌词及下载记录。

</div>

---

## 快速运行（当前只用源码版）

在 Windows 11 安装 **Node.js 20+** 和 **Python 3.10+** 后：

1. 首次打开运行 `安装依赖.bat`。
2. 双击 **`启动桌面版.bat`**，或在工程目录执行 `npm start`。
3. 第一次进入程序时确认普通下载目录、收藏目录并阅读免责声明。

修改代码后关闭窗口、重新启动即可。**开发阶段不需要生成 EXE。** 便携版构建脚本保留，待稳定后再使用。

## 能做什么

- 搜索网易云歌曲、浏览歌单、分页筛选、批量下载；多首歌曲可并行处理。
- 内置 MP3 试听、歌曲缓存、下载列表与收藏管理。
- LRC 同步歌词、翻译、可自定义的桌面悬浮歌词（默认粉字白描边）。
- 首次使用引导、独立下载/收藏路径、可查看下载任务状态。
- 同仓库提供 **独立 AI Skill**，供 AI 自动调用。

> 试听需要先向音乐接口解析音源地址；首次响应速度受第三方服务器影响。部分歌曲可能受版权/会员限制，无法试听、下载或获取歌词。

## 📁 项目目录说明

| 目录 | 用途 |
|---|---|
| `app/` | 软件界面：HTML、CSS、歌曲列表、播放器及桌面歌词 |
| `assets/` | 程序使用的 PNG 头像和多尺寸 ICO 图标 |
| `skill/` | AI Skill 定义、Python 下载核心与运行依赖 |
| `skill/scripts/` | Python 命令行执行入口（`music_skill.py`） |
| `skill/references/` | Skill 的接口和参数参考文档 |
| `skill/agents/` | AI Agent 的能力描述配置 |
| `scripts/` | 以后发布便携 EXE 时使用的后端打包工具 |
| `tests/` | 前后端自动测试和功能回归测试 |
| `.github/workflows/` | GitHub 自动测试；Windows EXE 构建需手动触发 |

根目录的 `main.js` 是 Electron 主进程，`preload.js` 提供受限界面通信；`download_queue.js` 管理下载并发；`floating_window.js` 管理桌面歌词窗口。`SKILL.md` 是 AI 入口说明。`安装依赖.bat` / `启动桌面版.bat` 分别用于依赖安装和源码启动。

## 🤖 AI Skill

```bash
python skill/scripts/music_skill.py --capabilities
python skill/scripts/music_skill.py search --query "雨爱" --limit 10
python skill/scripts/music_skill.py lyric --id 316100
```

详细参数见 [`skill/SKILL.md`](skill/SKILL.md) 和 [`skill/references/REFERENCE.md`](skill/references/REFERENCE.md)。

## 开发说明

- 在仓库根目录执行 `npm run check` 检查 JavaScript 语法；运行 `node --test tests/test_*.js` 执行 Node 测试。
- Python 测试：`python -m unittest discover -s tests -p "test_*.py"`。
- 源码模式下任务栏图标由 Windows 的应用标识和快捷方式缓存共同决定。如果曾固定旧版 EXE，需先取消固定，再从新运行的窗口重新固定。新源码使用与发行版不同的开发应用标识。
- **注意：** 项目包含第三方音乐服务接口，不能保证服务长期可用。请遵守版权法律和服务条款；本项目不提供 DRM 破解。

<div align="center"><sub>Made for a simple, gentle pink & blue listening experience.</sub></div>
