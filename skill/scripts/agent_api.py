#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Opt-in loopback HTTP bridge for the bundled NetEase music CLI.

The API intentionally has no browser UI and binds only to 127.0.0.1. Each
request is converted to the existing CLI argument contract, so the HTTP layer
cannot supply arbitrary paths, shell commands, or upstream API hosts.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

MAX_BODY_BYTES = 256 * 1024
MAX_SEARCH_RESULTS = 50
MAX_DOWNLOAD_IDS = 20
MAX_PLAYLIST_DOWNLOAD = 500
QUALITIES = {"best", "lossless", "mp3", "preview"}


class AgentHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    block_on_close = False
    allow_reuse_address = True

    def __init__(self, port: int, *, state_dir: Path, out_dir: Path,
                 api_bases: list[str] | None, request_timeout: int) -> None:
        super().__init__(("127.0.0.1", port), AgentRequestHandler)
        self.token = secrets.token_urlsafe(32)
        self.state_dir = state_dir.expanduser().resolve()
        self.out_dir = out_dir.expanduser().resolve()
        self.api_bases = list(api_bases or [])
        self.request_timeout = max(1, int(request_timeout))
        self.last_activity = time.monotonic()
        self.active_requests = 0
        self.activity_lock = threading.Lock()
        self.backend_slots = threading.BoundedSemaphore(2)
        self.stop_requested = False

    def begin_request(self) -> None:
        with self.activity_lock:
            self.active_requests += 1
            self.last_activity = time.monotonic()

    def end_request(self) -> None:
        with self.activity_lock:
            self.active_requests = max(0, self.active_requests - 1)
            self.last_activity = time.monotonic()

    def is_idle_for(self, seconds: float) -> bool:
        with self.activity_lock:
            return self.active_requests == 0 and time.monotonic() - self.last_activity >= seconds


def create_server(*, port: int = 0, state_dir: Path, out_dir: Path,
                  api_bases: list[str] | None, request_timeout: int = 12) -> AgentHTTPServer:
    """Create an authenticated server on IPv4 loopback only."""
    if not 0 <= int(port) <= 65535:
        raise ValueError("端口范围必须是 0..65535；0 表示自动分配空闲端口")
    if int(request_timeout) < 1:
        raise ValueError("请求超时至少为 1 秒")
    return AgentHTTPServer(int(port), state_dir=Path(state_dir), out_dir=Path(out_dir),
                           api_bases=api_bases, request_timeout=int(request_timeout))


def write_connection(server: AgentHTTPServer, path: Path, *, idle_timeout: int = 300) -> Path:
    """Write the ephemeral address and bearer token for a local Agent to read."""
    target = Path(path).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    port = int(server.server_port)
    payload = {
        "schema_version": 1,
        "url": f"http://127.0.0.1:{port}",
        "host": "127.0.0.1",
        "port": port,
        "token": server.token,
        "auth": "Authorization: Bearer <token>",
        "download_dir": str(server.out_dir),
        "idle_timeout_seconds": max(0, int(idle_timeout)),
        "created_unix": int(time.time()),
    }
    temp = target.with_name(f".{target.name}.{os.getpid()}.tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, target)
    return target


def _json_string(value: Any, field: str, *, max_length: int = 200) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > max_length:
        raise ValueError(f"{field} 必须是 1..{max_length} 个字符的非空文本")
    return value.strip()


def _identifier(value: Any, field: str, *, playlist: bool = False) -> str:
    ident = _json_string(value, field, max_length=500)
    if ident.startswith("-"):
        raise ValueError(f"{field} 不能以 - 开头")
    if ident.isdigit():
        return ident
    parsed = urlsplit(ident)
    wanted = "playlist" if playlist else "song"
    if parsed.scheme not in ("http", "https") or (parsed.hostname or "").lower() != "music.163.com":
        raise ValueError(f"{field} 请使用数字 ID 或 music.163.com 链接")
    path = (parsed.path + "/" + parsed.fragment.split("?", 1)[0]).lower()
    if wanted not in path and "id=" not in parsed.query and "id=" not in parsed.fragment:
        raise ValueError(f"{field} 链接类型不匹配")
    return ident


def _integer(data: dict[str, Any], key: str, default: int, minimum: int, maximum: int) -> int:
    value = data.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ValueError(f"{key} 必须在 {minimum}..{maximum} 范围内")
    return value


def _boolean(data: dict[str, Any], key: str, default: bool = False) -> bool:
    value = data.get(key, default)
    if not isinstance(value, bool):
        raise ValueError(f"{key} 必须是 JSON 布尔值")
    return value


def _quality(data: dict[str, Any]) -> str:
    value = data.get("quality", "best")
    if not isinstance(value, str) or value not in QUALITIES:
        raise ValueError("quality 仅支持 best、lossless、mp3、preview")
    return str(value)


def _only_fields(data: dict[str, Any], allowed: set[str]) -> None:
    extra = sorted(set(data) - allowed)
    if extra:
        raise ValueError("不支持的字段：" + ", ".join(extra))


def _backend_command(server: AgentHTTPServer, args: list[str], *, timeout: int) -> tuple[int, dict[str, Any]]:
    if not server.backend_slots.acquire(blocking=False):
        return 429, {"ok": False, "error": "随包音乐后端正忙；请等待当前任务完成后重试。"}
    prefix: list[str] = []
    for base in server.api_bases:
        prefix.extend(("--api-base", base))
    prefix.extend(("--state-dir", str(server.state_dir), "--timeout", str(server.request_timeout)))
    if getattr(sys, "frozen", False):
        command = [sys.executable, *prefix, *args]
    else:
        script = Path(__file__).with_name("music_skill.py")
        command = [sys.executable, str(script), *prefix, *args]
    env = os.environ.copy()
    env["NETEASE_SKILL_STATE_DIR"] = str(server.state_dir)
    env["NETEASE_DOWNLOAD_DIR"] = str(server.out_dir)
    try:
        try:
            completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8",
                                       errors="replace", timeout=timeout, env=env, check=False)
        except subprocess.TimeoutExpired:
            return 504, {"ok": False, "error": "音乐后端处理超时，请稍后重试或检查网络/API 可用性。"}
        except OSError as exc:
            return 503, {"ok": False, "error": f"无法启动随包音乐后端：{exc}"}
    finally:
        server.backend_slots.release()
    try:
        result = json.loads(completed.stdout.strip())
    except (json.JSONDecodeError, TypeError):
        message = completed.stderr.strip()[-1500:] or "音乐后端没有返回有效 JSON。"
        return 502, {"ok": False, "error": message}
    if not isinstance(result, dict):
        return 502, {"ok": False, "error": "音乐后端返回的 JSON 不是对象。"}
    if completed.returncode == 2:
        return 400, result
    if completed.returncode not in (0, 1):
        return 502, result
    return 200, result


class AgentRequestHandler(BaseHTTPRequestHandler):
    server: AgentHTTPServer
    protocol_version = "HTTP/1.1"

    def log_message(self, _format: str, *_args: Any) -> None:
        # Request headers, queries, and bearer credentials never go to stdout/logs.
        return

    def _reply(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _validate_origin_and_host(self) -> bool:
        port = int(self.server.server_port)
        allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        host = (self.headers.get("Host") or "").strip().lower()
        if host not in allowed_hosts:
            self._reply(403, {"ok": False, "error": "Host 仅允许本机地址。"})
            return False
        origin = (self.headers.get("Origin") or "").strip().lower()
        allowed_origins = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
        if origin and origin not in allowed_origins:
            self._reply(403, {"ok": False, "error": "Origin 不在本机允许列表中。"})
            return False
        if self.headers.get("Transfer-Encoding"):
            self._reply(400, {"ok": False, "error": "不支持分块传输请求。"})
            return False
        return True

    def _authorized(self) -> bool:
        if not self._validate_origin_and_host():
            return False
        authorization = self.headers.get("Authorization") or ""
        expected = "Bearer " + self.server.token
        if not secrets.compare_digest(authorization, expected):
            self._reply(401, {"ok": False, "error": "缺少或无效的本机 Agent API 令牌。"})
            return False
        self.server.begin_request()
        return True

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
        if not self._authorized():
            return
        try:
            if self.path != "/health":
                self._reply(404, {"ok": False, "error": "未知的 API 路径。"})
                return
            self._reply(200, {"ok": True, "service": "netease-music-agent-api", "schema_version": 1,
                              "commands": ["search", "song", "lyric", "playlist", "download", "playlist-download", "select", "shutdown"]})
        finally:
            self.server.end_request()

    def _read_json(self) -> dict[str, Any]:
        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            raise ValueError("请求需要 Content-Length。")
        try:
            length = int(raw_length)
        except ValueError as exc:
            raise ValueError("Content-Length 无效。") from exc
        if length < 0 or length > MAX_BODY_BYTES:
            raise OverflowError("请求内容超过 256 KiB 限制。")
        previous_timeout = self.connection.gettimeout()
        try:
            self.connection.settimeout(10)
            raw = self.rfile.read(length)
        except TimeoutError as exc:
            raise ValueError("读取请求正文超时。") from exc
        finally:
            self.connection.settimeout(previous_timeout)
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("请求正文必须是 UTF-8 JSON。") from exc
        if not isinstance(value, dict):
            raise ValueError("请求正文必须是 JSON 对象。")
        return value

    def _route(self, path: str, data: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        if path == "/search":
            _only_fields(data, {"query", "limit", "page"})
            query = _json_string(data.get("query"), "query", max_length=200)
            limit = _integer(data, "limit", 15, 1, MAX_SEARCH_RESULTS)
            page = _integer(data, "page", 1, 1, 1000)
            return _backend_command(self.server, ["search", "--query", query, "--limit", str(limit), "--page", str(page)], timeout=45)
        if path in ("/song", "/lyric"):
            _only_fields(data, {"id"})
            sid = _identifier(data.get("id"), "id")
            return _backend_command(self.server, [path[1:], "--id", sid], timeout=45)
        if path == "/playlist":
            _only_fields(data, {"id", "limit"})
            pid = _identifier(data.get("id"), "id", playlist=True)
            limit = _integer(data, "limit", 0, 0, 5000)
            return _backend_command(self.server, ["playlist", "--id", pid, "--limit", str(limit)], timeout=90)
        if path == "/download":
            _only_fields(data, {"ids", "quality", "overwrite"})
            ids = data.get("ids")
            if not isinstance(ids, list) or not 1 <= len(ids) <= MAX_DOWNLOAD_IDS:
                raise ValueError(f"ids 必须是 1..{MAX_DOWNLOAD_IDS} 项的数组。")
            quality = _quality(data)
            overwrite = _boolean(data, "overwrite")
            args = ["download"]
            for value in ids:
                args.extend(("--id", _identifier(value, "ids 项")))
            args.extend(("--quality", quality, "--out", str(self.server.out_dir)))
            if overwrite:
                args.append("--overwrite")
            return _backend_command(self.server, args, timeout=1800)
        if path == "/playlist-download":
            _only_fields(data, {"id", "limit", "quality", "allow_partial", "confirm", "overwrite"})
            if not _boolean(data, "confirm"):
                raise ValueError("批量下载必须显式设置 confirm: true；先预览歌单并确认用户确实要求下载。")
            pid = _identifier(data.get("id"), "id", playlist=True)
            limit = _integer(data, "limit", 0, 0, MAX_PLAYLIST_DOWNLOAD)
            quality = _quality(data)
            allow_partial = _boolean(data, "allow_partial")
            overwrite = _boolean(data, "overwrite")
            args = ["playlist-download", "--id", pid, "--limit", str(limit), "--yes",
                    "--quality", quality, "--out", str(self.server.out_dir)]
            if allow_partial:
                args.append("--allow-partial")
            if overwrite:
                args.append("--overwrite")
            return _backend_command(self.server, args, timeout=3600)
        if path == "/select":
            _only_fields(data, {"indices", "quality", "overwrite"})
            indices = _json_string(data.get("indices"), "indices", max_length=100)
            if not re.fullmatch(r"\s*\d+(?:\s*(?:,|-)\s*\d+)*\s*", indices):
                raise ValueError("indices 请使用 1,3 或 2-5 格式。")
            quality = _quality(data)
            overwrite = _boolean(data, "overwrite")
            args = ["select", "--indices", indices, "--quality", quality, "--out", str(self.server.out_dir)]
            if overwrite:
                args.append("--overwrite")
            return _backend_command(self.server, args, timeout=1800)
        if path == "/shutdown":
            _only_fields(data, set())
            self.server.stop_requested = True
            return 200, {"ok": True, "message": "本机 Agent API 即将关闭。"}
        return 404, {"ok": False, "error": "未知的 API 路径。"}

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler API
        if not self._authorized():
            return
        try:
            path = urlsplit(self.path).path
            if self.path != path:
                self._reply(400, {"ok": False, "error": "API 不接受查询字符串。"})
                return
            try:
                data = self._read_json()
                status, result = self._route(path, data)
            except OverflowError as exc:
                status, result = 413, {"ok": False, "error": str(exc)}
            except ValueError as exc:
                status, result = 400, {"ok": False, "error": str(exc)}
            self._reply(status, result)
        except Exception as exc:  # Keep internal traces and credentials out of the API response.
            self._reply(500, {"ok": False, "error": f"本机 Agent API 发生内部错误：{type(exc).__name__}"})
        finally:
            self.server.end_request()


def run_server(server: AgentHTTPServer, idle_timeout: float = 300,
               connection_file: Path | None = None) -> None:
    """Serve until shutdown or the configured period without active requests."""
    if idle_timeout < 0:
        raise ValueError("空闲退出秒数不能小于 0")
    server.timeout = 0.25
    try:
        while not server.stop_requested:
            server.handle_request()
            if idle_timeout and server.is_idle_for(idle_timeout):
                server.stop_requested = True
        # Allow the shutdown response from its daemon request thread to flush.
        time.sleep(0.12)
    finally:
        server.server_close()
        if connection_file:
            try:
                path = Path(connection_file)
                current = json.loads(path.read_text(encoding="utf-8"))
                if secrets.compare_digest(str(current.get("token", "")), server.token):
                    path.unlink(missing_ok=True)
            except (OSError, ValueError, TypeError):
                pass
