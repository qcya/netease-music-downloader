# 音乐抽屉
Windows 10/11 x64 音乐下载与桌面播放器。当前源码：**1.2.0-preview.1**，这是待试用的改造版本，尚未发布到 GitHub Releases。

## 日常听歌
- 点击主窗口底部的“迷你”开启右侧抽屉；点击标题栏关闭按钮，也会收起主窗口并保留音乐播放。
- 屏幕右侧的小拉手可以点击或向左拖开。鼠标离开一秒后收起，点菱形图标可固定展开；Esc 收起。
- 抽屉里可以切歌、暂停、调进度和音量，选择播放队列、本地音乐或已有歌单，并筛选歌曲。
- “打开完整音乐库”回到下载管理界面。完全退出使用抽屉底部“退出”或系统托盘菜单。
- 主界面提供搜索、批量下载、下载重试、本地导入、歌单整理、沉浸播放和双语桌面歌词。桌面歌词首次默认开启，可在设置里关闭。

## 在线播放与试听
“在线播放”代表当前匿名接口提供完整音源；“试听 N 秒”或“试听片段”只播放接口实际提供的片段。不会将试听标成完整版，也不会自动下载整首歌曲到磁盘。

部分歌曲因会员、地区、版权、接口或网络原因没有可用音源。可点“重试检测”；仍失败时请查看原因。修改接口设置会重新检测。不能承诺所有歌曲可预览。

## 推荐
默认“近期新歌”从公开新歌接口获取近一年发行的歌曲，按真实发行日期排序。没有日期的数据不冒充新歌；接口失败会明确标记缓存日期或显示空状态。换一批不会循环伪装成新内容，切换分类可回到第一批。

“风格精选”和各风格分类保留旧推荐算法，可能包含经典歌曲；它们不是账号私人日推或实时 B 站榜单。

## 运行与构建
普通用户使用构建产物中的 portable.exe，无需安装 Node.js 或 Python。已发布的旧版在 [Releases](https://github.com/qcya/netease-music-downloader/releases)，不包含尚未发布的抽屉改造。

开发环境：Node.js 22+、Python 3.12（Windows 打包使用此版本）。也可使用现有的 `安装依赖.bat`、`启动桌面版.bat`、`构建Windows_EXE.bat`。

```powershell
npm ci
py -3.12 -m pip install -r skill/requirements.txt -r skill/requirements-build.txt pytest
npm start
npm run check
npm test
py -3.12 -m pytest -q tests
npm run build:win
```

构建输出位于 `dist/`。使用其他 Python 安装时，设置 `MUSIC_PYTHON_EXE` 指向对应 python.exe。应用启动后只有关闭完整窗口才隐藏到后台；退出应用会停止音乐和下载任务。

## 仓库导航
| 位置 | 用途 |
|---|---|
| `app/` | 管理界面、音乐抽屉、歌词、前端播放状态 |
| `assets/` | 应用图标、默认封面和内置背景 |
| 根目录 JS | Electron 主进程、窗口、IPC、下载队列、音乐库和音源服务 |
| `skill/` | 实际随应用打包的 Python 下载后端与 Agent Skill |
| `skill/scripts/` | 后端命令行入口 |
| `skill/references/` | 后端接口说明 |
| `skill/agents/` | Agent Skill 配置 |
| `scripts/` | 构建、诊断与实机验证脚本 |
| `tests/` | 历史及当前回归测试；文件名里的版本表示引入时间 |
| `.github/workflows/` | Windows 构建与验证；不自动发布新版 |
| `docs/history/` | 旧发行说明与旧阶段文档，只供追溯 |
| `docs/development.md` | 当前改造设计、实施记录、验证结果 |
| `docs/troubleshooting.md` | 播放、歌词、窗口与日志排查 |
| `CHANGELOG.md` | 当前版本变化 |

## 数据与清理
用户设置、歌单、日志在 Electron 的用户数据目录；音乐文件在设置指定的下载目录。切换版本前建议备份这些目录。源码仓库不存放音频下载、运行缓存、node_modules 或 EXE 构建结果，`.gitignore` 已排除这些文件。

历史发行文档已归档，没有删除用户音乐或历史测试。旧根目录 SKILL 说明重复且路径失效，唯一维护入口为 [skill/SKILL.md](skill/SKILL.md)。

本软件不是网易云官方客户端。仅在获得授权及适用法律允许的范围内使用；不绕过访问权限或数字版权保护。
