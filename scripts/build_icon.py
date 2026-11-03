"""Build the geometric Orbit icon without external imaging dependencies."""
from pathlib import Path
import math, struct, zlib

size = 256
lines = [((128, 47), (66, 151)), ((66, 151), (128, 210)),
         ((128, 210), (190, 151)), ((190, 151), (128, 47)),
         ((128, 47), (128, 210)), ((66, 151), (128, 117)),
         ((128, 117), (190, 151))]

def distance(x, y, a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]
    t = max(0, min(1, ((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
    return math.hypot(x-a[0]-t*dx, y-a[1]-t*dy)

raw = bytearray()
for y in range(size):
    raw.append(0)
    for x in range(size):
        corner = math.hypot(max(abs(x-127.5)-84, 0), max(abs(y-127.5)-84, 0))
        alpha = max(0, min(1, 42-corner))
        d = min(distance(x,y,a,b) for a,b in lines)
        ring = abs(math.hypot(x-128,y-128)-105)
        glow = math.exp(-d*d/230)*.22
        edge = max(0, min(1, 2.1-d))
        orbit = max(0, min(1, 1.2-ring))*.35
        blend = max(edge, glow, orbit)
        color = [int(a+(b-a)*blend) for a,b in zip((17,37,52),(182,239,245))]
        raw.extend((*color, round(255*alpha)))

def chunk(kind, data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)

png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
root=Path(__file__).resolve().parents[1]/'assets'
(root/'app.ico').write_bytes(struct.pack('<HHH',0,1,1)+struct.pack('<BBBBHHII',0,0,0,0,1,32,len(png),22)+png)
