#!/usr/bin/env python3
"""Build Windows-only backend executable for the single-file Electron portable distribution."""
from __future__ import annotations
import importlib.util
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "backend" / "music_backend.exe"

def main() -> int:
    if os.name != "nt":
        print("[ERROR] PyInstaller backend must be built on Windows. Run this script on Windows or use GitHub Actions.", file=sys.stderr)
        return 2
    if importlib.util.find_spec("PyInstaller") is None:
        print("[INFO] Installing Windows backend build dependency (PyInstaller)...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(ROOT / "skill" / "requirements-build.txt")], check=True)
    if importlib.util.find_spec("requests") is None:
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(ROOT / "skill" / "requirements.txt")], check=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    work = ROOT / "build" / "pyinstaller"
    command = [sys.executable, "-m", "PyInstaller", "--onefile", "--noconfirm", "--clean",
               "--name", "music_backend", "--distpath", str(OUTPUT.parent),
               "--workpath", str(work), "--specpath", str(work),
               str(ROOT / "skill" / "scripts" / "music_skill.py")]
    subprocess.run(command, check=True, cwd=ROOT)
    if not OUTPUT.is_file() or OUTPUT.stat().st_size < 100_000:
        raise RuntimeError("PyInstaller did not produce a valid music_backend.exe")
    # No network needed for this health check; essential for offline portable verification.
    check = subprocess.run([str(OUTPUT), "--runtime-info"], check=True,
                           capture_output=True, text=True, encoding="utf-8", timeout=45)
    import json
    info = json.loads(check.stdout)
    if not info.get("ok") or not info.get("embedded"):
        raise RuntimeError("Embedded backend self-check failed: " + check.stdout[-500:])
    print(f"[OK] Bundled Python backend: {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (subprocess.CalledProcessError, RuntimeError, TimeoutError) as e:
        print(f"[ERROR] Windows backend build failed: {e}", file=sys.stderr)
        raise SystemExit(1)
