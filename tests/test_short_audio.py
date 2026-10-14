"""Reject actual 20-second stream previews, not merely 20-second metadata."""
import tempfile
import wave
from pathlib import Path
from music_skill import parse_track, is_truncated_trial, verified_audio_duration


def test_metadata_filter():
    assert parse_track({'id': '1', 'name': 'too short', 'dt': 19000}) is None
    assert parse_track({'id': '2', 'name': 'complete', 'dt': 240000})['duration_seconds'] == 240


def test_actual_wave_length_identifies_short_preview():
    with tempfile.TemporaryDirectory() as d:
        p=Path(d)/'sample.wav'
        with wave.open(str(p),'wb') as w:
            w.setnchannels(1);w.setsampwidth(1);w.setframerate(8000)
            w.writeframes(b'\x80'*(8000*5))
        actual=verified_audio_duration(p,'wav')
        assert actual is not None and 4.9 < actual < 5.1
        assert is_truncated_trial(240,actual)
        assert not is_truncated_trial(240,240)
