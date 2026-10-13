# GitHub 上传说明

当前版本：v5.1 / Electron 1.3.0。仓库建议地址：`https://github.com/qcya/netease-music-downloader`。

**仓库尚未创建时**，在 Windows 上解压本文件夹，双击 **`一键创建并上传GitHub.bat`**。脚本会检查 Git 和 GitHub CLI (`gh`)，必要时提示安装命令，并引导你在浏览器登录 GitHub。它会在你的 `qcya` 账号下创建 **Private 私有仓库**，提交源码并推送 `main` 分支。执行成功后才会显示 GitHub 地址。

如需手动先安装工具，在 Windows 命令行运行：

```powershell
winget install --id Git.Git --exact
winget install --id GitHub.cli --exact
```

安装后重新打开命令行或双击上传脚本。登录 GitHub 时须核对当前账号为 `qcya`。

`node_modules`、`dist`、下载音乐、缓存、私有配置不会随仓库上传；项目不包含歌曲版权内容，也没有选择开源许可证。若以后要公开仓库，请先自行确认资源图标及代码的再分发权限。

注意：这个脚本不能在 ChatGPT 的容器里代表你登录 GitHub；需要在你的 Windows 电脑执行。仓库创建前，`https://github.com/qcya/netease-music-downloader` 只是计划地址，不保证可以打开。
