"""检查 Windows CMD 脚本的实际文件字节，不依赖 Windows 来检查 CRLF。"""
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent


def test_batch_crlf_and_utf8_nobom():
    scripts = ['安装依赖.bat', '启动桌面版.bat', '构建Windows_EXE.bat']
    for script in scripts:
        data = (BASE / script).read_bytes()
        assert data.startswith(b'@echo off\r\n'), script
        assert b'\r\n' in data, script
        assert data.count(b'\n') == data.count(b'\r\n'), script
        assert data.count(b'\r') == data.count(b'\r\n'), script
        assert not data.startswith(b'\xef\xbb\xbf'), script
        assert b'\x00' not in data, script
        assert b'cd /d "%~dp0"\r\n' in data, script
        assert b'chcp 65001 >nul\r\n' in data, script


def test_build_rejects_missing_exe_and_verifies_icon():
    data = (BASE / '构建Windows_EXE.bat').read_bytes().decode('utf-8')
    assert 'if errorlevel 1 goto :failed' in data
    assert 'if not exist "dist\\MusicDownloader-1.3.0-portable.exe" goto :missing_exe' in data
    assert 'check_exe_icon.ps1' in data
    assert ':icon_error' in data
    # Windows PowerShell 5.1 needs BOM for UTF-8 Chinese script filenames.
    assert (BASE / 'check_exe_icon.ps1').read_bytes().startswith(b'\xef\xbb\xbf')


def test_install_mirror_and_binary_checks():
    data = (BASE / '安装依赖.bat').read_bytes().decode('utf-8')
    assert 'set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"' in data
    assert 'set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"' in data
    assert 'set "ELECTRON_MIRROR=https://mirrors.huaweicloud.com/electron/"' in data
    assert 'set "ELECTRON_CUSTOM_DIR={{ version }}"' in data
    assert 'if not exist "node_modules\\electron\\dist\\electron.exe" goto :binary_missing' in data
    assert 'call npm install --registry=https://registry.npmmirror.com/' in data

def test_packager_uses_v26_mirror():
    import json
    pack = json.loads((BASE / 'package.json').read_text(encoding='utf-8'))
    assert pack['devDependencies']['electron-builder'].startswith('^26.')
    assert pack['build']['electronDownload']['mirror'] == 'https://npmmirror.com/mirrors/electron/'
