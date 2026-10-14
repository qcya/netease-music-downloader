"""搜索时长：Meting 缺字段时批量查询详情，原始字段格式兼容。"""
from music_skill import MusicAPI, duration_seconds_from, parse_song_list


def test_duration_field_variants():
    assert duration_seconds_from({'dt': 245000}) == 245
    assert duration_seconds_from({'duration': 182000}) == 182
    assert duration_seconds_from({'duration': '03:42'}) == 222
    assert duration_seconds_from({'time': '04:15'}) == 255
    assert duration_seconds_from({'duration_seconds': '199'}) == 199
    assert duration_seconds_from({'length': 193000}) == 193
    assert duration_seconds_from({'duration_ms': 24000}) == 24
    assert duration_seconds_from({'duration': None}) == 0


def test_duration_parsing_direct_search_data():
    rows, _ = parse_song_list({'result': {'songs': [
        {'id': 1, 'name': 'A', 'duration': '03:14'},
        {'id': 2, 'name': 'B', 'time': 211000},
        {'id': 3, 'name': 'Too short', 'duration_seconds': 17},
    ]}})
    assert [t['duration_seconds'] for t in rows] == [194, 211]


def test_search_supplements_missing_duration_in_single_detail_request():
    api = MusicAPI.__new__(MusicAPI)
    api.bases = ['https://mock']
    requests = []
    def json(base, path, params):
        requests.append((path, params))
        if path == '/search':
            return {'result': {'songCount': 3, 'songs': [
                {'id': 101, 'name': '歌 A', 'artist': '甲'},
                {'id': 102, 'name': '歌 B', 'artist': '乙'},
                {'id': 103, 'name': '试听短音源', 'artist': '丙'},
            ]}}
        if path == '/song/detail':
            assert params['ids'] == '101,102,103'
            return {'songs': [
                {'id': 101, 'dt': 213000},
                {'id': 102, 'duration': 185000},
                {'id': 103, 'dt': 18000},
            ]}
    api.json = json
    result = api.search('测试', 40, 1)
    assert [s['duration_seconds'] for s in result['results']] == [213, 185]
    assert len([x for x in requests if x[0] == '/song/detail']) == 1


def test_search_keeps_missing_duration_when_detail_unavailable():
    api = MusicAPI.__new__(MusicAPI)
    api.bases = ['https://mock']
    api.json = lambda base, path, params: {'result': {'songs': [
        {'id': 900, 'name': '未标注时长', 'artists': '歌手'}
    ]}} if path == '/search' else None
    result = api.search('测试', 40, 1)
    assert result['results'][0]['duration_seconds'] == 0


def test_search_does_not_requery_known_durations():
    api = MusicAPI.__new__(MusicAPI)
    api.bases = ['https://mock']
    called = []
    def json(base, path, params):
        called.append(path)
        if path == '/search':
            return {'result': {'songs': [{'id': 200, 'name': '已知歌曲', 'dt': 167000}]}}
        raise AssertionError('No detail query expected')
    api.json = json
    assert api.search('已知', 40, 1)['results'][0]['duration_seconds'] == 167
    assert called == ['/search']
