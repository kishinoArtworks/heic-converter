# アプリアイコン・OGP画像を生成する（PIL使用、UTF-8）
from PIL import Image, ImageDraw, ImageFont
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public')

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

C1, C2 = (139, 92, 246), (168, 85, 247)   # --primary → #a855f7
BG1, BG2 = (15, 23, 42), (30, 27, 75)     # 背景グラデ

def gradient(size, c1, c2):
    w, h = size
    img = Image.new('RGB', size)
    px = img.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = lerp(c1, c2, (x + y) / (w + h))
    return img

def icon(size, pad_ratio=0.0):
    s = size
    base = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    grad = gradient((s, s), C1, C2).convert('RGBA')
    mask = Image.new('L', (s, s), 0)
    r = int(s * 0.22)
    p = int(s * pad_ratio)
    ImageDraw.Draw(mask).rounded_rectangle([p, p, s - 1 - p, s - 1 - p], radius=r, fill=255)
    base.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(base)
    # lucide "image" 風のグリフ（白）
    u = s / 24
    lw = max(2, int(u * 1.6))
    d.rounded_rectangle([5 * u, 5 * u, 19 * u, 19 * u], radius=int(1.5 * u), outline='white', width=lw)
    d.ellipse([8 * u, 8 * u, 11 * u, 11 * u], outline='white', width=lw)
    pts = [(19 * u, 14.5 * u), (16 * u, 11.5 * u), (7 * u, 19 * u)]
    d.line(pts, fill='white', width=lw, joint='curve')
    return base

for n in (192, 512):
    icon(n).save(os.path.join(OUT, f'icon-{n}.png'))
icon(512, 0.1).save(os.path.join(OUT, 'icon-512-maskable.png'))
icon(180).save(os.path.join(OUT, 'apple-touch-icon.png'))

# OGP 1200x630
W, H = 1200, 630
og = gradient((W, H), BG1, BG2).convert('RGBA')
ic = icon(220)
og.paste(ic, (90, 205), ic)
d = ImageDraw.Draw(og)
font_b = ImageFont.truetype('C:/Windows/Fonts/YuGothB.ttc', 72)
font_m = ImageFont.truetype('C:/Windows/Fonts/YuGothM.ttc', 34)
font_s = ImageFont.truetype('C:/Windows/Fonts/YuGothM.ttc', 26)
d.text((360, 175), 'HEIC → JPG / PNG', font=font_b, fill='white')
d.text((360, 265), 'iPhone写真を一括変換', font=font_b, fill=(196, 181, 253))
d.text((360, 380), 'ブラウザの中だけで変換。', font=font_m, fill=(226, 232, 240))
d.text((360, 428), '画像はどこにも送信されません。', font=font_m, fill=(226, 232, 240))
d.text((360, 500), 'インストール不要・無料・Windows / Mac / iPhone', font=font_s, fill=(148, 163, 184))
og.convert('RGB').save(os.path.join(OUT, 'og-image.png'), optimize=True)
print('ok')
