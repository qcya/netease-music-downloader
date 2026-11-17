# 开发与验证

当前版本 3.0.6，Windows Electron 桌面播放器。INS 和右上角关闭只最小化；音频始终由主播放器唯一的 audio 元素持有。未播放且隐藏时不加载模型。后台启动显示短暂通知，关闭后销毁该渲染器。

## 架构

- `desktop_overlay.js` 管理显隐、自由拖动与缩放；`window_stack.js` 用 Windows DeferWindowPos 批量移动前景和模糊层。普通移动只改位置，不发送未变化的布局；跨屏 DPI 或尺寸变化交给 Electron 完整更新。
- `native_glass.js` 关闭系统外框；`native_blur.js` 与 `native/neutral_composition.cpp` 提供独立无染色模糊。圆角共用 `app/window-shape.js`，前景保持完整不透明。
- `app/panel.*`、`app/restored-player.*`、`app/netease-hub.js` 是主页、网易云歌单、设置和本地下载界面；`app/player-controls.js` 管理播放按钮和粉色音量进度。
- `app/fullscreen.*`、`app/karaoke-lyrics.*` 显示完整双语歌词并逐渐点亮；`app/floating-lyrics.*`、`app/word-lyrics.js` 用于桌面逐字字幕。
- `lyric_alignment.js` 调度离线对齐；`lyric_model/align.py` 以实际音频对齐已有歌词。优先 YRC，失败保留原始歌词，不均分字数冒充识别。
- `netease_service.js`、`muonium_api_client.js` 和 `upstream/muonium/` 提供网易云调用。Node/JVM 共用 endpoints.json 白名单，账号凭据留在主进程。
- `portable_storage.js` 管理便携资料；下载和缓存目录可见，其余持久化资料位于 data、playlists。删除缓存不影响下载、账号及设置。

## 构建

需要 Node.js 22+、Python 3.12、JDK 25，以及 Visual Studio C++ 工具和含 C++/WinRT 的 Windows SDK。

```powershell
npm ci
py -3.12 -m pip install -r skill/requirements.txt -r skill/requirements-build.txt pytest
npm run check
npm test
py -3.12 -m pytest -q tests
npm run build:win
```

构建脚本生成后端和本机 DLL，下载固定修订与哈希的多语言模型，最终生成文件夹 ZIP。用户无需安装 Node、Python 或 Java。node_modules、backend、build、dist 和 .validation 均是可重新生成的本地输出，不提交到 Git。

## 验证

Electron 脚本串行、隐藏运行，使用独立资料目录，不读取真实账号、不执行真实云端写操作。`verify_cloud_controls.js` 验证喜欢、取消收藏、自建歌单删除确认与失败回退；`verify_drag_performance.js` 检查批量移动与两层对齐；`verify_classic_fullscreen.js` 和 `verify_translation_captions.js` 分别验证全屏点亮和桌面逐字；`verify_reference_package.js` 在实际发行 EXE 上验证播放、音质、歌词、资料持久化及清缓存后重启。

隐藏调用耗时和截图不代表实际显示帧率；多显示器混合 DPI 与桌面合成仍需目标机器验收。上游 UI 参考与许可位于 `upstream/muonium/ui-reference/`，不打入运行包。
