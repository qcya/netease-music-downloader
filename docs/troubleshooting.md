# 故障排查

## 启动后找不到大窗口

2.0 已移除旧主界面。屏幕顶部偏右是悬绳挂件，向下拉或点击即可展开。系统托盘双击也能展开；再次启动程序会唤出已有面板。

## 如何调整长度和位置

拖底边双横线调整长度，顶部“星轨”文字区域左右移动。长度受屏幕工作区限制，连接或移除显示器后自动回到可见区域。位置记录位于用户数据目录的 panel-layout.json。

## 收起后还有声音

这是后台播放。设置底部或系统托盘菜单的“退出”才会停止播放并结束程序。

## 没有毛玻璃

系统 Acrylic 需要 Windows 11 22H2 或更新版本，以及系统开启透明效果。不满足时显示深色面板，不影响播放和下拉。开发依据：[Electron 背景材质说明](https://www.electronjs.org/docs/latest/api/base-window#winsetbackgroundmaterialmaterial-windows)。

## 有的歌不能预览

点歌曲会重新解析音源；网络失败、版权、会员、地区限制均可能导致不可播放。提供歌名或 ID、时间及错误提示有助于复现，不要提供登录 Cookie。片段会标“试听片段”，不会冒充完整版。流式播放与下载是不同链路。

## 新发现无结果

这里只接受近一年且有真实发行日期的歌曲。接口不可用时显示缓存状态或空结果，不混入老歌。点击刷新重载列表；设置中的自定义接口应实际支持对应 API。

## 本地音乐或歌单

导入会复制文件，不移动原文件。歌单沿用旧版的 `[歌单] ` 文件名前缀，加入或移出时音频及同名歌词会同步改名。不同音乐目录存在同名冲突时，不会擅自选择或覆盖；请先在资源管理器中区分文件名。

## 日志和开发验证

用户数据目录通常为 `%APPDATA%/netease-music-desktop-electron`；日志为 `logs/application.log`。

```powershell
npm run check
npm test
py -3.12 -m pytest -q tests
node scripts/check_recent_online.js
```

Windows 交互测试通过 Electron 运行 `scripts/verify_top_panel.js`，会建立独立 `.validation/` 数据目录和静音 WAV，不操作日常音乐库。打包验收通过 `scripts/check_packaged_panel.js` 使用本地测试服务验证 EXE 内置后端；详见 CI 文件。
