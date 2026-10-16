"""Regression for GBK UnicodeEncodeError reported by Windows bundled backend."""
import io
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'skill' / 'scripts'))
import music_skill


class WindowsEncoding(unittest.TestCase):
    def test_json_output_accepts_unicode_with_gbk_strict_stdout(self):
        original = sys.stdout
        sink = io.BytesIO()
        stream = io.TextIOWrapper(sink, encoding='gbk', errors='strict')
        try:
            sys.stdout = stream
            music_skill.emit({'artist': 'Björk', 'title': '孤独 · 💙'})
            stream.flush()
        finally:
            sys.stdout = original
        self.assertEqual(json.loads(sink.getvalue().decode('ascii')),
                         {'artist': 'Björk', 'title': '孤独 · 💙'})

    def test_diagnostics_cannot_crash_in_gbk(self):
        original = sys.stderr
        sink = io.BytesIO()
        stream = io.TextIOWrapper(sink, encoding='gbk', errors='strict')
        try:
            sys.stderr = stream
            music_skill.warn('Björk — Music')
            stream.flush()
        finally:
            sys.stderr = original
        self.assertIn('\\xf6', sink.getvalue().decode('ascii'))

    def test_dev_launcher_forces_utf8(self):
        root = Path(__file__).resolve().parents[1]
        raw = (root / '启动桌面版.bat').read_bytes()
        self.assertIn(b'set "PYTHONIOENCODING=utf-8:backslashreplace"',raw)
        self.assertIn(b'set "PYTHONUTF8=1"',raw)
        self.assertIn(b'call npm start',raw)

    def test_build_workflow_release_once_and_manual(self):
        root = Path(__file__).resolve().parents[1]
        workflow = (root / '.github/workflows/windows-build.yml').read_text(encoding='utf-8')
        self.assertIn('workflow_dispatch:', workflow)
        self.assertIn('  push:', workflow)
        self.assertIn("      - '.github/workflows/windows-build.yml'", workflow)
        self.assertIn('  contents: write', workflow)
        self.assertIn('Publish GitHub Release v1.0.10', workflow)
        self.assertIn("if: github.event_name == 'push'", workflow)
        self.assertIn('MusicDownloader-1.0.10-portable.exe.sha256', workflow)
        self.assertIn('Run all regression tests', workflow)


if __name__ == '__main__':
    unittest.main()
