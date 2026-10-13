---
name: netease-music-downloader
description: 搜索网易云音乐并下载用户指定的歌曲或整份歌单的 Agent Skill。Use when the user asks to search 网易云/NetEase Cloud Music, download a song, select one or more songs from search results, or batch-download a playlist. Return numbered candidates for ambiguous searches; auto-download only when exactly one result is found. Prefer the highest accessible original audio quality without transcoding or bypassing access controls.
compatibility: Windows/Linux/macOS; Python 3.10+, requests; outbound HTTPS required; for Codex, Claude Code, and other Agent Skills-capable assistants.
metadata:
  version: "1.0.0"
---

# 网易云音乐搜索与下载

把此目录当作完整 Skill 使用。**直接运行 `scripts/music_skill.py`** 执行实际工作；禁止凭空编造搜索结果、下载链接、音质和下载完成状态。脚本会在标准输出给出**单个 JSON 对象**，`ok` 和 `results` 是执行依据。

## 准备

在本 Skill 目录下执行一次：

```powershell
python -m pip install -r requirements.txt
python scripts/music_skill.py doctor
```

如 Python 命令不存在，Windows 可使用 `py -3.10`。在无法访问网易云或第三方 API 的沙盒中，不要声称已实际下载；请解释网络/权限限制，并让有网络权限的本地 Agent 执行。

## 工作流程（必须遵守）

### 1. 用户给出搜索关键词

```bash
python scripts/music_skill.py search --query "搜索词" --limit 15 --auto-single
```

- **仅有一个结果**：`auto_download` 字段会直接尝试下载。若失败，告诉用户真实错误原因；若成功，提供绝对文件路径、格式与文件实测元数据。
- **有多个结果**：**不要自动下载第一个**。根据 JSON `results` 按 `index` 展示「序号、歌曲名、歌手、专辑（如果有）」；等待用户选择 **一个或多个** 编号。
- **没有结果**：询问是否调整关键词或翻页，绝对不要用相似歌曲替代后直接下载。
- 如果搜索总数超过返回数，可加 `--page 2` 分页；记住搜索会覆盖本地 `last_search.json`，在展示的结果和用户选择之间不要再次搜索并覆盖它。需要保留之前某次搜索，可复制 `saved_state` 文件，并让 `select` 使用 `--from-file` 指定。
- 如果用户明确给出**准确歌曲 ID** 或单曲链接，跳过搜索直接 `download`。

### 2. 用户选择编号，例如「第 2 和第 5 首」

```bash
python scripts/music_skill.py select --indices "2,5"
```

允许 `1,3-5`，`select` 从最近一次真实搜索记录读取 ID，不基于文本猜 ID。也可先 `select --indices "1,3" --dry-run` 检查。根据下载结果反馈成功/失败每一首，不能将 `failed_count > 0` 的任务报告为全部完成。

### 3. 用户给出单曲 URL 或 ID

```bash
python scripts/music_skill.py download --id "https://music.163.com/#/song?id=33894312"
python scripts/music_skill.py download --id 33894312 --id 416892104
```

### 4. 用户给出歌单链接 / 数字 ID

**先预览**（不触发下载）：

```bash
python scripts/music_skill.py playlist --id "https://music.163.com/#/playlist?id=2619366284"
```

当用户明确要求下载该歌单（不只是问“这个歌单有哪些歌”）时，再执行：

```bash
python scripts/music_skill.py playlist-download --id 2619366284 --yes
```

默认尝试**整份歌单**。可加 `--limit 10` 只下载前 10 首。读取结果里的 `possibly_incomplete=true` 表示接口可能只提供部分曲目，务必说明，不得声称已拿到完整歌单。

## 音质策略

默认 `--quality best`：依次尝试服务端提供的母带、Hi-Res、FLAC 无损，然后才尝试较高码率 MP3 / 其他有效音频。保存**实际返回的格式**，绝不将 MP3 改后缀伪装成 FLAC，也不会转码放大。尝试最高可用不代表必然能够拿到母带/无损音源。

- `--quality lossless`：仅接受实际 WAV/FLAC；不可用则报错，不偷偷降为 MP3。
- `--quality mp3`：仅接受实际 MP3，尝试 320 → 192 → 128 kbps 等服务端候选；真实码率按文件可解析信息报告。
- 用户如果已合法拥有会员访问权限，可在**用户自己的本地运行环境**配置 `NETEASE_MUSIC_U`，但客户端**不会把 Cookie 发给默认的第三方公共 API**。仅发送给 localhost 或用户通过 `NETEASE_TRUSTED_COOKIE_HOST` 明确信任的自建主机；绝不让用户把 Cookie 发在聊天中，不打印/泄露/落盘。服务端和版权方决定可用性，不绕过 DRM 或会员权限。
- 接口音质参数只是**申请的档位**，成品可用的 `format`、`quality_metadata` 才是可以报告的实测信息。

## 输出位置与出错处理

默认输出：`~/Music/NeteaseDownloads/`（Windows 通常在用户目录的 `Music\NeteaseDownloads`）。可指定 `--out "D:\\Music"`。文件名包含歌曲 ID，用于区分同名歌曲；已存在默认跳过，`--overwrite` 才会重新下载。

出现 `ok:false`、空列表、非音频响应、访问限制或 API 超时：如实说明，无需反复猜测原因。建议先执行 `doctor`，或以 `--api-base https://你的自建API域名` 配置基于 NeteaseCloudMusicApi 的服务端（参数需要放在子命令**之前**）。批量下载需要 `--yes`；不要未经用户授权大规模下载。

更多命令、接口优先级、环境变量见 [接口和使用说明](references/REFERENCE.md)。
