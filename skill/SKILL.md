---
name: netease-music-downloader
description: Use the NetEase music search and download capability shipped with the player package. The package-root skill is the canonical Agent entry.
metadata:
  short-description: Packaged music backend entry
---

# 随包音乐后端

此目录保存 Python 后端源码和构建依赖，发行版会把它打包到 `resources/skill/`。Agent 的正式入口在包根目录 `skills/netease-music-downloader/SKILL.md`；先按该说明调用根目录的 `agent.cmd`，不要在发行包里要求用户安装 Python 或 pip 包。

源码仓库尚未构建时，开发人员可以在仓库根目录按 `README.md` 的构建说明生成随包 EXE。运行时 CLI 参数和 API 适配由 `scripts/music_skill.py`、`scripts/agent_api.py` 实现；改动它们时同步维护根目录技能与 `skills/netease-music-downloader/references/API.md`。
