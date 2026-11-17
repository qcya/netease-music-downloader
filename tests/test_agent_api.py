"""Exercise the actual HTTP broker and real CLI subprocesses against our own audio."""
import json,sys,tempfile,threading,urllib.request,urllib.error,time,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'skill/scripts'))
from test_integration_cli import MusicStub
from http.server import ThreadingHTTPServer

class AgentAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream=ThreadingHTTPServer(('127.0.0.1',0),MusicStub)
        threading.Thread(target=cls.upstream.serve_forever,daemon=True).start()
    @classmethod
    def tearDownClass(cls):cls.upstream.shutdown();cls.upstream.server_close()
    def test_real_search_download_authorization_and_shutdown(self):
        from agent_api import create_server,run_server
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);server=create_server(port=0,state_dir=root/'state',out_dir=root/'下载',api_bases=[f'http://127.0.0.1:{self.upstream.server_port}'],request_timeout=2)
            thread=threading.Thread(target=run_server,args=(server,30),daemon=True);thread.start()
            def request(route,data=None,auth=True,extra=None):
                headers={'Authorization':'Bearer '+server.token} if auth else {}
                headers.update(extra or {})
                if data is not None:headers['Content-Type']='application/json'
                req=urllib.request.Request(f'http://127.0.0.1:{server.server_port}'+route,data=None if data is None else json.dumps(data).encode(),headers=headers)
                try:
                    with urllib.request.urlopen(req,timeout=30) as response:return response.status,json.load(response)
                except urllib.error.HTTPError as e:return e.code,json.load(e)
            self.assertEqual(request('/health',auth=False)[0],401)
            self.assertEqual(request('/health',extra={'Origin':'https://example.invalid'})[0],403)
            self.assertEqual(request('/health',extra={'Host':'attacker.invalid'})[0],403)
            self.assertTrue(request('/health')[1]['ok'])
            result=request('/search',{'query':'多个','limit':2})[1]
            self.assertTrue(result['ok']);self.assertEqual(result['results'][1]['artists'],'Björk')
            self.assertFalse((root/'下载').exists(),'a search must not create downloads')
            self.assertEqual(request('/search',{'query':'多个','auto_single':True})[0],400)
            result=request('/download',{'ids':['101'],'quality':'lossless'})[1]
            self.assertTrue(result['ok']);self.assertEqual(result['success_count'],1)
            audio=Path(result['results'][0]['path']);self.assertTrue(audio.is_file());self.assertEqual(audio.parent.resolve(),(root/'下载').resolve());self.assertEqual(audio.read_bytes()[:4],b'fLaC')
            self.assertEqual(request('/playlist-download',{'id':'123'})[0],400)
            self.assertEqual(request('/unknown',{})[0],404)
            self.assertEqual(request('/shutdown',{})[0],200);thread.join(5);self.assertFalse(thread.is_alive())
    def test_idle_exit_removes_connection_file_and_port_is_loopback_only(self):
        from agent_api import create_server,run_server,write_connection
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);server=create_server(port=0,state_dir=root,out_dir=root/'downloads',api_bases=[],request_timeout=2)
            file=write_connection(server,root/'connection.json')
            data=json.loads(file.read_text());self.assertEqual(data['url'],f'http://127.0.0.1:{server.server_port}');self.assertEqual(data['token'],server.token)
            self.assertEqual(server.server_address[0],'127.0.0.1')
            run_server(server,.15,connection_file=file);self.assertFalse(file.exists())
            self.assertGreaterEqual(len(server.token),32)

if __name__=='__main__':unittest.main()
