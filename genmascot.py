"""Generates the clean pixel-art mascot sprites for Claude Usage Pet.

Everything is drawn from rectangles on a small logical grid, then scaled up with
NEAREST so the result is crisp pixel art. Run:  python3 genmascot.py
"""
from PIL import Image
import os

OUT = os.path.join(os.path.dirname(__file__), 'renderer', 'assets')
os.makedirs(OUT, exist_ok=True)

CORAL = (241, 87, 61, 255)
EYE = (20, 16, 18, 255)
GRAY = (150, 156, 164, 255)
GRAY_D = (96, 102, 110, 255)
FLAME1 = (255, 196, 60, 255)
FLAME2 = (255, 120, 40, 255)
HEART = (255, 92, 120, 255)
TRANS = (0, 0, 0, 0)

# ---------------- mascot frames (grid 22x18, cell 132x114) ----------------
GW, GH, S = 22, 18, 6


def grid():
    return [[TRANS] * GW for _ in range(GH)]


def rect(g, x0, y0, x1, y1, col):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < GW and 0 <= y < GH:
                g[y][x] = col


def body(g):
    rect(g, 4, 1, 17, 12, CORAL)       # torso
    rect(g, 1, 6, 3, 9, CORAL)         # left arm
    rect(g, 18, 6, 20, 9, CORAL)       # right arm


def eyes(g, closed=False):
    if closed:
        rect(g, 7, 6, 9, 6, EYE)
        rect(g, 12, 6, 14, 6, EYE)
    else:
        rect(g, 7, 4, 9, 7, EYE)
        rect(g, 12, 4, 14, 7, EYE)


LEGS = [(5, 6), (8, 9), (12, 13), (15, 16)]


def legs(g, lifts):
    for (x0, x1), lift in zip(LEGS, lifts):
        rect(g, x0, 13, x1, 16 - (1 if lift else 0), CORAL)


def render(g, bob=0):
    img = Image.new('RGBA', (GW * S, (GH + 1) * S), TRANS)
    px = img.load()
    for y in range(GH):
        for x in range(GW):
            c = g[y][x]
            if c[3]:
                yy = y + bob + 1
                for dy in range(S):
                    for dx in range(S):
                        if 0 <= (yy * S + dy) < img.height:
                            px[x * S + dx, yy * S + dy] = c
    return img


def frame(lifts, bob=0, closed=False):
    g = grid()
    body(g)
    eyes(g, closed)
    legs(g, lifts)
    return render(g, bob)


def sit_frame():
    g = grid()
    body(g)
    eyes(g)
    rect(g, 6, 13, 8, 14, CORAL)       # tucked little feet
    rect(g, 13, 13, 15, 14, CORAL)
    return render(g, bob=2)


def sleep_frame():
    # sitting, eyes closed (flat lines) — Zzz is drawn in the DOM
    g = grid()
    body(g)
    rect(g, 7, 7, 9, 7, EYE)           # closed eyes, lower
    rect(g, 12, 7, 14, 7, EYE)
    rect(g, 6, 13, 8, 14, CORAL)
    rect(g, 13, 13, 15, 14, CORAL)
    return render(g, bob=2)


def eat_frame():
    # leaning forward, happy eyes + open chewing mouth
    g = grid()
    body(g)
    rect(g, 7, 5, 9, 6, EYE)           # smaller happy eyes
    rect(g, 12, 5, 14, 6, EYE)
    rect(g, 9, 9, 12, 11, EYE)         # open mouth (chewing)
    legs(g, [0, 1, 1, 0])
    return render(g, bob=-1)


walk = [frame([0, 1, 0, 1], 0), frame([0, 1, 0, 1], -1),
        frame([1, 0, 1, 0], 0), frame([1, 0, 1, 0], -1)]
idle = frame([0, 0, 0, 0], 0)
blink = frame([0, 0, 0, 0], 0, closed=True)
jump = frame([1, 1, 1, 1], -3)
sit = sit_frame()
sleep = sleep_frame()
eat = eat_frame()
# running: bigger gallop stride + bob for speed
run = [frame([1, 0, 0, 1], -1), frame([0, 1, 1, 0], 0)]

CW, CH = GW * S, (GH + 1) * S
# 0-3 walk,4 idle,5 blink,6 jump,7 sit,8 sleep,9 eat,10-11 run
frames = walk + [idle, blink, jump, sit, sleep, eat] + run
sheet = Image.new('RGBA', (CW * len(frames), CH), TRANS)
for i, f in enumerate(frames):
    sheet.paste(f, (i * CW, 0), f)
sheet.save(f'{OUT}/sprite.png')
print('sprite.png', sheet.size, len(frames), 'frames')

# ---------------- tray icon ----------------
ic = idle.crop(idle.getbbox())
w, h = ic.size
sc = min(34 / w, 34 / h)
ic = ic.resize((int(w * sc), int(h * sc)), Image.NEAREST)
canvas = Image.new('RGBA', (36, 36), TRANS)
canvas.paste(ic, ((36 - ic.width) // 2, (36 - ic.height) // 2), ic)
canvas.save(f'{OUT}/tray.png')

# ---------------- heart particle ----------------
HG, HS = 9, 4
hg = [[TRANS] * HG for _ in range(HG)]


def hrect(x0, y0, x1, y1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            hg[y][x] = HEART


hrect(1, 1, 3, 2); hrect(5, 1, 7, 2)       # two humps
hrect(0, 2, 8, 4)                          # body
hrect(1, 5, 7, 5); hrect(2, 6, 6, 6)       # taper
hrect(3, 7, 5, 7)
himg = Image.new('RGBA', (HG * HS, HG * HS), TRANS)
hp = himg.load()
for y in range(HG):
    for x in range(HG):
        if hg[y][x][3]:
            for dy in range(HS):
                for dx in range(HS):
                    hp[x * HS + dx, y * HS + dy] = HEART
himg.save(f'{OUT}/heart.png')

# ---------------- food (cookie) sprite ----------------
COOKIE = (198, 142, 86, 255)
CHIP = (90, 56, 30, 255)
FG, FS = 10, 4
fg = [[TRANS] * FG for _ in range(FG)]
for y in range(FG):
    for x in range(FG):
        dx, dy = x - 4.5, y - 4.5
        if dx * dx + dy * dy <= 21:
            fg[y][x] = COOKIE
for (cx, cy) in [(3, 3), (6, 4), (4, 6), (7, 7)]:
    fg[cy][cx] = CHIP
fimg = Image.new('RGBA', (FG * FS, FG * FS), TRANS)
fp = fimg.load()
for y in range(FG):
    for x in range(FG):
        if fg[y][x][3]:
            for dy in range(FS):
                for dx in range(FS):
                    fp[x * FS + dx, y * FS + dy] = fg[y][x]
fimg.save(f'{OUT}/food.png')

# ---------------- jet sprite (fly-across), 2 flame frames ----------------
JW, JH, JS = 44, 22, 6


def jrect(g, x0, y0, x1, y1, col):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < JW and 0 <= y < JH:
                g[y][x] = col


def jet_frame(big_flame):
    g = [[TRANS] * JW for _ in range(JH)]
    jrect(g, 10, 11, 32, 16, GRAY)        # rocket body (faces right)
    jrect(g, 10, 13, 34, 14, GRAY)        # nose taper
    jrect(g, 33, 13, 35, 14, GRAY_D)      # nose tip
    jrect(g, 11, 16, 16, 18, GRAY_D)      # tail fin
    jrect(g, 26, 16, 31, 18, GRAY_D)      # rear fin
    if big_flame:
        jrect(g, 3, 12, 9, 15, FLAME2); jrect(g, 0, 13, 5, 14, FLAME1)
    else:
        jrect(g, 5, 12, 9, 15, FLAME2); jrect(g, 3, 13, 6, 14, FLAME1)
    jrect(g, 15, 3, 28, 11, CORAL)        # mascot body
    jrect(g, 13, 6, 15, 9, CORAL); jrect(g, 28, 6, 30, 9, CORAL)  # arms
    jrect(g, 18, 5, 19, 7, EYE); jrect(g, 23, 5, 24, 7, EYE)      # eyes
    img = Image.new('RGBA', (JW * JS, JH * JS), TRANS)
    p = img.load()
    for y in range(JH):
        for x in range(JW):
            c = g[y][x]
            if c[3]:
                for dy in range(JS):
                    for dx in range(JS):
                        p[x * JS + dx, y * JS + dy] = c
    return img


jf = [jet_frame(False), jet_frame(True)]
jsheet = Image.new('RGBA', (JW * JS * 2, JH * JS), TRANS)
for i, f in enumerate(jf):
    jsheet.paste(f, (i * JW * JS, 0), f)
jsheet.save(f'{OUT}/jet.png')

# ---------------- bicycle sprite (ground ride), 2 wheel frames ----------------
import math as _m
BW, BH, BS = 42, 24, 6
TIRE = (40, 40, 46, 255)
RIM = (150, 156, 164, 255)
FRAME = (90, 150, 200, 255)  # blue bike frame (clearly a bicycle, not a motorbike)


def brect(g, x0, y0, x1, y1, col):
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            if 0 <= x < BW and 0 <= y < BH:
                g[y][x] = col


def line(g, x0, y0, x1, y1, col):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) or 1
    for i in range(n + 1):
        x = round(x0 + (x1 - x0) * i / n)
        y = round(y0 + (y1 - y0) * i / n)
        brect(g, x, y, x, y, col)


# A clear spoked wheel: dark tire ring (2px), light rim, hub, two crossed spokes.
def wheel(g, cx, cy, phase):
    r = 5
    for y in range(cy - r - 1, cy + r + 2):
        for x in range(cx - r - 1, cx + r + 2):
            d = (x - cx) ** 2 + (y - cy) ** 2
            if d <= r * r and d >= (r - 2) * (r - 2):
                brect(g, x, y, x, y, TIRE)      # tire band
    for k in range(2):
        a = _m.radians(phase * 45 + k * 90)
        line(g, cx - (r - 2) * _m.cos(a), cy - (r - 2) * _m.sin(a),
             cx + (r - 2) * _m.cos(a), cy + (r - 2) * _m.sin(a), RIM)  # spokes
    brect(g, cx - 1, cy - 1, cx, cy, TIRE)       # hub


def bike_frame(phase):
    g = [[TRANS] * BW for _ in range(BH)]
    rear, front, cy = 10, 32, 16   # wheel centers
    crank = (21, 17)
    wheel(g, rear, cy, phase)
    wheel(g, front, cy, phase)
    # diamond bicycle frame (thin tubes)
    line(g, rear, cy, crank[0], crank[1], FRAME)        # rear stay
    line(g, rear, cy, 20, 6, FRAME)                     # seat tube up
    line(g, crank[0], crank[1], 20, 6, FRAME)           # down tube
    line(g, crank[0], crank[1], 31, 7, FRAME)           # to head tube
    line(g, 20, 6, 31, 7, FRAME)                        # top tube
    line(g, 31, 7, front, cy, FRAME)                    # fork
    brect(g, 19, 5, 22, 6, FRAME)                       # seat
    brect(g, 30, 5, 34, 6, FRAME)                       # handlebars
    # pedals + crank (rotate opposite each other)
    pa = _m.radians(phase * 180)
    px1, py1 = crank[0] + round(3 * _m.cos(pa)), crank[1] + round(3 * _m.sin(pa))
    px2, py2 = crank[0] - round(3 * _m.cos(pa)), crank[1] - round(3 * _m.sin(pa))
    brect(g, px1 - 1, py1, px1 + 1, py1, (30, 30, 34, 255))
    brect(g, px2 - 1, py2, px2 + 1, py2, (30, 30, 34, 255))
    # mascot on the seat
    brect(g, 15, 0, 25, 6, CORAL)                       # body
    brect(g, 13, 2, 15, 4, CORAL); brect(g, 25, 2, 27, 4, CORAL)  # arms to bars
    brect(g, 17, 2, 18, 4, EYE); brect(g, 22, 2, 23, 4, EYE)      # eyes
    line(g, 19, 6, px1, py1 - 1, CORAL)                 # legs pedalling (follow pedals)
    line(g, 22, 6, px2, py2 - 1, CORAL)
    img = Image.new('RGBA', (BW * BS, BH * BS), TRANS)
    p = img.load()
    for y in range(BH):
        for x in range(BW):
            c = g[y][x]
            if c[3]:
                for dy in range(BS):
                    for dx in range(BS):
                        p[x * BS + dx, y * BS + dy] = c
    return img


bf = [bike_frame(0), bike_frame(1)]
bsheet = Image.new('RGBA', (BW * BS * 2, BH * BS), TRANS)
for i, f in enumerate(bf):
    bsheet.paste(f, (i * BW * BS, 0), f)
bsheet.save(f'{OUT}/bike.png')
print('jet.png', jsheet.size, '| bike.png', bsheet.size, '| heart/food/tray ok')

# ---------------- preview ----------------
prev = Image.new('RGB', (CW * len(frames), CH + JH * JS + 8), (245, 239, 230))
for i, f in enumerate(frames):
    prev.paste(f, (i * CW, 0), f)
prev.paste(jf[1], (0, CH + 8), jf[1])
prev.paste(himg, (JW * JS + 20, CH + 8), himg)
prev.save('/tmp/preview2.png')
print('preview saved')
