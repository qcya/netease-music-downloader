"""在 localhost 模拟音乐 API，执行真实 CLI 子进程；不访问网易云服务器。"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SCRIPT = Path(__file__).resolve().parents[1] / 'skill' / 'scripts' / 'music_skill.py'
ROOT = SCRIPT.parent.parent


class MusicStub(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        host = f'http://127.0.0.1:{self.server.server_port}'
        songs = [
            {'id': 101, 'name': '流星', 'ar': [{'name': '歌手甲'}], 'al': {'name': '专辑A'}},
            {'id': 102, 'name': '海风·Björk', 'ar': [{'name': 'Björk'}], 'al': {'name': '专辑B'}},
        ]
        if u.path == '/search':
            hits = songs[:1] if q.get('keywords') == ['唯一'] else songs
            payload = {'code': 200, 'result': {'songs': hits, 'songCount': len(hits)}}
        elif u.path == '/meting/':
            if q.get('type') == ['lrc']:
                content='[00:00.10]原始文本歌词\n[00:02.30]来自 Meting LRC'
                blob=content.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type','text/plain')
                self.send_header('Content-Length',str(len(blob)))
                self.end_headers();self.wfile.write(blob);return
            payload = {'result': {'songs': songs, 'songCount': 2}}
        elif u.path in ('/lyric/new','/lyric'):
            if int(q.get('id',['101'])[0])>=200:
                payload = {'code': 200, 'lrc': {'lyric': ''}}
            else:
                payload = {'code': 200, 'lrc': {'lyric': '[00:01.00]流星划过天空\n[00:05.50]第二句'}, 'tlyric': {'lyric': '[00:01.00]A shooting star'}}
        elif u.path == '/song/detail':
            ids = q.get('ids', [''])[0].split(',')
            payload = {'code': 200, 'songs': [s for s in songs if str(s['id']) in ids]}
        elif u.path == '/playlist/track/all':
            offset = int(q.get('offset', ['0'])[0])
            limit = int(q.get('limit', ['200'])[0])
            payload = {'songs': songs[offset:offset + limit], 'total': 2}
        elif u.path == '/song/url/v1':
            ident = q.get('id', ['101'])[0]
            payload = {'code': 200, 'data': [{'url': host + '/audio/' + ident + '.flac', 'level': 'lossless', 'br': 1500000, 'freeTrialInfo': None}]}
        elif u.path.startswith('/audio/'):
            body = b'fLaC' + b'\0' * 3000
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            # 不附 Content-Length：覆盖原版已知的误判 bug。
            self.end_headers()
            self.wfile.write(body)
            return
        else:
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class CliIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), MusicStub)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def run_cli(self, state, *args):
        cmd = [sys.executable, str(SCRIPT), '--api-base', f'http://127.0.0.1:{self.server.server_port}', '--state-dir', str(state), *args]
        out = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, encoding='utf-8', timeout=25)
        self.assertTrue(out.stdout, out.stderr)
        data = json.loads(out.stdout)
        return out.returncode, data

    def test_search_with_foreign_artist_under_gbk_codepage(self):
        """Reproduce Windows GBK error with a song name containing U+00F6."""
        with tempfile.TemporaryDirectory() as folder:
            cmd = [sys.executable, str(SCRIPT), '--api-base',
                   f'http://127.0.0.1:{self.server.server_port}',
                   '--state-dir', str(Path(folder) / 'state'),
                   'search', '--query', '多个']
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'gbk:strict'
            env.pop('PYTHONUTF8', None)
            output = subprocess.run(cmd, env=env, cwd=str(ROOT), capture_output=True,
                                    timeout=25)
            self.assertEqual(output.returncode, 0, output.stderr.decode('utf-8', errors='replace'))
            payload = json.loads(output.stdout.decode('utf-8'))
            self.assertEqual(payload['results'][1]['name'], '海风·Björk')
            self.assertEqual(payload['results'][1]['artists'], 'Björk')
            self.assertTrue(all(ch < 128 for ch in output.stdout),
                            'JSON protocol must be portable across Windows codepages')

    def test_search_multi_select_and_playlist(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            state, output = home / 'state', home / 'audio'
            rc, found = self.run_cli(state, 'search', '-q', '多个', '--auto-single', '--out', str(output))
            self.assertEqual(rc, 0, found)
            self.assertEqual(len(found['results']), 2)
            self.assertTrue(found['needs_selection'])
            self.assertNotIn('auto_download', found)
            self.assertFalse(output.exists())
            rc, selected = self.run_cli(state, 'select', '--indices', '1,2', '--out', str(output))
            self.assertEqual(rc, 0, selected)
            self.assertEqual(selected['success_count'], 2)
            self.assertTrue(all(x['format'] == 'flac' for x in selected['results']))
            rc, pl = self.run_cli(state, 'playlist', '--id', 'https://music.163.com/#/playlist?id=4444')
            self.assertEqual(rc, 0, pl)
            self.assertEqual(pl['count'], 2)
            self.assertFalse(pl['possibly_incomplete'])
            rc, batch = self.run_cli(state, 'playlist-download', '--id', '4444', '--yes', '--out', str(output))
            self.assertEqual(rc, 0, batch)
            self.assertEqual(batch['success_count'], 2)
            self.assertTrue(all(x['status'] == 'skipped_exists' for x in batch['results']))

    def test_lyric(self):
        with tempfile.TemporaryDirectory() as folder:
            rc, result = self.run_cli(Path(folder), 'lyric', '--id', '101')
            self.assertEqual(rc, 0)
            self.assertTrue(result['found'])
            self.assertIn('流星划过天空', result['lrc'])
            self.assertIn('A shooting star', result['translated_lrc'])

    def test_meting_plaintext_fallback_for_sixteen_song_ids(self):
        with tempfile.TemporaryDirectory() as folder:
            for sid in range(200,216):
                rc, result = self.run_cli(Path(folder), 'lyric', '--id', str(sid))
                self.assertEqual(rc,0, result)
                self.assertTrue(result['found'], result)
                self.assertIn('原始文本歌词',result['lrc'])
                self.assertIn('type=lrc',result['source'])

    def test_auto_single_download(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            rc, result = self.run_cli(home / 'state', 'search', '-q', '唯一', '--auto-single', '--out', str(home / 'downloads'))
            self.assertEqual(rc, 0, result)
            self.assertEqual(result['total'], 1)
            self.assertEqual(result['auto_download']['success_count'], 1)
            path = Path(result['auto_download']['results'][0]['path'])
            self.assertTrue(path.is_file())
            self.assertEqual(path.suffix, '.flac')


if __name__ == '__main__':
    unittest.main()
