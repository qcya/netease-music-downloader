import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CLI=ROOT/'skill'/'scripts'/'music_skill.py'

class SelfCheck(unittest.TestCase):
    def command(self,arg):
        r=subprocess.run([sys.executable,str(CLI),arg],capture_output=True,text=True,timeout=10)
        self.assertEqual(r.returncode,0,r.stderr)
        return json.loads(r.stdout)
    def test_runtime_info_offline(self):
        d=self.command('--runtime-info')
        self.assertTrue(d['ok'])
        self.assertIn('requests',d)
    def test_capabilities_offline(self):
        d=self.command('--capabilities')
        self.assertEqual(d['schema_version'],1)
        self.assertIn('lyric',d['commands'])
        self.assertIn('download',d['commands'])
