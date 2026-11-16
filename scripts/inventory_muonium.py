"""Inventory the checked-in upstream NetEase endpoints, not invented features."""
from pathlib import Path
import re,json
BASE=Path(__file__).resolve().parents[1]/'upstream/muonium'
text=(BASE/'CloudMusicApi.java').read_text(encoding='utf-8')
api=(BASE/'src/com/muoniumplayer/core/music/source/MuNeteaseApi.java').read_text(encoding='utf-8')
paths=set(re.findall(r'"(/(?:weapi|api)/[^"?]+)"',text+api))
paths=sorted(set('/weapi/'+p[5:] if p.startswith('/api/') else p for p in paths))
paths=sorted(set(paths)|{'/weapi/search/suggest/web','/weapi/search/suggest/keyword','/weapi/playlist/subscribe','/weapi/playlist/unsubscribe','/weapi/djradio/sub','/weapi/djradio/unsub'})
methods=re.findall(r'public (?:static )?(?:RequestUtil.RequestAnswer|boolean|PlaylistTrackOperationResult) (\w+)\(',text)
data=dict(upstream_commit='9b4cc7e7bd143315da716075a6d024a0d4c0c81b',paths=paths,features=[dict(method=m,desktop_status='pending') for m in methods])
(BASE/'endpoints.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(paths)} original endpoints; {len(methods)} upstream API methods')
