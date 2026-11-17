"""Build-time only. Fetch the pinned multilingual tiny model, never at runtime."""
import hashlib,json,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REVISION='d90ca5fe260221311c53c58e660288d3deb8d356'
MODEL_SHA='dcb76c6586fc06cbdac6dd21f14cfd129cc4cdd9dce19bf4ffa62e59cbe6e6d1'
def download(destination=None):
    target=Path(destination or ROOT/'build/lyric-model');target.mkdir(parents=True,exist_ok=True)
    manifest={'repository':'Systran/faster-whisper-tiny','revision':REVISION,'files':{}}
    for name in ['config.json','model.bin','tokenizer.json','vocabulary.txt']:
        path=target/name
        if not path.exists() or (name=='model.bin' and hashlib.sha256(path.read_bytes()).hexdigest()!=MODEL_SHA):
            temp=path.with_suffix(path.suffix+'.part')
            url=f'https://huggingface.co/Systran/faster-whisper-tiny/resolve/{REVISION}/{name}'
            with urllib.request.urlopen(url,timeout=120) as response,temp.open('wb') as out:
                while chunk:=response.read(1024*1024):out.write(chunk)
            temp.replace(path)
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if name=='model.bin' and digest!=MODEL_SHA:raise RuntimeError('Model hash mismatch')
        manifest['files'][name]={'sha256':digest,'bytes':path.stat().st_size}
        print(name,path.stat().st_size,flush=True)
    (target/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    license_file=target/'LICENSE.txt'
    if not license_file.exists():
        with urllib.request.urlopen('https://raw.githubusercontent.com/openai/whisper/main/LICENSE',timeout=30) as response:license_file.write_bytes(response.read(20000))
    return target
if __name__=='__main__':download()
