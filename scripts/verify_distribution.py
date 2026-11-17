"""Verify the actual release ZIP and ASAR against source without opening user data."""
from pathlib import Path
import hashlib,json,struct,zipfile
ROOT=Path(__file__).resolve().parents[1]
package=json.loads((ROOT/'package.json').read_text(encoding='utf-8-sig'))
archive=ROOT/'dist'/f"青春沿岸の音乐播放器-{package['version']}-win64.zip"
asar=ROOT/'dist/win-unpacked/resources/app.asar'
with asar.open('rb') as stream:
    fields=struct.unpack('<4I',stream.read(16));header=json.loads(stream.read(fields[3]));start=8+fields[1]
    def item(name):
        node=header
        for part in name.split('/'):node=node['files'][part]
        return node
    names=[]
    for pattern in package['build']['files']:
        names.extend(p for p in ROOT.glob(pattern) if p.is_file())
    checked=0
    for source in names:
        name=source.relative_to(ROOT).as_posix()
        if name=='package.json':continue
        entry=item(name)
        if entry.get('unpacked'):content=Path(str(asar)+'.unpacked',name).read_bytes()
        else:stream.seek(start+int(entry['offset']));content=stream.read(entry['size'])
        assert content==source.read_bytes(),f'Shipped source differs: {name}'
        checked+=1
    assert 'fullscreen-kinetic.js' not in item('app')['files']
    assert 'charm.html' not in item('app')['files']
    assert 'vendor' not in item('app')['files']
    assert 'immersive-background-1080p.mp4' not in item('assets')['files']
with zipfile.ZipFile(archive) as z:
    names=z.namelist()
    assert '使用说明.txt' not in names
    for folder in ['下载','缓存','data','playlists']:
        assert not any(n.startswith(folder+'/') and not n.endswith('/') for n in names),folder
    assert not any(n.startswith(('歌单/','播放器数据/')) for n in names)
    for name in ['resources/app.asar','resources/backend/neutral_composition.dll']:
        assert z.read(name)==(ROOT/'dist/win-unpacked'/name).read_bytes()
    base='resources/backend/lyric-aligner/'
    assert base+'lyric-aligner.exe' in names and base+'_internal/python312.dll' in names
    manifest=json.loads(z.read(base+'model/manifest.json'))
    for name,info in manifest['files'].items():
        content=z.read(base+'model/'+name)
        assert len(content)==info['bytes'] and hashlib.sha256(content).hexdigest()==info['sha256'],name
    assert manifest['files']['model.bin']['sha256']=='dcb76c6586fc06cbdac6dd21f14cfd129cc4cdd9dce19bf4ffa62e59cbe6e6d1'
    assert base+'model/LICENSE.txt' in names
    endpoints=json.loads(z.read('resources/backend/muonium/endpoints.json'))
    assert endpoints==json.loads((ROOT/'upstream/muonium/endpoints.json').read_text(encoding='utf8'))
    assert '/weapi/playlist/remove' in endpoints['paths']
sha=hashlib.sha256(archive.read_bytes()).hexdigest()
Path(str(archive)+'.sha256').write_text(sha+'  '+archive.name+'\n',encoding='utf8')
print(json.dumps({'ok':True,'version':package['version'],'bytes':archive.stat().st_size,'sha256':sha,'sourcesMatch':checked,'modelHashesMatch':True,'noUserData':True}))
