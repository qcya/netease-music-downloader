# 开发阶段：直接运行源码，不要打包 EXE

当前优先采用 **Windows 命令提示符 + Electron 源码启动**：双击 `启动桌面版.bat`。
首次使用且没有 `node_modules` 时，启动脚本会自动调用 `安装依赖.bat`。
也可在项目目录用 CMD 执行：

```bat
npm start
```

开发期间修改 `app/`、`main.js`、`skill/scripts/music_skill.py` 后，关闭正在运行的软件，再执行 `启动桌面版.bat` 即可看到新版。**不必重新构建 EXE**，也不需要每次重新安装 npm 依赖。

**本轮修复：** Windows GBK 下遇到含有 `ö` 等字符的曲名/歌手名时，Python CLI 的 JSON 输出不再抛出 `UnicodeEncodeError`。独立 Electron 前端仍使用 UTF-8，并完整解码子进程的多字节字符。GitHub Actions 不再随每次 push 自动构建便携 EXE，只保留自动测试，等桌面版验收后再手动发版。

**Android 版：** 等 Windows 开发版实际使用稳定后，再适配安卓。Android 不能直接运行 Electron/PyInstaller 的 Windows EXE；需要单独移动端 UI 与兼容的后端架构。

---

# 网易云音乐下载器 v2.1（Electron + Python AI Skill）

> **v2.1 更新：** 桌面歌词可自定义粉蓝配色、白色描边、背景透明度、字号、行距、翻译及自适应长句； Windows portable EXE 包含编译后的 Python 后端，不要求普通用户安装 Python。AI Skill 源码保持独立。

**源码运行**：Windows 11，Node.js 20+，Python 3.10+；执行 `安装依赖.bat` 后 `启动桌面版.bat`。

**制作单 EXE**：运行 `构建Windows_EXE.bat`。构建机须有 Node.js 20+ 和 Python 3.10+。脚本运行 PyInstaller 创建 `backend/music_backend.exe`，完成离线自检，再由 electron-builder 打包为 `dist/MusicDownloader-2.1.0-portable.exe`。编译后的 portable EXE 面向最终用户，不需要本机 Python/Node/npm。Electron portable 启动会在系统临时目录展开运行文件，这是单 EXE 发行模式的正常行为。

**GitHub 构建**：Actions → Build Windows Portable → Run workflow；不再随 `main` 分支提交自动触发；只在开发完成后手动点击 Run workflow 构建。

**桌面歌词**：软件设置页底部可以选择无背景、粉蓝玻璃或实色，原文/翻译/描边颜色、字号、窗宽、行距、阴影、透明度、对齐方式、置顶。默认无背景、粉色原文、白色描边和淡蓝翻译。长句自动换行；歌词窗随实际内容增加高度，在屏幕限制内显示，超高可滚动。右下角拖动把手支持移动，锁定后支持鼠标穿透，回主界面点「解锁」恢复操作。

**首次启动**：确认普通下载路径、收藏路径和免责声明后，不再自动弹出。设置页可修改路径并复查免责声明。

**AI Skill**：`SKILL.md`、`skill/SKILL.md`、`skill/scripts/music_skill.py` 始终保留。源码 AI 调用示例：

```bash
python skill/scripts/music_skill.py --runtime-info
python skill/scripts/music_skill.py search -q "晴天" --limit 15
python skill/scripts/music_skill.py lyric --id 33894312
python skill/scripts/music_skill.py download --id 33894312 --quality best
```

该项目使用第三方音乐 API。可访问的音频受权限及服务器可用性限制，不提供 DRM 绕过。不保证所有歌曲可获得歌词或无损格式。版权使用请遵守所在地法律和服务条款。

## 历史说明

# v2.0 新功能

详细升级说明请先阅读 [UPGRADE_V2.md](UPGRADE_V2.md)。包含首次使用免责声明、独立下载和收藏路径、桌面悬浮歌词、任务管理、流式 MP3 试听回退与 GitHub Actions Windows 构建。

---

# 网易云音乐下载器 · Electron 粉蓝桌面版

**v5.1（Windows 程序版本 1.3.0）修复“有另一项操作正在执行”以及无法同时下载多首歌曲的问题。** 保留已有粉蓝 UI、MP3 试听、每周缓存清理、无损收藏和 LRC 歌词功能，歌曲下载仍调用 Python 核心。

### v5.1 并行下载与升级

- **原因**：旧 Electron 主进程有全局 `currentJob` 锁；上一首歌未完成时，第二个下载请求直接被拒绝。前端还会禁用其他歌曲的下载按钮。
- **修复**：现在一首歌曲一个 Python 下载进程，受统一下载队列管理。默认同时下载 **3 首不同歌曲**；设置页面可以改为 **1、2、3、4 或 6 首**。超过数量自动排队，不再报“有另一项操作正在执行”。
- **防重复与容错**：同一目录下同 ID、同音质的重复请求合并；一首歌失败不会取消其他歌曲。每首卡片显示排队中、下载中、已完成或失败，下方显示任务摘要。搜索、歌词请求和 MP3 试听不再被全局下载锁限制。
- **质量保障**：Python 下载时仍使用各自独立的随机临时文件，完成后再改名，不会把半成品作为正式文件。收藏继续优先真实无损，试听继续采用 MP3 缓存。
- **并发含义**：这是多首音乐同时下载，不是将单首音乐拆成多个分片；后者需要音源服务器稳定支持 HTTP Range，当前未启用，以免产生无法解码的音频文件。高并发可能触发第三方 API 限流，可在设置里调低。
- **升级 v5.0**：关闭软件，将 v5.1 升级补丁解压到原来的 `netease-music-electron` 工程根目录并覆盖同名文件；双击 `启动桌面版.bat` 即可。若使用已打包的 EXE，须重新执行 `构建Windows_EXE.bat`，新文件为 `dist\MusicDownloader-1.3.0-portable.exe`。原有 `node_modules` 与 Python 依赖无需重装。

**验证**：本地模拟接口实测 7 首音乐同时提交下载，最高并行数不超过 3，重复任务只下载一次。真实网易云第三方接口的并发限流和 Windows EXE 的行为仍需你的电脑验证。

---

**v5.0（Windows 版本 1.2.0）修复歌词获取，并增加快速 MP3 试听、每周自动清理试听缓存和无损收藏。原有的 HTML/CSS 粉蓝圆角界面保留。**

### v5.0 的主要变化

- **歌词修复**：原版 Meting 参数 `type=lyric` 错误，已更换为 `type=lrc`。同时兼容网易云 JSON (`/lyric/new`、`/lyric`) 和 Meting 的纯文本 UTF-8 LRC。老版本缓存的“无歌词”结果会自动失效，修复后的失败结果仅缓存 10 分钟。歌词失败与音频下载是否成功互不影响。
- **在线试听更快**：优先获取较小的 128 kbps MP3（如不可用，尝试其他 MP3 码率），只缓存 MP3。首次试听仍需完整下载小文件后才开始播放；并非真正边下边播。原来保存的 FLAC 试听缓存不会继续用于新试听。
- **每周清理**：启动时检查距离上次自动清理是否超过 7 天；程序持续运行也会定期检查。仅清空试听缓存和临时歌词缓存，不删除正式下载、本地音乐或收藏。
- **收藏页面**：左侧新增“收藏”。在搜索结果点击爱心，会下载真正的无损 FLAC/WAV 到下载目录的 `收藏` 子目录，并尝试保存同名 `.lrc` 歌词。未获取到歌词时仍保留无损文件并可在收藏页重试；移出收藏只移除索引，不删除音乐文件。
- **音质隔离**：试听所用的小 MP3 不会被复用成无损收藏，也不会冒充“最高可用音质”的正式下载文件。
- **设置修复**：修复自定义 API 文本框的高度和设置卡片裁切问题，设置页面可以正常滚动。
- **离线歌词**：收藏音乐保存了 `.lrc` 后，收藏页播放时优先使用本地歌词，不再依赖每次在线获取。

升级：关闭桌面程序，将 `v5.0-upgrade` 里的文件覆盖原项目，再运行 `启动桌面版.bat`；如使用便携 EXE，必须再次运行 `构建Windows_EXE.bat` 构建 `dist\MusicDownloader-1.2.0-portable.exe`，旧版 EXE 不会自动更新。

**测试边界**：已使用模拟 API 验证 16 首歌词的 Meting 纯文本回退，以及音频/歌词隔离和收藏文件保护；未能在此环境验证真实网易云歌词在线接口和 Windows EXE。若你实际遇到某首无歌词，可使用 `python skill\scripts\music_skill.py lyric --id 歌曲ID --pretty` 查看返回的 `source`、`diagnostic`，便于定位第三方接口故障。

---

v4.0（Windows 版本号 1.1.0，以下为旧版记录）增加内置播放器、试听缓存和同步歌词，沿用已确认的粉蓝 UI。

这一版彻底弃用 Tkinter。UI 使用 **HTML、CSS、JavaScript + Electron**，Python 只作为后台命令行下载程序。你上传的 Q 版表情包是项目的 Windows ICO、Electron 窗口图标和左栏头像。

## 界面及操作

- 左侧：首页 / 本地 / 设置。
- 首页：输入歌名、歌手搜索；结果以粉蓝圆角阴影卡片排列。右侧按钮直接下载该首；勾选多首后可以批量下载。
- 右侧三角形图标：**在软件内试听**。初次播放先缓存完整音频，准备完成后自动开始；再次点击相同歌曲直接读取本地缓存。
- “导入歌单”：填网易云音乐歌单 URL 或数字 ID，先读取曲目，再选择下载。
- “本地”：显示已保存的音频，可直接点击「播放」试听本地文件；另可打开下载目录。
- “设置”：选择保存目录、最高可用音质/只接受无损/MP3、试听缓存上限（512 MB / 1 GB / 2 GB / 5 GB）、清除缓存、选填自定义 API。


## v4.0：试听缓存、内置播放器、歌词

- 点击搜索结果的三角形播放按钮，或者双击歌曲卡片，即可在软件内试听。**首次试听会先通过已有下载 API 获取完整音频并缓存，再播放；这不是逐字节即时流式播放。** 以后相同歌曲优先从缓存直接播放。
- 底部永久显示播放器：播放/暂停、时间轴拖动、音量和一行正在唱的歌词。右侧「词」按钮弹出软件内歌词窗，当前行自动高亮，点击歌词行可跳转。没有 LRC 时显示静态歌词或「暂无歌词」。
- 歌词从 `/lyric/new`、`/lyric` 等 API 获取，按歌曲 ID 独立缓存；支持中文 LRC 和翻译 LRC。同一歌曲 30 天内优先使用已缓存歌词，空歌词在 1 天后重试。**歌词能否获取取决于第三方 API。**
- 试听音频默认放在 Electron 用户数据目录的 `audio-cache` 中；与正式下载目录完全分开。在「设置」中查看音频缓存大小、修改容量上限，并点击「清除音频与歌词缓存」。不会删除「本地」页面里的正式音乐文件。单首曲目如果大于设定缓存上限，会保留正在播放的那一首，清掉较旧条目。
- 试听缓存保留真实格式（FLAC / MP3 / M4A 等），播放器依赖 Chromium 的解码能力。少数编码若不兼容会提示错误。**仍不支持 DRM 规避，会员/版权限制曲目无法保证试听。**
- Python Skill 新增 `lyric --id 123456` 命令，可直接获取 LRC 的 JSON 输出。

从 v3.2 升级到旧版 v4：可以覆盖原工程对应源码和脚本，原有 npm / Python 依赖不用重新下载。当前版本重新运行 `构建Windows_EXE.bat` 得到 `MusicDownloader-1.2.0-portable.exe`；旧的 1.0.0 EXE 不会自动更新。

## v3.1 批处理兼容性修复

已修复 v3 版本的 Windows CMD 批处理换行问题：所有 `.bat` 都采用 CRLF（UTF-8 无 BOM），避免出现 `'~dp0'、'errorlevel'、'npm'` 等命令被截断的报错。旧版的 `.bat` 不要继续使用。

`构建Windows_EXE.bat` 现在会检查 JavaScript 语法、构建退出码和最终 EXE 是否存在，**只有找到 EXE 且成功提取图标才会显示 `[OK]`**。验证脚本使用 UTF-8 BOM，兼容 Windows PowerShell 5.1 的中文路径和文件名。

## v3.2 Electron 下载失败修复（ECONNRESET）

如果看到 `node_modules\electron` / `node install.js` / `RequestError: read ECONNRESET`，说明 Electron 二进制程序下载中断。
**npm registry 与 Electron 二进制的下载源是两回事**：仅改 `npm config set registry` 不一定有用。

修复版 `安装依赖.bat` 会：

1. 检查 Python、Node.js。
2. 通过 `registry.npmmirror.com` 安装 npm 依赖，同时给 Electron 二进制指定 `npmmirror.com/mirrors/electron/`。
3. 失败后清理残留的 `node_modules\electron` 文件夹，再通过华为云镜像尝试一次。华为云版本目录不包含 `v`，所以设置了 `ELECTRON_CUSTOM_DIR={{ version }}`。
4. 只有确认 `node_modules\electron\dist\electron.exe` 以及 `electron-builder` 存在才显示 `[OK]`。

用户只需覆盖补丁文件后，重新运行 `安装依赖.bat`。**无需重复安装 Python，也无需清空整个 node_modules。** 构建脚本也会检查二进制文件是否存在，缺少时先执行安装程序，并给 electron-builder 设置额外的工具下载镜像。

国内镜像属于第三方分发服务，若网络仍无法连接镜像，脚本会报错而不是声称已成功。请确认实际访问权限，或换网络重试。

## Windows 首次运行

本项目需要 **Python 3.10+** 和 **Node.js 20+**。推荐官方 Windows Python，并勾选 Add Python to PATH。网络首次安装 Electron 依赖可能下载超过 100 MB。

1. 将 ZIP 解压到一个普通文件夹，不要直接在压缩包内部运行。
2. 双击 `安装依赖.bat`，它会安装 Python 的 `requests` 和 Electron 依赖。
3. 双击 `启动桌面版.bat`，进入桌面窗口。
4. 输入歌曲名，选中结果后下载。

此时运行的是 **Electron 开发模式**：`electron.exe` 的文件图标仍属于 Electron。这不是成品 EXE 的图标。若需要文件管理器中显示自己的表情包，必须完成下一节的构建。

## 生成有自定义图标的 Windows EXE

双击 `构建Windows_EXE.bat`。成功后得到：

`dist/MusicDownloader-1.2.0-portable.exe`

此 EXE 为 **Windows x64 便携版**，无需再安装 Node.js；由于下载核心仍是 Python，运行时电脑仍需有 Python 3.10+ 与 `requests`。

项目同时做了三层图标处理：

1. `package.json` 的 `build.win.icon` 指向 `assets/app.ico`，**在构建期间将图标写入 EXE 的 Windows 图标资源**。
2. Electron 窗口的 `BrowserWindow.icon` 使用同一个 ICO；打包时 ICO 复制到 `resources/app.ico`。
3. Windows AppUserModelID 与窗口 `setAppDetails` 一起指定，避免沿用 Python/Electron 的任务栏标识。

构建脚本会调用 `验证EXE图标.ps1`，从生成的 EXE 里实际提取图标为 `dist/EXE实际图标.png`。请打开它确认是不是你上传的 Q 版表情包。注意：**任务栏固定过的旧 Python 或 Electron 快捷方式仍可能继续引用旧图标，请取消旧固定项并重新固定新 EXE**；Windows 图标缓存可能延迟刷新。

未签名的自行构建 EXE 可能触发 Windows SmartScreen 提示；该程序没有代码签名证书。

## AI Skill

将 `skill` 文件夹复制到 AI Agent 的 Skills 目录，重命名为 `netease-music-downloader` 即可。它包含 `SKILL.md` 和可直接使用的 Python CLI。这与桌面应用调用的是同一份 `skill/scripts/music_skill.py` 代码。

## 开发与验证

目录结构：

```
app/index.html          网页 UI 主结构
app/style.css           粉蓝色主题、圆角与阴影、播放器材质
app/lrc.js               LRC 解析器：时间轴、翻译、offset
app/renderer.js         搜索/选择/下载、播放器与同步歌词
main.js                 Electron 主进程/安全 IPC/Python 子进程/音频缓存/媒体协议
preload.js              仅暴露必要的受控接口
assets/app.ico          Windows 7 种尺寸的表情包程序图标
assets/avatar.png       参考图风格的左侧头像
skill/scripts/music_skill.py   原 Python 下载核心
```

在有 Node.js 的环境执行 `npm run check` 可以检测 JS 语法。在已经安装 pytest、requests 的环境下运行 `PYTHONPATH=skill/scripts python -m pytest -q tests/test_music_skill.py tests/test_integration_cli.py`（Windows 可省略 PYTHONPATH，或设置相应环境变量）。`node --test tests/test_backend_bridge.js tests/test_ui_structure.js` 验证 Electron IPC 与 Python CLI 对接（桥接测试需要当前环境存在 `/opt/pyvenv/bin/python`，Windows 请先通过 `MUSIC_PYTHON_EXE` 指定你的 Python 可执行文件）。

## 限制

搜索和下载仍依赖旧项目使用的第三方网易云音乐 API。真实服务状态、会员权限和实际可下载的音质不能从模拟测试推断出来。程序不会破解 DRM，也不能保证受限制曲目可用。这一版已完成源代码和模拟 API 的联调，**尚未在本环境生成 Windows EXE，也尚未在真实 Windows 上验证任务栏图标**。

## v2.0.1 图标替换

EXE 应用图标和侧栏头像均已换成新的「我…我的钱」表情包，旧图标不再包含在这两个资源文件中。若 Windows 任务栏仍显示旧图标，请取消固定旧快捷方式，重新固定新版 EXE。

**诊断日志**：保存在程序用户数据目录 `logs/application.log`，超过约 2 MB 自动轮换。运行日志避免记录完整 API URL 和 Cookie。如需排查，请自行检查日志中是否有个人信息再分享。
