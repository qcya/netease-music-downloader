<div align="center">

# 音乐下载器 v1.0.0

**音乐下载 · 下载管理 · 本地播放 · 同步歌词**

Windows 桌面应用 / 单文件便携版

[下载最新版本](https://github.com/qcya/netease-music-downloader/releases/latest)

</div>

## 主要功能

- **音乐下载**：搜索歌曲、批量下载、任务队列、失败重试，并显示下载结果和音质信息。
- **本地音乐**：下载后即可播放，支持收藏和自建歌单。
- **同步歌词**：双语歌词分行显示，支持点击歌词定位、滚动浏览和进度条跳转。
- **沉浸播放**：支持 1080p 动态背景，也可以自行选择图片或视频。
- **桌面歌词**：默认关闭，需要时手动开启；支持白色柔光、样式调节、位置锁定和鼠标穿透。

## 下载与运行

普通用户：在 [GitHub Releases](https://github.com/qcya/netease-music-downloader/releases/latest) 下载 `MusicDownloader-1.0.0-portable.exe`，直接双击即可运行。适用于 Windows 10/11 64 位系统，无需安装 Python 或 Node.js。

开发者：使用 Node.js 20+ 与 Python 3.10+。首次运行 `安装依赖.bat`，以后使用 `启动桌面版.bat` 或 `npm start` 启动源码。需要自行生成便携版时可运行 `构建Windows_EXE.bat`。

## 代码结构与文件说明

下表保留仓库中的原始文件名，所有用途介绍均为中文，方便查找和继续开发。

### 项目根目录

| 文件名 | 中文说明 |
|---|---|
| `README.md` | 项目介绍、下载入口、运行方法和完整的文件说明。 |
| `RELEASE_NOTES_v1.0.0.md` | 正式版发布内容、主要功能和 EXE 文件校验说明。 |
| `package.json` | 项目版本、依赖、启动命令以及 Electron 打包设置。 |
| `main.js` | 桌面程序主进程，管理窗口、系统配置、歌曲下载与本地播放接口。 |
| `preload.js` | 主窗口的安全通信接口，供前端调用本地功能。 |
| `floating-preload.js` | 桌面歌词窗口的安全通信接口。 |
| `floating_window.js` | 创建桌面歌词窗口，处理显示、拖动、锁定、鼠标穿透与窗口尺寸。 |
| `lyric_preferences.js` | 桌面歌词默认样式、个性化设置和参数检查。 |
| `download_queue.js` | 下载任务队列，负责并行数量、去重、暂停、恢复和取消。 |
| `backend_runtime.js` | 查找并启动音乐后端，支持开发环境与 EXE 内置后端。 |
| `app_logger.js` | 程序日志与错误信息记录。 |
| `SKILL.md` | 为 AI 调用程序功能提供入口和使用指导。 |
| `安装依赖.bat` | 安装开发时需要的依赖。 |
| `启动桌面版.bat` | 从源代码启动桌面程序。 |
| `构建Windows_EXE.bat` | 在 Windows 上编译单文件便携版。 |
| `验证EXE图标.ps1` | 提取编译后 EXE 中的程序图标用于检查。 |
| `.gitignore` | 配置不提交的缓存、临时文件、下载文件和构建产物。 |
| `.gitattributes` | 配置 Git 文件属性及换行方式。 |

### `app/` — 页面与播放器

| 文件名 | 中文说明 |
|---|---|
| `app/index.html` | 主界面页面结构，包含搜索、下载、本地音乐、设置和沉浸播放器。 |
| `app/style.css` | 主程序界面布局、配色、按钮、列表与控件样式。 |
| `app/renderer.js` | 前端交互逻辑，负责搜索结果、下载状态、本地播放和歌词同步。 |
| `app/immersive.css` | 沉浸播放器布局、背景显示和滚动歌词外观。 |
| `app/lyric-glow.css` | 沉浸播放器与桌面歌词共用的文字柔光和阴影效果。 |
| `app/lrc.js` | 解析歌词时间戳，整理原文与翻译。 |
| `app/lyric_navigation.js` | 歌词点击定位与惯性滚动计算。 |
| `app/floating-lyrics.html` | 桌面悬浮歌词的独立页面。 |
| `app/floating-lyrics.css` | 悬浮歌词字体、透明背景、大小、间距和外观。 |
| `app/floating-lyrics.js` | 桌面歌词实时更新、窗口拖动、文字显示及样式应用。 |

### `assets/` — 图片与视频

| 文件名 | 中文说明 |
|---|---|
| `assets/app.ico` | 软件图标和 Windows 任务栏图标。 |
| `assets/avatar.png` | 主界面使用的头像图片。 |
| `assets/immersive-background-1080p.mp4` | 沉浸播放模式自带的 1080p 动态背景。 |

### `skill/`、`scripts/` — 后端与构建

| 文件名 | 中文说明 |
|---|---|
| `skill/SKILL.md` | 音乐功能的 AI 调用说明。 |
| `skill/scripts/music_skill.py` | Python 音乐后端，处理搜索、歌曲信息、歌词及文件下载。 |
| `skill/requirements.txt` | Python 后端运行依赖。 |
| `skill/requirements-build.txt` | 后端打包所需依赖。 |
| `skill/references/REFERENCE.md` | 后端接口参数与调用示例。 |
| `skill/agents/openai.yaml` | AI 工具识别音乐功能时使用的配置。 |
| `scripts/build_backend.py` | 将 Python 后端打包为 EXE 内置的独立程序。 |

### `tests/` — 自动测试

| 文件名 | 中文说明 |
|---|---|
| `tests/test_backend_bridge.js` | 测试主程序和音乐后端之间的通信与下载流程。 |
| `tests/test_parallel_bridge.js` | 测试并发下载和相同歌曲的请求去重。 |
| `tests/test_download_queue.js` | 测试下载队列、任务顺序、暂停、恢复和取消。 |
| `tests/test_lrc.js` | 测试歌词时间轴与翻译解析。 |
| `tests/test_repository_hygiene.js` | 检查仓库结构、必需文件及说明文档。 |
| `tests/test_ui_structure.js` | 检查界面组件和主要交互入口。 |
| `tests/test_v6_structure.js` | 检查首次运行与各页面的连接关系。 |
| `tests/test_v23_design.js` | 测试播放器布局、歌曲列表和按钮行为。 |
| `tests/test_v23_player_revision.js` | 测试沉浸播放器、桌面歌词与背景资源。 |
| `tests/test_v24_lyric_navigation.js` | 测试歌词拖动、逐句跳转与惯性滚动。 |
| `tests/test_v24_revision.js` | 检查歌词翻译、发光效果和默认启动状态。 |
| `tests/test_v21_features.js` | 检查桌面歌词设置及 Windows 打包配置。 |
| `tests/test_integration_cli.py` | 测试 Python 命令行程序的完整调用流程。 |
| `tests/test_music_skill.py` | 检查音乐后端各项功能的结果。 |
| `tests/test_search_duration.py` | 测试歌曲时长信息的处理。 |
| `tests/test_short_audio.py` | 检查下载音频的有效性和异常短文件。 |
| `tests/test_v21_backend.py` | 检查后端相关功能和兼容性。 |
| `tests/test_v6_music.py` | 测试音乐下载与歌词基础逻辑。 |
| `tests/test_windows_batch.py` | 检查 Windows 批处理脚本的编码与命令。 |
| `tests/test_windows_encoding.py` | 检查 Windows 字符编码及发布工作流设置。 |

### `.github/workflows/` — GitHub 自动化

| 文件名 | 中文说明 |
|---|---|
| `.github/workflows/check.yml` | 每次提交或合并时自动运行代码检查和回归测试。 |
| `.github/workflows/windows-build.yml` | 使用 Windows 环境打包便携版、校验文件并发布版本。 |

## 代码自检

```bat
npm run check
node --test tests/test_*.js
python -m pytest -q tests
```

## 版本说明

**v1.0.0** 是本项目首次正式发布版本。下载是核心功能，本地音乐播放、歌单和同步歌词作为辅助功能。

使用下载内容时，请遵守适用法律和版权规定。
