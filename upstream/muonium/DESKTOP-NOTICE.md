# 桌面移植说明

上游：[MuoniumPlayer-multiversion](https://github.com/zihe114514/MuoniumPlayer-multiversion)，提交 `9b4cc7e7bd143315da716075a6d024a0d4c0c81b`，Apache-2.0，完整许可与原始声明见 LICENSE、NOTICE。

`src/com/muoniumplayer/core/music/source`、`ncm` 和 JSON 工具来自该提交；CloudMusicApi 的全部 78 个公开方法编译到桌面后端。`DesktopWorker.java` 为桌面 JSON 管道适配器；DeviceIdGenerator 为随机设备标识适配器，不读取硬件标识。桌面白名单来自 `endpoints.json`。方法被编译、可调用，不代表所有账号写入操作都已实机验证。

原版 Minecraft/Skija 界面源码保存在 app/vendor/muonium 作来源记录，Electron 并不执行 Java 界面。桌面布局按原布局公式适配，歌词仍使用本项目实现。没有将原版的其他音乐平台或 Minecraft 依赖打包为功能。

运行依赖：Gson 2.11.0（Apache-2.0）、Apache Commons Lang 3.18.0（Apache-2.0）；各 JAR 的 META-INF 保留许可声明。Lombok 1.18.42（MIT）只参与编译，不作为运行依赖分发。三个构建输入的 SHA-256 在 scripts/build_muonium_backend.py 校验。裁剪的 Java 运行环境保留 runtime/legal 中的原许可证。

登录凭据只经主进程传给官方接口；账号权限、会员与地区限制仍适用。公开页面的匿名查询已测试，私人歌单、云盘、收藏及一起听等账号操作需实际账号验证。
