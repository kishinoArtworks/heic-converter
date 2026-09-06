# HC_icon.png（kishino作）から各サイズのアイコン・OGP画像・Windows用icoを生成する（PIL使用、UTF-8）
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'HC_icon.png')
PUB = os.path.join(ROOT, 'public')
BUILD = os.path.join(ROOT, 'build')
os.makedirs(BUILD, exist_ok=True)

APP_NAME = 'iPhone写真変換'
BG1, BG2 = (15, 23, 42), (30, 27, 75)  # OGP背景グラデ

src = Image.open(SRC).convert('RGBA')
if src.size != (512, 512):
    src = src.resize((512, 512), Image.LANCZOS)

# アイコンの中心付近の色（角の塗り足し用）
cx, cy = src.size[0] // 2, src.size[1] // 2
avg = src.crop((cx - 40, cy - 40, cx + 40, cy + 40)).resize((1, 1), Image.BOX).getpixel((0, 0))[:3]

def resized(n):
    return src.resize((n, n), Image.LANCZOS)

def on_solid(n, scale=1.0):
    """透明の角を単色で埋めた正方形（iOS用・maskable用）"""
    base = Image.new('RGBA', (n, n), avg + (255,))
    inner = int(n * scale)
    ic = src.resize((inner, inner), Image.LANCZOS)
    off = (n - inner) // 2
    base.paste(ic, (off, off), ic)
    return base

# PWA / ブラウザ用
resized(192).save(os.path.join(PUB, 'icon-192.png'))
resized(512).save(os.path.join(PUB, 'icon-512.png'))
on_solid(512, 0.8).save(os.path.join(PUB, 'icon-512-maskable.png'))
on_solid(180).save(os.path.join(PUB, 'apple-touch-icon.png'))
resized(64).save(os.path.join(PUB, 'favicon.png'))

# Windows（electron-builder）用
resized(512).save(os.path.join(BUILD, 'icon.png'))
resized(256).save(os.path.join(BUILD, 'icon.ico'), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])

# OGP 1200x630
def gradient(size, c1, c2):
    w, h = size
    img = Image.new('RGB', size)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x + y) / (w + h)
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return img

W, H = 1200, 630
og = gradient((W, H), BG1, BG2).convert('RGBA')
ic = resized(220)
og.paste(ic, (90, 205), ic)
d = ImageDraw.Draw(og)
font_b = ImageFont.truetype('C:/Windows/Fonts/YuGothB.ttc', 72)
font_m = ImageFont.truetype('C:/Windows/Fonts/YuGothM.ttc', 34)
font_s = ImageFont.truetype('C:/Windows/Fonts/YuGothM.ttc', 26)
font_b2 = ImageFont.truetype('C:/Windows/Fonts/YuGothB.ttc', 56)
d.text((360, 175), APP_NAME, font=font_b, fill='white')
d.text((360, 272), 'HEIC → JPG / PNG / WebP', font=font_b2, fill=(196, 181, 253))
d.text((360, 380), 'ブラウザの中だけで一括変換。', font=font_m, fill=(226, 232, 240))
d.text((360, 428), '画像はどこにも送信されません。', font=font_m, fill=(226, 232, 240))
d.text((360, 500), 'インストール不要・無料・Windows / Mac / iPhone', font=font_s, fill=(148, 163, 184))
og.convert('RGB').save(os.path.join(PUB, 'og-image.png'), optimize=True)
print('ok', avg)
