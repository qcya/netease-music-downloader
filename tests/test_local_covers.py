from unittest.mock import patch
from types import SimpleNamespace
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('music_local_covers',Path(__file__).resolve().parents[1]/'skill/scripts/music_skill.py')
music = importlib.util.module_from_spec(spec)
spec.loader.exec_module(music)

def test_embedded_art_accepts_bounded_real_image_types_and_skips_invalid():
    png=b'\x89PNG\r\n\x1a\n'+b'hello'
    tracks=[SimpleNamespace(pictures=[],tags={'cover':SimpleNamespace(data=png)}),
            SimpleNamespace(pictures=[SimpleNamespace(data=b'<svg>bad</svg>')],tags={}),
            SimpleNamespace(pictures=[SimpleNamespace(data=b'\xff\xd8\xff'+b'x'*(1024*1024))],tags={})]
    with patch('mutagen.File',side_effect=tracks):
        rows=music.embedded_covers(['one.mp3','two.flac','huge.mp3'])
    assert rows[0]['cover'].startswith('data:image/png;base64,')
    assert rows[1]['cover']=='' and rows[2]['cover']==''

def test_embedded_metadata_extracts_id3_and_common_tags():
    tracks=[SimpleNamespace(pictures=[],tags={'TIT2':SimpleNamespace(text=['标题']),'TPE1':SimpleNamespace(text=['歌手'])}),
            SimpleNamespace(pictures=[],tags={'title':['另一首'],'artist':['甲','乙']})]
    with patch('mutagen.File',side_effect=tracks):
        rows=music.embedded_covers(['one.mp3','two.flac'])
    assert (rows[0]['title'],rows[0]['artist'])==('标题','歌手')
    assert (rows[1]['title'],rows[1]['artist'])==('另一首','甲/乙')
