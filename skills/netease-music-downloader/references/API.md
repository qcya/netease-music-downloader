# 本机 Agent HTTP API

这是播放器随包下载后端的可选入口。正常搜索和下载优先用 `agent.cmd` 命令；HTTP 服务仅在调用工具明确需要 HTTP 时临时启动。

## 启动与连接

在解压后的播放器包根目录运行：

```powershell
.\agent.cmd serve --port 0
```

`0` 让 Windows 选取空闲端口。进程前台运行，启动时只输出 URL、端口和连接文件路径，不把令牌打印到终端。默认连接文件是 `缓存/agent/agent-api/connection.json`，其中含短期随机令牌；Agent 读取该文件获取 `url` 与 `token`，通过 `Authorization: Bearer <token>` 鉴权。服务只监听 IPv4 回环 `127.0.0.1`，校验 `Host` 与 `Origin`，不开放 CORS，也不接受客户端传入下载路径或上游 API 地址。空闲 300 秒自动退出；也可调用 `POST /shutdown` 立即退出。播放器启动时不会自动启动此服务。

调用 API 时使用 JSON 请求体，并保留原始工具调用的用户确认边界。搜索本身从不自动下载。

## 路由

| 方法和路径 | JSON 请求体 | 用途 |
|---|---|---|
| `GET /health` | — | 返回服务状态与可用命令 |
| `POST /search` | `{"query":"歌名 歌手","limit":15,"page":1}` | 搜索，只返回候选；`limit` 为 1–50 |
| `POST /song` | `{"id":"33894312"}` | 查询单曲信息 |
| `POST /lyric` | `{"id":"33894312"}` | 查询同步歌词 |
| `POST /playlist` | `{"id":"2619366284","limit":0}` | 预览歌单，不下载；0 表示服务默认完整查询 |
| `POST /download` | `{"ids":["33894312"],"quality":"best"}` | 下载 1–20 首指定歌曲 |
| `POST /playlist-download` | `{"id":"2619366284","confirm":true,"quality":"best","allow_partial":false,"limit":0}` | 明确确认后批量下载歌单 |
| `POST /select` | `{"indices":"1,3","quality":"best"}` | 下载最近一次搜索中的选中结果 |
| `POST /shutdown` | `{}` | 关闭服务并删除本次连接文件 |

质量可选 `best`、`lossless`、`mp3`、`preview`。`/playlist-download` 必须显式提供 `confirm: true`；服务返回后端实际 JSON，不伪造格式或成功状态。所有下载只能落在包内 `下载/`。

## PowerShell 示例

另开一个终端，用启动命令回显的连接文件路径替换示例路径：

```powershell
$conn = Get-Content -Raw -Encoding UTF8 '.\缓存\agent\agent-api\connection.json' | ConvertFrom-Json
$headers = @{ Authorization = "Bearer $($conn.token)" }
Invoke-RestMethod -Uri "$($conn.url)/search" -Method Post -Headers $headers `
  -ContentType 'application/json; charset=utf-8' `
  -Body ([ordered]@{ query = 'yellow 神山羊'; limit = 10; page = 1 } | ConvertTo-Json -Compress)
```

按搜索结果确认具体 ID 后再调用 `/download`。令牌相当于本机临时凭证：不把它贴入聊天、写入仓库或转发到其他机器；服务没有公网监听，也不应使用端口转发。
