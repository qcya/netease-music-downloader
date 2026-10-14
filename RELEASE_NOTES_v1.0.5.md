# 音乐下载器 v1.0.5 · 启动与退出紧急修复

Windows 10/11 64 位免安装便携 EXE。

## 修复内容

- 修复部分 Windows 电脑上双击新版 EXE 后没有窗口、任务栏和反馈的问题。现在主窗口在网页加载完成时也会显示，不再仅依赖窗口的 `ready-to-show` 事件。
- 若界面文件损坏、渲染进程失败或加载超时，显示明确的启动失败信息，并写入用户数据目录下的 `logs/application.log`，避免悄悄留在后台。
- 关闭主窗口时同步关闭隐藏的桌面歌词窗口、迷你播放器和仍在运行的下载后端子进程，确保退出后能够替换 EXE 文件。
- 避免重复运行：再次双击正在运行的应用时激活已有窗口。
- GitHub Windows 构建首次增加打包 EXE 实际启动、窗口可见性和发送关闭消息后的进程退出检查；通过后才公开发布。

## 使用说明

如果旧版本在任务栏消失后仍占用 EXE，可先退出或在 PowerShell 执行：

```powershell
Get-Process MusicDownloader -ErrorAction SilentlyContinue | Stop-Process -Force
```

强制结束将中断当前下载，但不会主动删除已下载文件。然后下载并运行 `MusicDownloader-1.0.5-portable.exe`。

已有歌曲、下载目录、歌单和个性化设置继续沿用，不需要重新下载音乐。