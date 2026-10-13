"""不联网测试：python -m unittest discover -s tests -v"""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import music_skill as m


class FakeResponse:
    def __init__(self, content, content_type="application/octet-stream"):
        self.content = content
        self.headers = {"Content-Type": content_type}  # 故意没有 Content-Length
        self.status_code = 200
    def iter_content(self, chunk_size=65536):
        yield self.content[:500]
        yield self.content[500:]
    def close(self):
        pass


class FakeAPI:
    def __init__(self, payloads, candidates):
        self.errors = []
        self.payloads = payloads
        self.candidates = candidates
    def audio_candidates(self, sid, quality):
        yield from self.candidates
    def request(self, url, **kw):
        return self.payloads.get(url)


class Tests(unittest.TestCase):
    def test_song_and_playlist_links(self):
        self.assertEqual(m.song_id_from("https://music.163.com/#/song?id=33894312"), "33894312")
        self.assertEqual(m.song_id_from("https://music.163.com/playlist?id=2619366284", "playlist"), "2619366284")
        self.assertEqual(m.song_id_from("https://music.163.com/#/playlist?id=2619366284", "playlist"), "2619366284")
        with self.assertRaises(m.MusicError):
            m.song_id_from("https://maliciousmusic.163.com/song?id=1")

    def test_parse_songs(self):
        data = {"result": {"songCount": 2, "songs": [
            {"id": 1, "name": "甲", "ar": [{"name": "歌手A"}, {"name": "歌手B"}], "al": {"name": "专辑"}, "dt": 212000},
            {"id": 2, "name": "乙", "artists": [{"name": "歌手C"}], "duration": 119000}]}}
        songs, total = m.parse_song_list(data)
        self.assertEqual(total, 2)
        self.assertEqual(songs[0]["artists"], "歌手A/歌手B")
        self.assertEqual(songs[0]["album"], "专辑")
        self.assertEqual(songs[1]["duration_seconds"], 119)

    def test_meting_payload(self):
        songs, total = m.parse_song_list([{"id": "300", "name": "X", "artist": ["小红"]}])
        self.assertEqual(total, None)
        self.assertEqual(songs[0]["artists"], "小红")

    def test_indices_and_invalid(self):
        self.assertEqual(m.parse_indices("1,3-5 3", 7), [1, 3, 4, 5])
        with self.assertRaises(m.MusicError):
            m.parse_indices("1,9", 5)
        with self.assertRaises(m.MusicError):
            m.parse_indices("a", 5)

    def test_magic_and_flac_metadata(self):
        streaminfo = (44100 << 44) | (1 << 41) | (15 << 36)
        content = b"fLaC" + bytes([0, 0, 0, 34]) + bytes(10) + streaminfo.to_bytes(8, "big") + bytes(100)
        self.assertEqual(m.sniff_audio(content), "flac")
        self.assertEqual(m.flac_info(content)["bit_depth"], 16)
        self.assertEqual(m.flac_info(content)["sample_rate_hz"], 44100)
        self.assertEqual(m.sniff_audio(b"\xff\xfb\x90\x00"), "mp3")
        self.assertIsNone(m.sniff_audio(b"<!DOCTYPE html><html>"))

    def test_download_flac_without_content_length(self):
        content = b"fLaC" + b"\0" * 4000
        api = FakeAPI({"https://test/audio": FakeResponse(content)}, [{"url": "https://test/audio", "source": "fixture", "level": "lossless", "rank": 4}])
        song = {"id": "42", "name": "测试/歌曲", "artists": "某歌手"}
        with tempfile.TemporaryDirectory() as tmp:
            r = m.download_one(api, song, Path(tmp), "best")
            self.assertTrue(r["ok"], r)
            self.assertEqual(r["format"], "flac")
            self.assertTrue(Path(r["path"]).is_file())
            self.assertEqual(Path(r["path"]).stat().st_size, len(content))
            self.assertNotIn("/歌曲", Path(r["path"]).name)
            self.assertEqual(list(Path(tmp).glob("*.part")), [])
            r2 = m.download_one(api, song, Path(tmp), "best")
            self.assertEqual(r2["status"], "skipped_exists")

    def test_download_rejects_html_and_no_leftover(self):
        api = FakeAPI({"https://test/html": FakeResponse(b"<html>blocked</html>" * 200)}, [{"url": "https://test/html", "source": "fixture", "level": "exhigh", "rank": 3}])
        song = {"id": "42", "name": "测试", "artists": "某歌手"}
        with tempfile.TemporaryDirectory() as tmp:
            r = m.download_one(api, song, Path(tmp), "best")
            self.assertFalse(r["ok"])
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_lossless_does_not_accept_mp3(self):
        api = FakeAPI({"https://test/mp3": FakeResponse(b"ID3" + b"\0" * 3000)}, [{"url": "https://test/mp3", "source": "fixture", "level": "lossless", "rank": 4}])
        song = {"id": "42", "name": "测试", "artists": "某歌手"}
        with tempfile.TemporaryDirectory() as tmp:
            r = m.download_one(api, song, Path(tmp), "lossless")
            self.assertFalse(r["ok"])
            self.assertFalse(any(Path(tmp).iterdir()))

    def test_best_keeps_highest_actual_format(self):
        # API 声称第一个请求是无损却返回 MP3，之后真实 FLAC 必须优先。
        api = FakeAPI({"https://test/fake": FakeResponse(b"ID3" + b"\0" * 2500), "https://test/real": FakeResponse(b"fLaC" + b"\0" * 3500)}, [
            {"url": "https://test/fake", "source": "fixture", "level": "flac-request", "rank": 4},
            {"url": "https://test/real", "source": "fixture", "level": "lossless", "rank": 4},
        ])
        song = {"id": "42", "name": "测试", "artists": "某歌手"}
        with tempfile.TemporaryDirectory() as tmp:
            r = m.download_one(api, song, Path(tmp), "best")
            self.assertTrue(r["ok"])
            self.assertEqual(r["format"], "flac")
            self.assertEqual(list(Path(tmp).glob("*.part")), [])
            self.assertEqual(len(list(Path(tmp).glob("*.flac"))), 1)

    def test_search_writes_selection_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = m.save_state([{"id": "123", "name": "歌", "artists": "人"}], "搜索", 1, Path(tmp))
            saved = json.loads(Path(f).read_text(encoding="utf8"))
            self.assertEqual(saved["results"][0]["id"], "123")

    def test_search_fallback_and_no_network(self):
        class FakeMusic(m.MusicAPI):
            def json(self, base, path, params):
                if path == "/search":
                    return None
                return [{"id": "10", "name": "一首", "artist": "一位"}]
        api = FakeMusic(["https://fake"])
        r = api.search("一首", 15, 1)
        self.assertEqual(r["results"][0]["id"], "10")

    def test_playlist_trackall_pagination(self):
        class FakeMusic(m.MusicAPI):
            def json(self, base, path, params):
                if path == "/playlist/track/all":
                    off = params["offset"]
                    return {"songs": [{"id": i + 1, "name": str(i)} for i in range(off, min(off + params["limit"], 245))], "total": 245}
                return None
        api = FakeMusic(["https://fake"])
        result = api.playlist("456")
        self.assertEqual(len(result["tracks"]), 245)
        self.assertFalse(result["possibly_incomplete"])


if __name__ == "__main__":
    unittest.main()
