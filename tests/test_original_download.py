import io,json,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import music_skill as m

class Response:
    status_code=200
    def __init__(self,redirect=None):
        self.content=b'fLaC'+bytes(4092)
        self.headers={'Content-Length':str(len(self.content))}
        if redirect:self.status_code=302;self.headers={'Location':redirect}
    def iter_content(self,chunk_size=65536):yield self.content
    def close(self):pass
    def raise_for_status(self):pass

def execute(tmp_path,response):
    data={'song':{'id':'1356248072','name':'测试曲','artists':'测试','duration_seconds':180},'url':'https://m1.music.126.net/test.flac','level':'lossless'}
    output=io.StringIO()
    with patch.object(sys,'stdin',io.StringIO(json.dumps(data))),patch.object(sys,'stdout',output),patch.object(m.requests.Session,'get',return_value=response) as get,patch.object(m,'verified_audio_duration',return_value=180):
        code=m.main(['download-source','--out',str(tmp_path),'--quality','lossless'])
    return code,json.loads(output.getvalue()),get

def test_original_source_is_verified_before_save(tmp_path):
    code,data,get=execute(tmp_path,Response())
    assert code==0 and data['results'][0]['format']=='flac'
    assert Path(data['results'][0]['path']).exists()
    assert get.call_args.kwargs['allow_redirects'] is False
    assert 'cookies' not in get.call_args.kwargs

def test_original_source_cannot_redirect_to_arbitrary_server(tmp_path):
    code,data,get=execute(tmp_path,Response('https://other.example/private'))
    assert code==1 and not data['ok']
    assert get.call_count==1
    assert not list(tmp_path.glob('*.flac'))
