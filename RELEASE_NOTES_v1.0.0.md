# 音乐下载器 v1.0.0

首个正式版本，提供 Windows 64 位单文件便携版。

## 主要功能

- 音乐搜索、单曲下载、批量下载和下载任务管理。
- 下载文件的音质信息与下载结果提示。
- 本地音乐播放、收藏和自建歌单。
- 双语歌词、逐句点击跳转、平滑浏览和拖动进度条。
- 沉浸式播放界面，内置 1080p 动态背景，支持更换。
- 可选桌面悬浮歌词，默认关闭，支持白色柔光、拖动及锁定后鼠标穿透。

## 下载使用

下载 **MusicDownloader-1.0.0-portable.exe**，在 Windows 10/11 x64 上双击运行，无需单独安装 Node.js 或 Python。

便携版是免安装程序，歌曲和个人设置保存在各自的下载目录及用户数据目录中。

## 校验下载文件

发布页面同时提供 **MusicDownloader-1.0.0-portable.exe.sha256**。可用 PowerShell 执行：

```powershell
(Get-FileHash .\MusicDownloader-1.0.0-portable.exe -Algorithm SHA256).Hash
```

将结果与 SHA-256 文件中的值核对。

程序未使用商业代码签名证书，因此 Windows 可能提示未知发布者。请认准本项目的 GitHub Releases 页面。使用下载内容时请遵守相关版权规定。
