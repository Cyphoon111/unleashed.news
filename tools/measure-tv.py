#!/usr/bin/env python3
"""Measures a green-screen TV frame for tools/render-tv.sh: the set is everything that is not white, the screen is
the green. Usage: ffmpeg -ss 5 -i clip.mov -frames:v 1 -vf scale=iw/2:ih/2 -pix_fmt rgb24 frame.ppm, then
tools/measure-tv.py frame.ppm 2   (the second argument is the scale the frame was reduced by)."""
import re, sys
path, scale = sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
b = open(path, 'rb').read()
m = re.match(rb'P6\s+(\d+)\s+(\d+)\s+(\d+)\s', b)
w, h, d = int(m[1]), int(m[2]), b[m.end():]
def px(x, y):
    i = (y * w + x) * 3
    return d[i], d[i + 1], d[i + 2]
def bbox(test, minrun=12):
    rows = [y for y in range(h) if sum(1 for x in range(w) if test(*px(x, y))) > minrun]
    cols = [x for x in range(w) if sum(1 for y in range(h) if test(*px(x, y))) > minrun]
    return [min(cols), min(rows), max(cols), max(rows)]
white = lambda r, g, b: r > 240 and g > 240 and b > 240
green = lambda r, g, b: g > 170 and r < 150 and b < 150
tv = [round(v * scale) for v in bbox(lambda r, g, b: not white(r, g, b))]
sc = [round(v * scale) for v in bbox(green)]
x0, y0, x1, y1 = tv
print(f'SET_W={x1 - x0 + 1}; SET_H={y1 - y0 + 1}; SET_X={x0}; SET_Y={y0}')
print(f'SCR_W={sc[2] - sc[0] + 1}; SCR_H={sc[3] - sc[1] + 1}; SCR_X={sc[0] - x0}; SCR_Y={sc[1] - y0}')
