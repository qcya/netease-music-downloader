# Discovery and Stability Implementation Plan

> Execute inline with test-driven-development and executing-plans.

**Goal:** 稳定歌单核心并让主页成为可发现新音乐的入口。
**Architecture:** 保留界面技术栈；新增独立持久化、队列协调、推荐服务与推荐 UI 模块，旧接口保持兼容。
**Tech Stack:** Electron 37.3.1 / Node 22 / Python 3.11 / 原生 DOM。
**Spec:** docs/superpowers/specs/2026-10-19-discovery-stability.md

## Global Constraints
四项导航、粉蓝样式、默认仅首次关闭、[歌单] 前缀、便携单 EXE；推荐无登录、无凭证转发、无假歌曲；网络异常不阻塞本地播放。

## Tasks
- [x] 1. 写持久化、分类原子排序、队列协调和旧目录访问失败测试；实现 durable_json.js / library_roots.js / app/playlist_queue.js；接入主程序并回归。
- [x] 2. 写公开推荐响应解析、每日抽样、缓存回退、去重/换批失败测试；实现 discovery_service.js 及窄接口 IPC（元数据请求使用 Electron net.fetch，无需启动 Python）。
- [x] 3. 实现主页卡片、分类标签、换批、下载并播放、本地随机；复用原歌曲列表与下载流程；测试点击链路和空/失败状态。
- [x] 4. 分批列表、本地筛选、分类折叠、可见队列、焦点/背景行为；避免设置重置；测试。
- [ ] 5. 新旧回归、浏览器截图、Windows 包后测试、版本与构建识别，发布 v1.1.0。

## Review Focus
过期网络结果覆盖新标签；超时导致 UI 永久 disabled；跨目录同名歌曲不能悄悄播错；损坏文件不能覆盖；随机抽样不能宣称实际可下载性；旧设置不重置。

## Ledger
2026-10-19：main=1387ca5。已获执行批准，隔离分支 feat/discovery-stability-v1.1.0。容器无法联网克隆，经 GitHub Actions 下载精确源码。没有修改原用户数据。
Ruling: 保留旧的文件名内部接口，以持久化目录集合和同名冲突显式拒绝过渡；稳定 UUID 全库迁移留在后续，避免本轮与推荐功能一起高风险改库。

已完成本地 RED→GREEN：持久化与数据形状、分类原子排序、队列隔离、旧目录、大列表、推荐每日稳定/去重/离线/不可信输入/并发/旧请求缓存覆盖。浏览器注入测试桥的交互验收通过，包括 1205 行、三个窗口尺寸、无自动下载、推荐与歌单操作。
Ruling: 推荐元数据使用 Electron net.fetch 独立服务，不增加 Python discover 子命令；音频下载仍复用 Python 原有完整下载，减少初始化进程和重复协议。
待验证：完整 GitHub Python3.11 回归与最终 Windows EXE 鼠标、键盘、IPC、合成音频下载解码、离线缓存测试；最终报告以流水线结果为准。容器内旧有后端集成用例也会挂起，不将其当作通过。
