# 开发与验证

当前源码：2.0.0-preview.12。界面由屏幕顶部悬绳、下拉播放器、独立全屏歌词和可选桌面歌词组成。音频始终由下拉播放器的一个 `audio` 元素持有，收起或关闭全屏歌词不停止播放。

## 主要模块

- `top_panel.js`、`app/charm.*`：屏幕顶部定位、横移、下拉、GPU 位移动画、调节高度与布局持久化。
- `app/panel.*`、`app/panel_player.js`：我的歌单、发现、搜索、下载任务、播放状态与队列。播放器处理异步解析取消和不可用歌曲跳过。
- `user_playlists.js`：本地歌单引用、兼容旧歌单迁移、复制/移动/合并/排序；音频文件与歌单引用分离。只有用户明确确认的删除调用系统回收站。
- `app/playlist_selection.js`：Ctrl/Shift 选择、空白区域框选、右键菜单与拖动；`app/track_order.js` 稳定地把已知不可播放条目放在当前页末尾。
- `popular_playlists.js`、`playlist_reader.js`：网易云公开热门歌单、刷新换批和歌单目录分页；歌单与搜索每页展示八首歌曲。手动输入的歌单仍由配置的接口读取，取得歌曲后在本地分页；列表服务的运行时缓存与网络失败状态分开处理。
- `local_covers.js`、`skill/scripts/music_skill.py`：批量读取本地嵌入封面，之后按 ID 或严格的歌名和歌手匹配远程封面。失败或无法唯一确认时使用默认图标。
- `floating_window.js`、`app/floating-lyrics.*`：可选桌面悬浮歌词，沿用原始发光样式及位置、锁定偏好；启用和重开时推送当前行。`fullscreen_player.js`、`app/fullscreen.*` 负责无边框全屏显示及控制，不创建第二个音频实例。
- `online_media.js`、`music_providers.js`、`source_availability.js`：在线地址解析、权限状态和流式预览。未知或网络错误不等同于不可播放；试听片段单独标识。
- `netease_account.js`、`netease_api_client.js`、`netease_api_worker.js`：本机网页或扫码登录、系统加密凭据和账号音源查询；凭据仅限可信链路，不发给公共第三方接口。网页登录方式以网易云官网实际支持为准，登录只用于在线播放。
- `download_queue.js`、`skill/`：下载任务和 Python 后端，尽量请求较高质量但依服务响应及权限而定；不保证无损。

歌单数据和窗口布局存储在用户数据目录；文件本身位于用户选择的音乐目录。旧版 `[歌单] ` 前缀可读取和迁移。常规歌单整理只改变引用，不更名或删除音频。

## 本地验证

```powershell
npm run check
$env:MUSIC_PYTHON_EXE = (py -3.12 -c 'import sys;print(sys.executable)')
npm test
py -3.12 -m pytest -q tests
.\node_modules\.bin\electron.cmd scripts/verify_top_panel.js
.\node_modules\.bin\electron.cmd scripts/verify_discovery_panel.js
.\node_modules\.bin\electron.cmd scripts/verify_lyrics_transition.js
npm run build:win
```

`verify_top_panel.js` 使用隔离的 `.validation/` 音频夹具，覆盖挂件、歌单手势、桌面和全屏歌词、封面、文件保留以及测试文件进入回收站。`verify_discovery_panel.js` 使用确定性的元数据与本地 HTTP 音频，验证热门歌单、刷新、跨页播放和两种列表的页内排序。`verify_lyrics_transition.js` 检查切歌时旧歌词不会继续显示。这些 Electron 验证脚本应串行运行。`scripts/check_packaged_panel.js` 面向已启动的便携 EXE，用本地 HTTP 夹具验证内置后端、搜索、播放、下载、歌词和窗口操作；CI 展示启动方式。

自动测试不代表全部网络服务、音源、DPI 和多显示器组合都已覆盖；Windows 版本的系统窗口行为仍需在目标机器验证。
