# 接口与脚本说明

## 背景

从用户提供的 `music-crawler-main.zip` 重构：旧版本只有排行榜 GUI/CLI，依赖 `apis.netstart.cn/music` 返回榜单、`api.qijieya.cn/meting` 返回音频。新版本保留网易云下载思想，改为 AI 友好的参数化 JSON CLI；不调用原版 GUI。原版下载器将 `Content-Length: 0/缺失` 判为 VIP、固定 `.mp3` 后缀等问题已改为格式识别与流式下载。

## API 来源与优先级

默认主站：`https://musicapi.qijieya.cn`；回退老站：`https://api.qijieya.cn`。

按脚本可用性依次使用：

- 搜索：`GET /search?keywords=关键词&limit=N&offset=O`，后备 `GET /meting/?type=search&id=关键词&limit=N&page=P`。
- 歌单：`GET /playlist/track/all?id=数字&limit=N&offset=O`（分页），然后尝试 `/playlist/detail` + `/song/detail`，再后备 `/meting/?type=playlist&id=数字`。响应总数不可知时将可能不完整字段设为 true。
- 单曲资料：`GET /song/detail?ids=ID`，后备 `/meting/?type=song&id=ID`。
- 音频：优先 `/song/url/v1?id=ID&level=jymaster|hires|lossless|exhigh|higher|standard`；Meting 兼容 `/meting/?type=url&id=ID&br=2000|320|192|128`。

第三方 API 可能停止服务、要求 Cookie、对地域/IP 限制；API 主页能打开并不能证明某首歌一定能下载。若这些服务器不可靠，请用户自行部署可信服务端，通过 `--api-base` 或环境变量 `NETEASE_API_BASE_URL` 修改，而不是修改脚本核心代码。

## 接口举例

```bash
python scripts/music_skill.py doctor
python scripts/music_skill.py search -q "小幸运" --limit 20 --auto-single
python scripts/music_skill.py select --indices "2,4-6" --out "D:\Music" --quality best
python scripts/music_skill.py select --indices "2" --dry-run
python scripts/music_skill.py song --id 33894312
python scripts/music_skill.py download --id 33894312 --quality lossless
python scripts/music_skill.py playlist --id 2619366284 --limit 30
python scripts/music_skill.py playlist-download --id 2619366284 --yes --limit 30
python scripts/music_skill.py --api-base https://your-api.example.org doctor
python scripts/music_skill.py --pretty search -q "晴天"
```

Windows PowerShell 如需设置环境变量：

```powershell
$env:NETEASE_DOWNLOAD_DIR = 'D:\Music'
$env:NETEASE_API_BASE_URL = 'https://musicapi.qijieya.cn,https://api.qijieya.cn'
# 如果用户账户允许，并自行在本机安全配置：
# $env:NETEASE_MUSIC_U = '本人本机的token'
# 上述 token 只会发给本机 API (localhost/127.0.0.1)；如果使用自建域名，需要明确设置：
# $env:NETEASE_TRUSTED_COOKIE_HOST = 'your-private-api.example.org'
# 切勿将公共第三方 API 域名设为信任域名。
```

## AI 可以消费的结果

`search` 提供 `ok`、`query`、`total`、`total_is_exact`、`results`（序号/歌曲ID/名称/歌手）、`saved_state`、`needs_selection`；加 `--auto-single` 后如果唯一可自动下载，`auto_download` 中包含下载结果。

`playlist` 提供 `tracks`、`count`、`possibly_incomplete`。

`download` / `select` / `playlist-download` 提供 `requested_count`、`success_count`、`failed_count`、`results`（每首歌的 `ok/status/path/format/bytes/quality_metadata`）。全部成功才返回 `ok:true`、进程退出码 0；部分失败或全部失败使用退出码 1；调用参数等错误使用退出码 2。进度写入 stderr，不会污染 stdout JSON。

## 局限与安全边界

- 无网络沙盒无法真实验证远端音频；请在有 HTTPS 出口的客户端运行 `doctor` 和实际合法授权歌曲测试。
- 第三方可能返回试听片段，无法从音频头可靠判断歌曲是否完整。对外不得保证所有曲目都是完整版。
- Flac/wav 识别以魔数为准，FLAC STREAMINFO 可以读到采样率与位深；MP3 如第一段内可定位 MPEG1-L3 帧则可读取首帧码率。这不等于整首歌的响度、平均码率和主观音质评估。
- VIP、地域、版权和版权方授权将影响音源可获得性。不支持破解 DRM、不保证下载付费歌曲、不自动尝试未经授权的账号或 Cookie。
- 请勿将提供结果中的曲目再次大量传播或商用，需遵守适用协议和版权规定。
