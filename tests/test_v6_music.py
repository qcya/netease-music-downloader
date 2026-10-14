"""Targeted tests for v2.0 audio quality upgrades and incomplete responses."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'skill'/'scripts'))
import music_skill as m

class API:
    def __init__(self,content,declared=None,kind='lossless'):
        self.content=content
        self.declared=declared
        self.errors=[]
        self.kind=kind
    def audio_candidates(self,sid,quality):
        yield {'url':'https://m1.music.126.net/test.flac','source':'mock/song/url/v1','level':'lossless','requested_level':'lossless'}
    def request(self,url,params=None,stream=False):
        class Response:
            def __init__(self,content,declared):
                self.content=content
                self.headers={'Content-Type':'audio/flac'}
                if declared is not None:self.headers['Content-Length']=str(declared)
            def iter_content(self,chunk_size=65536):
                yield self.content
            def close(self):pass
        return Response(self.content,self.declared)

class V6MusicTests(unittest.TestCase):
    def test_existing_mp3_does_not_suppress_lossless_upgrade(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td)
            original=folder/'Song - Artist [123].mp3'
            original.write_bytes(b'ID3'+bytes(2400))
            api=API(b'fLaC'+bytes(3500),3504)
            song={'id':'123','name':'Song','artists':'Artist'}
            with patch.dict(os.environ,{'NETEASE_VERIFY_FFPROBE':'0'}):
                result=m.download_one(api,song,folder,'best')
            self.assertTrue(result['ok'],result)
            self.assertEqual(result['format'],'flac')
            self.assertTrue(Path(result['path']).exists())
            self.assertTrue(original.exists())
    def test_incomplete_audio_is_discarded(self):
        with tempfile.TemporaryDirectory() as td:
            api=API(b'fLaC'+bytes(3500),9999)
            candidate=next(api.audio_candidates('1','best'))
            result=m.fetch_audio(api,candidate,Path(td),'best')
            self.assertIsNone(result)
            self.assertFalse(list(Path(td).glob('*.part')))
            self.assertTrue(any('不完整' in e for e in api.errors))
    def test_preview_source_returns_candidate_address(self):
        api=API(b'',None)
        self.assertEqual(m.MusicAPI.preview_source(api,'123')['url'],'https://m1.music.126.net/test.flac')

if __name__=='__main__':unittest.main()
