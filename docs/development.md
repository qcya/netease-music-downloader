# 开发与验证

当前源码：2.2.0-preview.7（本地预览）。界面由 INS 透明覆盖层、窗口内原生毛玻璃、全屏歌词和可选桌面歌词组成。默认启动不创建界面或接口子进程。音频始终由主播放器的一个 `audio` 元素持有，收起或关闭全屏歌词不停止播放。

## 主要模块

- `desktop_overlay.js`：INS 显隐、窗口内原生毛玻璃、自由拖动与双轴缩放、布局持久化。`startup_settings.js`：用户选择开启的静默自启动。隐藏且未播放时节流渲染、暂停动画，并在 30 秒后释放空闲 API 子进程。
- `app/panel.*`、`app/panel_player.js`：我的歌单、发现、搜索、下载任务、播放状态与队列。播放器处理异步解析取消和不可用歌曲跳过。
- `user_playlists.js`：本地歌单引用、兼容旧歌单迁移、复制/移动/合并/排序；音频文件与歌单引用分离。只有用户明确确认的删除调用系统回收站。
- `app/playlist_selection.js`：Ctrl/Shift 选择、空白区域框选、右键菜单与拖动；`app/track_order.js` 稳定地把已知不可播放条目放在当前页末尾。
- `popular_playlists.js`、`playlist_reader.js`：网易云公开热门歌单、刷新换批和歌单目录分页；歌单与搜索每页展示八首歌曲。手动输入的歌单仍由配置的接口读取，取得歌曲后在本地分页；列表服务的运行时缓存与网络失败状态分开处理。
- `local_covers.js`、`skill/scripts/music_skill.py`：批量读取本地嵌入封面，之后按 ID 或严格的歌名和歌手匹配远程封面。失败或无法唯一确认时使用默认图标。
- `floating_window.js`、`app/floating-lyrics.*`：可选桌面悬浮歌词，沿用原始发光样式及位置、锁定偏好；启用和重开时推送当前行。`fullscreen_player.js`、`app/fullscreen.*` 负责无边框全屏显示及控制，不创建第二个音频实例。
- `online_media.js`、`music_providers.js`、`source_availability.js`：在线地址解析、权限状态和流式预览。未知或网络错误不等同于不可播放；试听片段单独标识。
- `download_queue.js`、`skill/`：下载任务和 Python 后端，尽量请求较高质量但依服务响应及权限而定；不保证无损。

歌单数据和窗口布局存储在用户数据目录；文件本身位于用户选择的音乐目录。旧版 `[歌单] ` 前缀可读取和迁移。常规歌单整理只改变引用，不更名或删除音频。

## 本地验证

```powershell
npm run check
$env:MUSIC_PYTHON_EXE = (py -3.12 -c 'import sys;print(sys.executable)')
npm test
py -3.12 -m pytest -q tests
.\node_modules\.bin\electron.cmd scripts/verify_overlay_runtime.js
.\node_modules\.bin\electron.cmd scripts/verify_netease_hub.js
.\node_modules\.bin\electron.cmd scripts/verify_account_panel.js
npm run build:win
```

`verify_overlay_runtime.js` 检查静默启动零窗口、零接口子进程、INS 按需初始化、原生材质释放和隐藏后音频继续。`verify_netease_hub.js` 联网检查原版 Java 热搜、榜单和搜索。`verify_account_panel.js` 使用模拟远程响应与真实 Electron IPC、系统加密存储，验证取消、登录、播放和退出；不代表真实账号写入功能全部验证。Electron 集成脚本应串行运行。

自动测试不代表全部网络服务、音源、DPI 和多显示器组合都已覆盖；Windows 版本的系统窗口行为仍需在目标机器验证。

## 原版坐标验证

`app/restored-player.js` 与 `app/restored-player.css` 按原项目逻辑单位换算到桌面窗口；参考截图面板 1670×912 时，一个逻辑单位约为两个像素。`scripts/verify_muonium_layout.js` 用可重复数据核对侧栏、搜索、封面、播放歌单按钮、列表与底栏的坐标，允许边框与小数像素导致的 2 像素误差，同时验证图标字体与主题文件实际加载。该验证不等于所有动态画面都已像素级比较。

`scripts/import_muonium_ui_assets.py <上游检出目录>` 复制原始资源并记录 SHA-256；构建直接使用已检入的资源，不依赖开发者的临时目录。
