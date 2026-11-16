"""Build the upstream NetEase implementation without Minecraft dependencies."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'upstream/muonium'
GSON=BASE/'lib/gson-2.11.0.jar'
EXPECTED='57928d6e5a6edeb2abd3770a8f95ba44dce45f3b23b7a9dc2b309c581552a78b'
if hashlib.sha256(GSON.read_bytes()).hexdigest()!=EXPECTED:
    raise RuntimeError('Gson artifact checksum mismatch')
OUT=ROOT/'backend/muonium'
CLASSES=ROOT/'build/muonium-classes'
CLASSES.mkdir(parents=True,exist_ok=True)
OUT.mkdir(parents=True,exist_ok=True)
sources=[str(p) for p in (BASE/'src').rglob('*.java')]+[str(BASE/'DesktopWorker.java')]
LOMBOK=BASE/'lib/lombok-1.18.42.jar'
LANG=BASE/'lib/commons-lang3-3.18.0.jar'
for artifact,expected in [(LOMBOK,'3488a4e9994c26596baaceebee58cad36a50e3bdaec5be72b5834d3c3b560306'),(LANG,'4eeeae8d20c078abb64b015ec158add383ac581571cddc45c68f0c9ae0230720')]:
    if hashlib.sha256(artifact.read_bytes()).hexdigest()!=expected:
        raise RuntimeError(f'{artifact.name} artifact checksum mismatch')
subprocess.run(['javac','--release','17','-encoding','UTF-8','-cp',';'.join(map(str,[GSON,LOMBOK,LANG])),'-processorpath',str(LOMBOK),'-d',str(CLASSES),*sources],check=True)
subprocess.run(['jar','--create','--file',str(OUT/'muonium-netease.jar'),'-C',str(CLASSES),'.'],check=True)
shutil.copy2(GSON,OUT/GSON.name)
shutil.copy2(LANG,OUT/LANG.name)
shutil.copy2(BASE/'endpoints.json',OUT/'endpoints.json')
for name in ['LICENSE','NOTICE','DESKTOP-NOTICE.md']:
    shutil.copy2(BASE/name,OUT/name)
if not (OUT/'runtime/bin/java.exe').exists():
    subprocess.run(['jlink','--add-modules','java.base,java.logging,java.sql,jdk.crypto.ec','--strip-debug','--no-header-files','--no-man-pages','--output',str(OUT/'runtime')],check=True)
print('Built original Muonium NetEase Java API + desktop pipe adapter')
