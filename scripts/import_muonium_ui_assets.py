"""Copy exact upstream icon assets, with source attribution and hashes."""
from pathlib import Path
import argparse,hashlib,json,shutil
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('upstream',type=Path,help='Local checkout of MuoniumPlayer-multiversion at the recorded commit')
source=parser.parse_args().upstream/'muonium-common/src/main/resources/muonium'
target=root/'assets/muonium'
target.mkdir(exist_ok=True)
names=['fonts/icomoon.ttf','fonts/music.ttf','fonts/player-action-icons.ttf','fonts/player-queue-icons.ttf','fonts/fontello.ttf','textures/player/icons/play-mode-sequential.png','textures/player/icons/play-mode-random.png','textures/player/icons/play-mode-single-loop.png','textures/player/icons/playlist.png','textures/player/icons/favorite.png','textures/player/icons/history.png','textures/player/icons/personal-fm.png']
manifest={}
for name in names:
    src=source/name;dest=target/src.name;shutil.copy2(src,dest);manifest[dest.name]={'upstream':name,'sha256':hashlib.sha256(src.read_bytes()).hexdigest()}
for name in ['LICENSE','NOTICE']:
    shutil.copy2(root/'app/vendor/muonium'/name,target/name)
(target/'sources.json').write_text(json.dumps({'commit':'9b4cc7e7bd143315da716075a6d024a0d4c0c81b','assets':manifest},indent=2),encoding='utf-8')
print(f'Imported {len(manifest)} original UI assets')
