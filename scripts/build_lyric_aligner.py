"""Bundle a self-contained CPU aligner and real model beside the player."""
import importlib.metadata,json,os,shutil,subprocess,sys,venv
from pathlib import Path
from download_lyric_model import download
ROOT=Path(__file__).resolve().parents[1]
def main():
    model=download()
    python=ROOT/'.validation/align-venv/Scripts/python.exe'
    if not python.exists():
        env=ROOT/'build/lyric-venv'
        if not (env/'Scripts/python.exe').exists():venv.create(env,with_pip=True)
        python=env/'Scripts/python.exe'
        subprocess.run([str(python),'-m','pip','install','-r',str(ROOT/'lyric_model/requirements.txt')],check=True)
    subprocess.run([str(python),'-m','PyInstaller','--noconfirm','--clean','--onedir','--console','--name','lyric-aligner','--distpath',str(ROOT/'backend'),'--workpath',str(ROOT/'build/lyric-aligner'),'--specpath',str(ROOT/'build'),'--collect-all','ctranslate2','--collect-all','faster_whisper','--collect-all','tokenizers','--collect-all','av',str(ROOT/'lyric_model/align.py')],cwd=ROOT,check=True)
    target=ROOT/'backend/lyric-aligner';shutil.copytree(model,target/'model',dirs_exist_ok=True)
    notices='''Offline lyric alignment runtime

Whisper tiny model: OpenAI, MIT License.
CTranslate2 conversion: SYSTRAN/faster-whisper-tiny, MIT License.
https://huggingface.co/Systran/faster-whisper-tiny
https://github.com/openai/whisper
faster-whisper and CTranslate2: SYSTRAN, MIT License.
https://github.com/SYSTRAN/faster-whisper
https://github.com/OpenNMT/CTranslate2
PyAV: BSD-3-Clause; bundled FFmpeg libraries: LGPL.
NumPy: BSD-3-Clause. Hugging Face tokenizers: Apache-2.0.
PyInstaller: GPL with the bootloader distribution exception.

All model downloads happen during the build. Runtime inference is offline.
'''
    # Preserve complete distribution license texts for the bundled dependencies.
    collect="import importlib.metadata as m,json; print(json.dumps({d.metadata['Name']:str(d.locate_file('')) for d in m.distributions()}))"
    packages=json.loads(subprocess.check_output([str(python),'-c',collect],text=True))
    site=python.parents[1]/'Lib/site-packages';licenses=target/'licenses';licenses.mkdir(exist_ok=True)
    for directory in site.glob('*.dist-info'):
        for file in directory.rglob('*'):
            if file.is_file() and any(tag in file.name.lower() for tag in ('license','copying','notice')):
                destination=licenses/directory.name/file.relative_to(directory);destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,destination)
    (target/'THIRD_PARTY_NOTICES.txt').write_text(notices,encoding='utf8')
    print('Bundled aligner and model:',target)
if __name__=='__main__':main()
