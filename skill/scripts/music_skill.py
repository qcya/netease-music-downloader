#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""网易云音乐 Agent Skill CLI。stdout 为单个 JSON 对象，stderr 仅用于进度/错误。"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import shutil
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from typing import Any


def configure_cli_streams() -> None:
    """Use UTF-8 for CLI pipes even on Windows with a GBK console code page.

    Frozen PyInstaller applications can select a different stdout encoding
    from the development Python interpreter. The JSON protocol below also
    escapes non-ASCII text as a second, codec-independent safety measure.
    """
    for output in (sys.stdout, sys.stderr):
        if output is not None and hasattr(output, "reconfigure"):
            try:
                output.reconfigure(encoding="utf-8", errors="backslashreplace")
            except (OSError, ValueError, TypeError):
                pass


configure_cli_streams()

try:
    import requests
except ImportError:
    print(json.dumps({"ok": False, "error": "缺少 requests；执行 python -m pip install -r requirements.txt"}, ensure_ascii=True))
    sys.exit(2)

APP_NAME = "netease-music-downloader"
DEFAULT_BACKENDS = ["https://musicapi.qijieya.cn", "https://api.qijieya.cn"]
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "Referer": "https://music.163.com/"}
STATE_DIR = Path(os.environ.get("NETEASE_SKILL_STATE_DIR", str(Path.home() / ".netease-music-skill"))).expanduser()
DEFAULT_OUT = Path(os.environ.get("NETEASE_DOWNLOAD_DIR", str(Path.home() / "Music" / "NeteaseDownloads"))).expanduser()
EXACT_URL_LEVELS = {"jymaster": 6, "hires": 5, "lossless": 4, "exhigh": 3, "higher": 2, "standard": 1}
AUDIO_CT = ("audio/", "application/ogg", "application/octet-stream", "binary/octet-stream")


class MusicError(Exception):
    pass


def emit(data: dict, pretty: bool = False) -> None:
    # Electron parses JSON, so escaping Unicode changes no user-visible text.
    # ASCII-only output remains writable even if a frozen EXE resets stdout to GBK.
    print(json.dumps(data, ensure_ascii=True, indent=2 if pretty else None))


def warn(message: str) -> None:
    try:
        print(message, file=sys.stderr)
    except UnicodeEncodeError:
        # Diagnostic progress must never abort a download due to a song title.
        print(str(message).encode("ascii", "backslashreplace").decode("ascii"), file=sys.stderr)


def song_id_from(value: str, kind: str = "song") -> str:
    s = str(value).strip()
    if s.isdigit():
        return s
    u = urlparse(s)
    if u.scheme not in ("https", "http") or (u.hostname or "").lower() != "music.163.com":
        raise MusicError(f"无法识别网易云{kind} ID：{s}；请提供数字 ID 或网易云链接")
    candidates = parse_qs(u.query)
    if u.fragment:
        fragment = u.fragment.lstrip("/")
        if "?" in fragment:
            fragment_path, fragment_query = fragment.split("?", 1)
            candidates = parse_qs(fragment_query) | candidates
        else:
            fragment_path = fragment
    else:
        fragment_path = ""
    path = (u.path + "/" + fragment_path).lower()
    wanted = "playlist" if kind == "playlist" else "song"
    if wanted not in path and "id" not in candidates:
        raise MusicError("链接类型不匹配；需提供网易云" + ("歌单" if kind == "playlist" else "单曲") + "链接")
    token = (candidates.get("id") or [None])[0]
    if not token:
        match = re.search(r"/(?:song|playlist)/(\d+)", path)
        token = match.group(1) if match else None
    if not token or not str(token).isdigit():
        raise MusicError("网易云链接没有有效的数字 ID")
    return str(token)


def clean_filename(v: str, max_length: int = 145) -> str:
    v = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", str(v))
    v = re.sub(r"\s+", " ", v).strip(" .")
    return v[:max_length].rstrip(" .") or "未知歌曲"


def parse_artists(item: dict) -> str:
    for k in ("ar", "artists", "artist", "author", "singer"):
        v = item.get(k)
        if isinstance(v, list):
            artists = [str(x.get("name", x.get("title", ""))) if isinstance(x, dict) else str(x) for x in v]
            if artists:
                return "/".join(x for x in artists if x) or "未知歌手"
        if isinstance(v, dict):
            return str(v.get("name") or "未知歌手")
        if isinstance(v, str) and v.strip():
            return v.strip()
    return "未知歌手"


def duration_seconds_from(item: dict) -> int:
    """统一不同音乐接口的时长字段；输出秒，0 表示确实无法获知。

    网易云 detail/search 常用 dt、duration（毫秒）；Meting 兼容接口
    可能用 time、length、duration_seconds 或 mm:ss 文本。
    """
    for key in ('duration_seconds', 'dt', 'duration_ms', 'duration', 'playTime', 'time', 'length'):
        raw = item.get(key)
        if raw is None or raw == '':
            continue
        try:
            if isinstance(raw, str) and ':' in raw:
                parts = raw.strip().split(':')
                if not 2 <= len(parts) <= 3:
                    continue
                values = [float(x) for x in parts]
                if any(x < 0 for x in values):
                    continue
                seconds = round(sum(value * (60 ** (len(values)-idx-1)) for idx, value in enumerate(values)))
            else:
                val = float(raw)
                if not 0 < val < 1e9:
                    continue
                if key in ('dt', 'duration_ms'):
                    seconds = round(val / 1000)
                elif key == 'duration_seconds':
                    seconds = round(val)
                else:
                    # 绝大多数接口时间数字超过 1000 时以毫秒计。
                    seconds = round(val / 1000) if val >= 1000 else round(val)
            if seconds > 0:
                return seconds
        except (ValueError, TypeError, OverflowError):
            pass
    return 0


def parse_track(item: Any) -> dict | None:
    if not isinstance(item, dict):
        return None
    ident = item.get("id") or item.get("songId") or item.get("song_id") or item.get("url_id")
    if isinstance(ident, dict):
        ident = ident.get("id")
    if ident is None:
        for key in ("url", "link"):
            value = str(item.get(key) or "")
            m = re.search(r"(?:[?&]id=|/song/)(\d+)", value)
            if m:
                ident = m.group(1)
                break
    if ident is None or not str(ident).isdigit():
        return None
    title = item.get("name") or item.get("title") or "未知歌曲"
    album = item.get("al") or item.get("album") or {}
    cover = (album.get("picUrl") or album.get("pic_url") or album.get("cover")) if isinstance(album, dict) else ""
    cover = cover or item.get("picUrl") or item.get("coverUrl") or ""
    if isinstance(album, dict):
        album = album.get("name") or album.get("title") or ""
    # Search metadata: omit explicitly advertised trial-only entries.
    trial=item.get('freeTrialInfo') or item.get('trialInfo')
    if trial and isinstance(trial,dict) and trial.get('end') and trial.get('start') is not None:
        return None
    duration = duration_seconds_from(item)
    # This is a metadata filter, not proof that the returned audio is a full recording.
    if duration and duration <= 20:
        return None
    return {"id": str(ident), "name": str(title), "artists": parse_artists(item), "album": str(album or ""), "duration_seconds": duration, "cover_url": str(cover or ""), "page_url": f"https://music.163.com/#/song?id={ident}"}


def parse_song_list(payload: Any) -> tuple[list[dict], int | None]:
    total = None
    if isinstance(payload, list):
        raw = payload
    elif isinstance(payload, dict):
        obj = payload
        for _ in range(4):
            if isinstance(obj, list):
                break
            if not isinstance(obj, dict):
                break
            if isinstance(obj.get("songs"), list):
                total = obj.get("songCount") or obj.get("total") or obj.get("count") or total
                obj = obj["songs"]
                break
            if isinstance(obj.get("tracks"), list):
                total = obj.get("trackCount") or obj.get("total") or total
                obj = obj["tracks"]
                break
            if isinstance(obj.get("items"), list):
                total = obj.get("total") or total
                obj = obj["items"]
                break
            if isinstance(obj.get("list"), list):
                total = obj.get("total") or total
                obj = obj["list"]
                break
            total = obj.get("songCount") or obj.get("total") or obj.get("count") or total
            obj = obj.get("result", obj.get("data", obj.get("playlist")))
        raw = obj if isinstance(obj, list) else []
    else:
        raw = []
    result, seen = [], set()
    for item in raw:
        track = parse_track(item)
        if track and track["id"] not in seen:
            result.append(track)
            seen.add(track["id"])
    try:
        total = int(total) if total is not None else None
    except (ValueError, TypeError):
        total = None
    return result, total


def sniff_audio(data: bytes) -> str | None:
    if data.startswith(b"fLaC"):
        return "flac"
    if data.startswith(b"ID3") or (len(data) >= 2 and data[0] == 0xff and data[1] & 0xe0 == 0xe0 and data[1] & 0x06 != 0):
        return "mp3"
    if data.startswith(b"OggS"):
        return "ogg"
    if data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return "wav"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        return "m4a"
    if len(data) >= 2 and data[0] == 0xff and (data[1] & 0xf6) == 0xf0:
        return "aac"
    return None


def flac_info(data: bytes) -> dict:
    if len(data) < 26 or not data.startswith(b"fLaC") or (data[4] & 0x7f) != 0:
        return {}
    n = int.from_bytes(data[18:26], "big")
    return {"sample_rate_hz": (n >> 44) & 0xfffff, "channels": ((n >> 41) & 7) + 1, "bit_depth": ((n >> 36) & 31) + 1}


def mp3_bitrate_kbps(data: bytes) -> int | None:
    # 仅用于标记：从第一个可解析的 MPEG1 Layer III 帧获取码率，非完整文件平均值。
    start = 0
    if data.startswith(b"ID3") and len(data) >= 10:
        tag_len = ((data[6] & 127) << 21) | ((data[7] & 127) << 14) | ((data[8] & 127) << 7) | (data[9] & 127)
        start = tag_len + 10
    table = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
    for i in range(start, min(len(data) - 3, start + 8192)):
        a, b, c = data[i], data[i + 1], data[i + 2]
        if a == 0xff and (b & 0xfe) == 0xfa and (c >> 4) in range(1, 15):
            return table[c >> 4]
    return None


def parse_lyric_payload(payload: Any) -> tuple[str, str]:
    """支持 JSON API、Meting 原始 LRC、JSON 字符串三种响应。"""
    if isinstance(payload, str):
        raw = payload.lstrip("\ufeff").strip()
        if raw.startswith(("{", '"')):
            try:
                return parse_lyric_payload(json.loads(raw))
            except (ValueError, TypeError):
                pass
        # 严格要求 LRC 时间戳，避免把服务器错误页面或其他响应误当歌词。
        if re.search(r"(?m)^\s*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]", raw):
            return raw[:300000], ""
        return "", ""
    if not isinstance(payload, dict):
        return "", ""
    if isinstance(payload.get("result"), dict):
        return parse_lyric_payload(payload["result"])
    if isinstance(payload.get("data"), dict):
        return parse_lyric_payload(payload["data"])
    def extract(*names: str) -> str:
        for name in names:
            val = payload.get(name)
            if isinstance(val, dict):
                val = val.get("lyric") or val.get("text")
            if isinstance(val, str) and val.strip():
                return val[:300000]
        return ""
    lrc=extract("lrc", "lyric", "text", "klyric")
    trans=extract("tlyric", "translation")
    # JSON 歌词允许纯静态文本；不要把含错误码的字符串当成歌词。
    return lrc, trans


class MusicAPI:
    def __init__(self, bases: list[str] | None = None, timeout: int = 12, retries: int = 2):
        self.bases = [x.rstrip("/") for x in (bases or DEFAULT_BACKENDS)]
        self.timeout = timeout
        self.retries = retries
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        cookie = os.environ.get("NETEASE_MUSIC_U", "").strip()
        self.cookie = (cookie if cookie.startswith("MUSIC_U=") else "MUSIC_U=" + cookie) if cookie else ""
        self.trusted_cookie_host = os.environ.get("NETEASE_TRUSTED_COOKIE_HOST", "").strip().lower()
        # 仅向本机/用户明确受信任的服务器发 Cookie，绝不自动发送给第三方公开 API 或音乐 CDN。
        self.errors: list[str] = []
        if self.cookie and not any(self._trusted_host(urlparse(b).hostname) for b in self.bases):
            self.errors.append("已配置 NETEASE_MUSIC_U，但公开第三方 API 不会收到账号 Cookie；请使用本地或显式信任的自建 API")

    def _trusted_host(self, host: str | None) -> bool:
        return bool(host and (host.lower() in ("localhost", "127.0.0.1", "::1") or host.lower() == self.trusted_cookie_host and bool(self.trusted_cookie_host)))

    def request(self, url: str, *, params: dict | None = None, stream: bool = False):
        for attempt in range(self.retries):
            try:
                extra_headers = {"Cookie": self.cookie} if self.cookie and self._trusted_host(urlparse(url).hostname) else {}
                r = self.session.get(url, params=params, timeout=(6, self.timeout), stream=stream, allow_redirects=True, headers=extra_headers)
                if r.status_code in (429, 500, 502, 503, 504, 521, 522) and attempt + 1 < self.retries:
                    r.close()
                    time.sleep(0.6 * (attempt + 1))
                    continue
                r.raise_for_status()
                return r
            except requests.RequestException as e:
                self.errors.append(f"{url.split('?')[0]}：{type(e).__name__} {e}")
                if attempt + 1 < self.retries:
                    time.sleep(0.6 * (attempt + 1))
        return None

    def json(self, base: str, path: str, params: dict) -> Any:
        resp = self.request(base + path, params=params)
        if resp is None:
            return None
        try:
            return resp.json()
        except ValueError:
            self.errors.append(f"{base}{path} 返回的不是 JSON")
            return None
        finally:
            resp.close()

    def supplement_durations(self, songs: list[dict]) -> list[dict]:
        """搜索接口没附带时长时，批量从 song/detail 补齐，避免逐首请求。

        仅查询缺少时长的 ID；如果详情接口不可用，保留搜索结果，不伪造时长。
        """
        missing = [t['id'] for t in songs if not t.get('duration_seconds')]
        if not missing:
            return songs
        found: dict[str, int] = {}
        for i in range(0, len(missing), 100):
            subset = missing[i:i + 100]
            for base in self.bases:
                data = self.json(base, '/song/detail', {'ids': ','.join(subset)})
                if data is None:
                    continue
                # 不用 parse_song_list：短于 20 秒的详细信息也需要拿来过滤。
                obj = data
                for _ in range(4):
                    if isinstance(obj, list):
                        break
                    if not isinstance(obj, dict):
                        break
                    if isinstance(obj.get('songs'), list):
                        obj = obj['songs']
                        break
                    if isinstance(obj.get('data'), list):
                        obj = obj['data']
                        break
                    obj = obj.get('result', obj.get('data'))
                if not isinstance(obj, list):
                    continue
                for entry in obj:
                    if isinstance(entry, dict):
                        sid = str(entry.get('id') or entry.get('songId') or '')
                        length = duration_seconds_from(entry)
                        if sid in subset and length:
                            found[sid] = length
                if all(sid in found for sid in subset):
                    break
        out = []
        for track in songs:
            duration = track.get('duration_seconds') or found.get(track['id'], 0)
            if duration and duration <= 20:
                continue
            if duration:
                track = {**track, 'duration_seconds': duration}
            out.append(track)
        return out

    def search(self, query: str, limit: int, page: int) -> dict:
        for base in self.bases:
            # Enhanced Netease API 优先；Meting 搜索作为兼容回退。
            for path, params in [
                ("/search", {"keywords": query, "limit": limit, "offset": (page - 1) * limit, "type": 1}),
                ("/meting/", {"type": "search", "id": query, "limit": limit, "page": page, "server": "netease"}),
            ]:
                data = self.json(base, path, params)
                if data is None:
                    continue
                songs, total = parse_song_list(data)
                if songs or total == 0:
                    songs = self.supplement_durations(songs[:limit])
                    return {"results": songs, "total": total if total is not None else len(songs), "total_is_exact": total is not None, "source": base + path}
                if isinstance(data, dict) and data.get("code") == 200 and (data.get("result") is not None):
                    return {"results": [], "total": 0, "total_is_exact": True, "source": base + path}
        raise MusicError("所有搜索接口均未返回可用歌曲数据。请运行 doctor 检查网络和 API 状态。")

    def playlist(self, pid: str, *, limit: int = 0) -> dict:
        partial_fallback = None
        for base in self.bases:
            # /playlist/track/all 分页，尽量获取完整歌单而不是只有前十首。
            tracks, known_total = [], None
            seen = set()
            trackall_worked = False
            batch = 200
            max_records = limit or 10000
            exhausted = False
            for offset in range(0, max_records, batch):
                size = min(batch, max_records - offset)
                data = self.json(base, "/playlist/track/all", {"id": pid, "limit": size, "offset": offset})
                if data is None:
                    break
                songs, total = parse_song_list(data)
                if not songs:
                    exhausted = True
                    break
                trackall_worked = True
                for track in songs:
                    if track["id"] not in seen:
                        tracks.append(track)
                        seen.add(track["id"])
                if total is not None:
                    known_total = total
                if len(songs) < size or (known_total is not None and len(tracks) >= known_total):
                    exhausted = True
                    break
                time.sleep(0.1)
            if trackall_worked:
                # 当知道总数时直接比较；不知道总数时仍尝试 detail 检查完整性。
                target_size = min(known_total, limit or known_total) if known_total is not None else None
                possibly_incomplete = target_size is None or len(tracks) < target_size or (not exhausted and len(tracks) < max_records)
                result = {"tracks": tracks[:limit] if limit else tracks, "total": known_total or len(tracks), "source": base + "/playlist/track/all", "possibly_incomplete": possibly_incomplete}
                if not possibly_incomplete:
                    return result
                if partial_fallback is None or len(result["tracks"]) > len(partial_fallback["tracks"]):
                    partial_fallback = result

            # 元数据回退：playlist.trackIds 比 playlist.tracks 往往完整。
            data = self.json(base, "/playlist/detail", {"id": pid})
            if isinstance(data, dict) and isinstance(data.get("playlist"), dict):
                pl = data["playlist"]
                ids = [str(x.get("id")) for x in pl.get("trackIds", []) if isinstance(x, dict) and str(x.get("id", "")).isdigit()]
                preview, _ = parse_song_list(pl)
                resolved = preview
                needed = ids[:limit] if limit else ids
                if needed and len(preview) < len(needed):
                    by_id = {t["id"]: t for t in preview}
                    for i in range(0, len(needed), 200):
                        sub = needed[i:i + 200]
                        details = self.json(base, "/song/detail", {"ids": ",".join(sub)})
                        for track in parse_song_list(details)[0]:
                            by_id[track["id"]] = track
                    resolved = [by_id[x] for x in needed if x in by_id]
                if resolved:
                    count = len(ids) if ids else int(pl.get("trackCount") or len(resolved))
                    result = {"tracks": resolved[:limit] if limit else resolved, "total": count, "source": base + "/playlist/detail", "possibly_incomplete": len(resolved) < min(count, limit or count)}
                    if not result["possibly_incomplete"]:
                        return result
                    if partial_fallback is None or len(result["tracks"]) > len(partial_fallback["tracks"]):
                        partial_fallback = result

            data = self.json(base, "/meting/", {"type": "playlist", "id": pid, "server": "netease"})
            songs, total = parse_song_list(data)
            if songs:
                result = {"tracks": songs[:limit] if limit else songs, "total": total or len(songs), "source": base + "/meting/", "possibly_incomplete": total is None or len(songs) < min(total, limit or total)}
                if not result["possibly_incomplete"]:
                    return result
                if partial_fallback is None or len(result["tracks"]) > len(partial_fallback["tracks"]):
                    partial_fallback = result
        if partial_fallback:
            return partial_fallback
        raise MusicError("歌单读取失败，或 API 返回的歌单记录没有可用数字歌曲 ID。")

    def song(self, sid: str) -> dict:
        for base in self.bases:
            for path, args in [("/song/detail", {"ids": sid}), ("/meting/", {"type": "song", "id": sid})]:
                songs, _ = parse_song_list(self.json(base, path, args))
                if songs:
                    return songs[0]
        return {"id": sid, "name": "未知歌曲", "artists": "未知歌手", "album": "", "duration_seconds": 0, "page_url": f"https://music.163.com/#/song?id={sid}"}

    def lyric(self, sid: str) -> dict:
        """歌词优先走网易云 JSON 接口；Meting 回退使用 type=lrc + 纯文本。

        音源和歌词是不同接口，音频正常不代表某个歌词端点可用。
        """
        errors_start = len(self.errors)
        for base in self.bases:
            for api_path, params in [("/lyric/new", {"id": sid}), ("/lyric", {"id": sid})]:
                data = self.json(base, api_path, params)
                lrc, translated = parse_lyric_payload(data)
                if lrc:
                    return {"id": sid, "found": True, "lrc": lrc, "translated_lrc": translated,
                            "source": base + api_path, "diagnostic": []}
            # Meting 规范：type=lrc，而不是 type=lyric；通常直接返回 UTF-8 文本。
            resp = self.request(base + "/meting/", params={"type": "lrc", "id": sid, "server": "netease"})
            if resp is None:
                continue
            try:
                if len(resp.content) > 500_000:
                    self.errors.append(base + "/meting/ 歌词响应过大")
                    continue
                data = resp.content.decode("utf-8-sig", errors="replace")
                lrc, translated = parse_lyric_payload(data)
                if lrc:
                    return {"id": sid, "found": True, "lrc": lrc, "translated_lrc": translated,
                            "source": base + "/meting/?type=lrc", "diagnostic": []}
            except (UnicodeError, ValueError) as exc:
                self.errors.append(f"{base}/meting/ 歌词读取异常：{exc}")
            finally:
                resp.close()
        return {"id": sid, "found": False, "lrc": "", "translated_lrc": "", "source": None,
                "diagnostic": self.errors[errors_start:][-6:]}

    def preview_source(self, sid: str) -> dict:
        """Return a short-lived, direct MP3 candidate URL for progressive listening.
        No sound files are returned by this command; playback has to validate the stream MIME.
        """
        for item in self.audio_candidates(sid, "preview"):
            if item.get("source", "").endswith("/song/url/v1") and item.get("url"):
                return {"id":sid,"url":item["url"],"level":item.get("level","standard")}
        raise MusicError("没有找到适合流式试听的直链，将改为完整缓存后播放")

    def audio_candidates(self, sid: str, quality: str):
        specs = []
        if quality == "preview":
            # 尽量先获取较小的 128kbps MP3：目的为缩短首次试听等待，而不是保证下载音质。
            specs += [("v1", "standard"), ("meting", "128"), ("v1", "higher"),
                      ("meting", "192"), ("v1", "exhigh"), ("meting", "320")]
        if quality in ("best", "lossless"):
            specs += [("v1", x) for x in ("jymaster", "hires", "lossless")]
            specs += [("meting", "2000")]
        if quality in ("best", "mp3"):
            specs += [("v1", "exhigh"), ("meting", "320"), ("v1", "higher"), ("meting", "192"), ("v1", "standard"), ("meting", "128")]
        # 避免为了每种音质反复从头下载，先收集 URL，随后按声称音质从高到低进行实际校验。
        seen = set()
        for kind, level in specs:
            for base in self.bases:
                if kind == "v1":
                    response = self.json(base, "/song/url/v1", {"id": sid, "level": level})
                    if not isinstance(response, dict):
                        continue
                    rows = response.get("data") or []
                    if isinstance(rows, dict):
                        rows = [rows]
                    if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
                        continue
                    entry = rows[0]
                    uri = entry.get("url")
                    if not uri or entry.get("freeTrialInfo"):
                        continue
                    actual = str(entry.get("level") or level).lower()
                    if quality == "lossless" and actual not in ("jymaster", "hires", "lossless"):
                        continue
                    # 音质回退时按服务端实际 level 重新排序，而非相信请求参数。
                    rank = EXACT_URL_LEVELS.get(actual, 1)
                    candidate = {"url": uri, "source": base + "/song/url/v1", "level": actual, "requested_level": level, "claimed_bitrate": entry.get("br"), "rank": rank}
                else:
                    uri = base + "/meting/"
                    candidate = {"url": uri, "params": {"type": "url", "id": sid, "br": level}, "source": base + "/meting/", "level": "flac-request" if level == "2000" else "mp3-request-" + level, "rank": 4 if level == "2000" else (3 if level == "320" else 1)}
                key = (candidate["url"], json.dumps(candidate.get("params", {}), sort_keys=True))
                if key not in seen:
                    seen.add(key)
                    yield candidate


def save_state(songs: list[dict], query: str, page: int, state_dir: Path) -> str:
    state_dir.mkdir(parents=True, exist_ok=True)
    target = state_dir / "last_search.json"
    new = target.with_suffix(".tmp")
    new.write_text(json.dumps({"query": query, "page": page, "results": songs}, ensure_ascii=False, indent=2), encoding="utf-8")
    new.replace(target)
    return str(target)


def parse_indices(spec: str, count: int) -> list[int]:
    picked = []
    for raw in re.split(r"[,，\s]+", spec.strip()):
        if not raw:
            continue
        m = re.fullmatch(r"(\d+)(?:-(\d+))?", raw)
        if not m:
            raise MusicError(f"无效序号：{raw}；示例：1,3-5")
        start = int(m.group(1))
        end = int(m.group(2) or start)
        if start > end or start < 1 or end > count:
            raise MusicError(f"序号 {raw} 超出可选范围 1..{count}")
        for idx in range(start, end + 1):
            if idx not in picked:
                picked.append(idx)
    if not picked:
        raise MusicError("至少选择一首歌曲")
    return picked



def verified_audio_duration(filename: Path, kind: str) -> float | None:
    """Read actual duration from the downloaded container, never from remote metadata.

    Mutagen is optional for standalone Skill installations. Unknown/corrupt files
    are handled as unknown rather than asserting that they are complete.
    """
    try:
        from mutagen import File as audio_file, MutagenError
        info=audio_file(str(filename))
        duration=float(info.info.length)
        return duration if 0 < duration < 30*3600 else None
    except (ImportError, AttributeError, OSError, ValueError, TypeError, Exception):
        # Malformed/truncated response: duration is unknown, not verified.
        return None


def is_truncated_trial(expected_seconds: float, actual_seconds: float | None) -> bool:
    """Only reject obvious short previews, with ample tolerance for metadata drift."""
    return bool(actual_seconds is not None and expected_seconds >= 60 and actual_seconds <= 35
                and actual_seconds < expected_seconds * 0.65)

def fetch_audio(api: MusicAPI, candidate: dict, destination: Path, requested: str, expected_duration: float = 0) -> dict | None:
    url = candidate["url"]
    if not isinstance(url, str) or urlparse(url).scheme not in ("https", "http"):
        return None
    response = api.request(url, params=candidate.get("params"), stream=True)
    if response is None:
        return None
    tmp = destination / (".download_" + str(os.getpid()) + "_" + str(time.time_ns()) + ".part")
    expected = None
    try:
        expected = int(response.headers.get("Content-Length", ""))
    except (ValueError, TypeError):
        pass
    started = time.monotonic()
    reported = 0.0
    success = False
    try:
        iterator = response.iter_content(chunk_size=65536)
        first = b""
        while len(first) < 128:
            block = next(iterator, b"")
            if not block:
                break
            first += block
            if len(first) >= 128:
                break
        kind = sniff_audio(first)
        if not kind:
            # JSON / HTML / 被拒绝响应都不写成所谓 MP3。
            api.errors.append(f"{candidate['source']} 返回非音频内容")
            return None
        if requested == "lossless" and kind not in ("flac", "wav"):
            return None
        if requested in ("mp3", "preview") and kind != "mp3":
            return None
        size = len(first)
        with tmp.open("wb") as f:
            f.write(first)
            for block in iterator:
                if block:
                    f.write(block)
                    size += len(block)
                    now = time.monotonic()
                    if now - reported >= 0.4:
                        elapsed = max(0.001, now - started)
                        pct = round(100 * size / expected, 1) if expected and expected > 0 else None
                        print("PROGRESS_JSON:" + json.dumps({"bytes":size,"total":expected,"percent":pct,"speed":int(size/elapsed)},ensure_ascii=True), file=sys.stderr, flush=True)
                        reported = now
        if expected is not None and size != expected:
            api.errors.append(f"文件不完整：收到 {size} 字节，应为 {expected} 字节")
            return None
        if size < 1024:
            api.errors.append(f"音频大小异常：{size} bytes")
            return None
        actual_duration=verified_audio_duration(tmp,kind)
        if is_truncated_trial(expected_duration,actual_duration):
            api.errors.append(f"{candidate['source']} 仅返回 {actual_duration:.1f}s 的试听片段，原歌曲约 {expected_duration:.1f}s；已丢弃短片段")
            return None
        # 基础完整性检查：验证文件头及声明的长度。系统有 ffprobe 时再验证可解码性。
        if os.environ.get("NETEASE_VERIFY_FFPROBE") == "1" and shutil.which("ffprobe"):
            import subprocess
            try:
                verified=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration", "-of","default=noprint_wrappers=1",str(tmp)],capture_output=True,timeout=15)
                if verified.returncode != 0:
                    api.errors.append("ffprobe 无法正确解析音频容器")
                    return None
            except (OSError,subprocess.TimeoutExpired):
                pass
        meta = flac_info(first) if kind == "flac" else {}
        if kind == "mp3":
            bit = mp3_bitrate_kbps(first)
            if bit:
                meta["mp3_first_frame_kbps"] = bit
        success = True
        return {"temporary_path": str(tmp), "bytes": size, "format": kind, "source": candidate["source"], "api_level": candidate["level"], "quality_metadata": meta,"actual_duration_seconds":actual_duration}
    except (OSError, requests.RequestException) as e:
        api.errors.append(f"读取音频中断：{type(e).__name__}: {e}")
        return None
    finally:
        response.close()
        # 成功的临时文件由上层判断并移动；失败时一律清理。
        if not success:
            tmp.unlink(missing_ok=True)


def audio_score(result: dict) -> int:
    fmt = result["format"]
    info = result.get("quality_metadata", {})
    if fmt in ("flac", "wav"):
        return 10000 + (info.get("sample_rate_hz", 44100) // 1000) + (info.get("bit_depth", 16) * 10)
    if fmt == "mp3":
        kbps = info.get("mp3_first_frame_kbps")
        if kbps:
            return 1000 + kbps
        try:
            declared = int(result.get("claimed_bitrate") or 128000)
        except (ValueError, TypeError):
            declared = 128000
        return 1050 + min(300, declared // 1000)
    return 950


def download_one(api: MusicAPI, song: dict, out_dir: Path, quality: str, *, overwrite: bool = False) -> dict:
    sid = song["id"]
    prefix = clean_filename(song.get("name", "未知歌曲") + " - " + song.get("artists", "未知歌手"), 120) + f" [{sid}]"
    out_dir.mkdir(parents=True, exist_ok=True)
    # 清理前次异常中断留下的旧临时文件，避免长期占用磁盘。
    for old_tmp in out_dir.glob(".download_*.part"):
        try:
            if time.time() - old_tmp.stat().st_mtime > 24 * 3600:
                old_tmp.unlink(missing_ok=True)
        except OSError:
            pass
    # 使用字符串比较，不用 glob：文件名含有 [歌曲ID]，glob 会把中括号当通配字符。
    present = [str(p) for p in out_dir.iterdir() if p.is_file() and p.name.startswith(prefix + ".") and p.suffix.lower() in (".flac", ".mp3", ".wav", ".ogg", ".m4a", ".aac")]
    suitable = [p for p in present if quality == "best" or (quality == "lossless" and Path(p).suffix.lower() in (".flac", ".wav")) or (quality in ("mp3", "preview") and Path(p).suffix.lower() == ".mp3")]
    # best 模式不能将已存在的低音质 MP3 当成最高音质。
    # 已存在真实无损文件才直接跳过；旧 MP3 尝试升级，失败时保留原文件。
    old_fallback = suitable[0] if suitable else None
    if suitable and not overwrite and (quality != "best" or any(Path(p).suffix.lower() in (".flac", ".wav") for p in suitable)):
        existing = next((p for p in suitable if Path(p).suffix.lower() in (".flac", ".wav")), suitable[0])
        return {"ok": True, "status": "skipped_exists", "song": song, "path": existing}
    candidates = api.audio_candidates(sid, quality)
    best = None
    try:
        for cand in candidates:
            result = fetch_audio(api, cand, out_dir, quality, float(song.get("duration_seconds") or 0))
            if not result:
                continue
            result["claimed_bitrate"] = cand.get("claimed_bitrate")
            if best is None or audio_score(result) > audio_score(best):
                if best:
                    Path(best["temporary_path"]).unlink(missing_ok=True)
                best = result
            else:
                Path(result["temporary_path"]).unlink(missing_ok=True)
            # 收到有效无损文件即无需再尝试有损候选。
            if best["format"] in ("flac", "wav") or quality == "preview":
                break
            # 如果得到了 320kbps MP3，已是该策略的最佳有损音质。
            if (best["format"] == "mp3" and best["quality_metadata"].get("mp3_first_frame_kbps", 0) >= 320
                and (quality == "mp3" or cand.get("requested_level") in ("exhigh", "higher", "standard") or cand["level"].startswith("mp3-request"))):
                break
        if not best:
            if old_fallback and Path(old_fallback).exists():
                return {"ok": True, "status": "existing_no_upgrade", "song": song, "path": old_fallback,
                        "warning": "当前接口未返回更高音质，保留已有文件", "diagnostic": api.errors[-3:]}
            return {"ok": False, "status": "unavailable", "song": song, "error": "没有获得有效音频；可能是版权/会员限制或接口故障", "diagnostic": api.errors[-3:]}
        dst = out_dir / (prefix + "." + best["format"])
        if dst.exists() and not overwrite:
            Path(best["temporary_path"]).unlink(missing_ok=True)
            return {"ok": True, "status": "skipped_exists", "song": song, "path": str(dst)}
        # 不将同格式同文件名的已有文件直接覆盖；先比较两者。
        if dst.exists() and not overwrite:
            Path(best["temporary_path"]).unlink(missing_ok=True)
            return {"ok": True, "status": "skipped_exists", "song": song, "path": str(dst)}
        Path(best["temporary_path"]).replace(dst)
        if overwrite:
            for old in present:
                if Path(old) != dst:
                    Path(old).unlink(missing_ok=True)
        warning = (f"所连接接口没有返回可用 FLAC/WAV 无损音频，已降级保存 {best['format'].upper()}。" if quality=='best' and best['format'] not in ('flac','wav') else '')
        return {"ok": True, "status": "downloaded", "song": song, "path": str(dst), "format": best["format"], "bytes": best["bytes"], "source": best["source"], "api_level": best["api_level"], "quality_metadata": best["quality_metadata"],"warning":warning}
    finally:
        if best:
            Path(best["temporary_path"]).unlink(missing_ok=True)


def download_many(api: MusicAPI, songs: list[dict], dest: Path, quality: str, overwrite: bool = False) -> dict:
    outcomes = []
    for i, song in enumerate(songs, 1):
        warn(f"[{i}/{len(songs)}] {song['name']} - {song['artists']}")
        try:
            outcomes.append(download_one(api, song, dest, quality, overwrite=overwrite))
        except (OSError, requests.RequestException) as e:
            outcomes.append({"ok": False, "song": song, "status": "error", "error": str(e)})
        if i < len(songs):
            time.sleep(0.3)
    success = sum(x["ok"] for x in outcomes)
    return {"ok": success == len(songs), "requested_count": len(songs), "success_count": success, "failed_count": len(songs) - success, "results": outcomes, "output_dir": str(dest)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="网易云音乐 Agent Skill（JSON API）")
    parser.add_argument("--runtime-info", action="store_true", help="离线返回内置后端运行信息")
    parser.add_argument("--capabilities", action="store_true", help="离线列出 AI Skill 支持的命令和输出契约")
    parser.add_argument("--pretty", action="store_true", help="美化 JSON 输出")
    parser.add_argument("--api-base", action="append", help="自定义 API 基址（可多次指定，覆盖内置接口）")
    parser.add_argument("--state-dir", type=Path, default=STATE_DIR)
    parser.add_argument("--timeout", type=int, default=12)
    sub = parser.add_subparsers(dest="command", required=False)
    d = sub.add_parser("doctor", help="逐个检查 API 可用性")
    s = sub.add_parser("search", help="根据关键词搜索（只返回列表）")
    s.add_argument("--query", "-q", required=True)
    s.add_argument("--limit", type=int, default=15)
    s.add_argument("--page", type=int, default=1)
    s.add_argument("--auto-single", action="store_true", help="仅当确认唯一匹配时下载")
    p = sub.add_parser("playlist", help="预览整个网易云歌单，不下载")
    p.add_argument("--id", required=True)
    p.add_argument("--limit", type=int, default=0)
    stream_parser = sub.add_parser("preview-source", help="解析用于流式试听的短期 MP3 地址")
    stream_parser.add_argument("--id", required=True)
    g = sub.add_parser("song", help="查询单曲信息")
    g.add_argument("--id", required=True)
    lyric_parser = sub.add_parser("lyric", help="获取单曲同步歌词 LRC")
    lyric_parser.add_argument("--id", required=True)
    dl = sub.add_parser("download", help="按照歌曲 ID 下载一首或多首")
    dl.add_argument("--id", required=True, action="append", help="多个 ID 可重复指定")
    sel = sub.add_parser("select", help="按搜索结果编号下载，如 1,3-5")
    sel.add_argument("--indices", required=True)
    sel.add_argument("--from-file", type=Path, help="指定 search 状态 JSON；默认最近一次搜索")
    sel.add_argument("--dry-run", action="store_true", help="只查看将下载哪些歌曲")
    pl = sub.add_parser("playlist-download", help="批量下载歌单")
    pl.add_argument("--id", required=True)
    pl.add_argument("--limit", type=int, default=0)
    pl.add_argument("--yes", action="store_true", help="确认执行批量下载；适合 AI 用户已明确授权时使用")
    pl.add_argument("--allow-partial", action="store_true", help="允许下载接口提供的部分歌单，默认拒绝假装完整")
    for cmd in (s, dl, sel, pl):
        cmd.add_argument("--quality", choices=("best", "lossless", "mp3", "preview"), default="best")
        cmd.add_argument("--out", type=Path, default=DEFAULT_OUT)
        cmd.add_argument("--overwrite", action="store_true")

    args = parser.parse_args(argv)
    if args.capabilities:
        emit({"ok": True, "skill": APP_NAME, "schema_version": 1,
              "commands": ["doctor", "search", "song", "lyric", "preview-source", "download", "select", "playlist", "playlist-download"],
              "audio_qualities": ["best", "lossless", "mp3", "preview"],
              "stdout": "one UTF-8 JSON object", "progress": "stderr",
              "exit_codes": {"0": "success", "1": "partial/unavailable", "2": "invalid request"},
              "note": "Results subject to third-party availability and song rights; do not fabricate URLs."})
        return 0
    if args.runtime_info:
        emit({"ok": True, "backend": "netease-music-skill", "python": sys.version.split()[0], "requests": requests.__version__, "embedded": bool(getattr(sys, "frozen", False))})
        return 0
    if not args.command:
        parser.error("需要指定命令，例如 search、download、lyric 或 doctor")
    if args.timeout < 1:
        raise MusicError("timeout 不能小于 1 秒")
    bases = args.api_base or ([x.strip() for x in os.environ.get("NETEASE_API_BASE_URL", "").split(",") if x.strip()] or None)
    if bases and not all(urlparse(b).scheme in ("https", "http") and urlparse(b).netloc for b in bases):
        raise MusicError("API 基址必须是完整的 http(s) URL")
    api = MusicAPI(bases, timeout=args.timeout)
    if args.command == "doctor":
        checks = []
        for base in api.bases:
            row = {"base": base, "search_api": False, "meting_api": False}
            for path, params, key in [
                ("/search", {"keywords": "晴天", "limit": 1}, "search_api"),
                ("/meting/", {"type": "search", "id": "晴天", "limit": 1}, "meting_api"),
            ]:
                data = api.json(base, path, params)
                songs, total = parse_song_list(data)
                row[key] = bool(songs or total == 0)
            checks.append(row)
        emit({"ok": any(c["search_api"] or c["meting_api"] for c in checks), "checks": checks, "errors": api.errors[-6:]}, args.pretty)
        return 0 if any(c["search_api"] or c["meting_api"] for c in checks) else 1
    if args.command == "search":
        if not args.query.strip() or not (1 <= args.limit <= 100) or args.page < 1:
            raise MusicError("搜索词不能为空，limit 范围 1..100，page 必须 >=1")
        data = api.search(args.query, args.limit, args.page)
        state = save_state(data["results"], args.query, args.page, args.state_dir)
        entries = [{"index": idx, **song} for idx, song in enumerate(data["results"], 1)]
        output = {"ok": True, "query": args.query, "page": args.page, "total": data["total"], "total_is_exact": data["total_is_exact"], "results": entries, "source": data["source"], "saved_state": state, "needs_selection": len(entries) > 1 or (data["total_is_exact"] and data["total"] > 1)}
        if args.auto_single and len(entries) == 1 and (data["total_is_exact"] and data["total"] == 1 or (not data["total_is_exact"] and args.page == 1 and args.limit > 1)):
            output["auto_download"] = download_many(api, data["results"], args.out.expanduser(), args.quality, args.overwrite)
        emit(output, args.pretty)
        return 0 if output.get("auto_download", {}).get("ok", True) else 1
    if args.command == "preview-source":
        sid=song_id_from(args.id)
        emit({"ok":True,**api.preview_source(sid)},args.pretty)
        return 0
    if args.command == "song":
        sid = song_id_from(args.id)
        emit({"ok": True, "song": api.song(sid)}, args.pretty)
        return 0
    if args.command == "lyric":
        sid = song_id_from(args.id)
        emit({"ok": True, **api.lyric(sid)}, args.pretty)
        return 0
    if args.command in ("playlist", "playlist-download"):
        pid = song_id_from(args.id, "playlist")
        if args.limit < 0:
            raise MusicError("limit 不能小于 0")
        data = api.playlist(pid, limit=args.limit)
        if args.command == "playlist":
            emit({"ok": True, "playlist_id": pid, **data, "count": len(data["tracks"])}, args.pretty)
            return 0
        if not args.yes:
            raise MusicError("批量下载需添加 --yes；AI 应先确认用户明确要求下载整份歌单")
        if data["possibly_incomplete"] and not args.allow_partial:
            raise MusicError("歌单接口可能仅提供部分曲目，已停止批量下载。先执行 playlist 预览，确认后可加 --allow-partial 下载已获取的部分。")
        result = download_many(api, data["tracks"], args.out.expanduser(), args.quality, args.overwrite)
        emit({"playlist_id": pid, "playlist_source": data["source"], "possibly_incomplete": data["possibly_incomplete"], **result}, args.pretty)
        return 0 if result["ok"] else 1
    if args.command == "download":
        ids = list(dict.fromkeys(song_id_from(x) for x in args.id))
        tracks = [api.song(sid) for sid in ids]
        result = download_many(api, tracks, args.out.expanduser(), args.quality, args.overwrite)
        emit(result, args.pretty)
        return 0 if result["ok"] else 1
    if args.command == "select":
        path = args.from_file or (args.state_dir / "last_search.json")
        if not path.is_file():
            raise MusicError(f"没有找到搜索记录：{path}。请先执行 search。")
        state = json.loads(path.read_text(encoding="utf-8"))
        rows = state.get("results", [])
        picks = parse_indices(args.indices, len(rows))
        tracks = [rows[i - 1] for i in picks]
        if args.dry_run:
            emit({"ok": True, "query": state.get("query"), "selected_indices": picks, "songs": tracks}, args.pretty)
            return 0
        result = download_many(api, tracks, args.out.expanduser(), args.quality, args.overwrite)
        emit({"selected_indices": picks, **result}, args.pretty)
        return 0 if result["ok"] else 1
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (MusicError, OSError, ValueError, json.JSONDecodeError) as exc:
        emit({"ok": False, "error": str(exc)})
        sys.exit(2)
