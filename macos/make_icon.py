"""Render the BrainBook app icon (Vice City sunset) as a 1024px PNG."""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bg = Image.new("RGBA", (S, S))
d = ImageDraw.Draw(bg)
top, mid, bot = (18, 6, 31), (122, 28, 96), (255, 122, 69)
for y in range(S):
    t = y / S
    a, b, k = (top, mid, t / 0.6) if t < 0.6 else (mid, bot, (t - 0.6) / 0.4)
    d.line([(0, y), (S, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3)) + (255,))

# Striped sun
sun = Image.new("RGBA", (S, S), (0, 0, 0, 0))
sd = ImageDraw.Draw(sun)
cx, cy, r = S // 2, 560, 300
for y in range(cy - r, cy + r):
    t = (y - (cy - r)) / (2 * r)
    col = tuple(int(c) for c in ((255, 230, 109) if t < 0.4 else (255, 79 + int(100 * (1 - t)), 163 - int(60 * (1 - t))))) + (255,)
    band = y > cy - 20 and ((y - cy) // 26) % 2 == 1
    if band:
        continue
    half = int((r * r - (y - cy) ** 2) ** 0.5)
    sd.line([(cx - half, y), (cx + half, y)], fill=col)
glow = sun.filter(ImageFilter.GaussianBlur(40))
bg = Image.alpha_composite(bg, glow)
bg = Image.alpha_composite(bg, sun)

# Neon grid floor
grid = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(grid)
horizon = 700
gd.rectangle([0, horizon, S, S], fill=(24, 6, 40, 255))
for i in range(-12, 13):
    gd.line([(cx + i * 30, horizon), (cx + i * 170, S)], fill=(255, 79, 163, 220), width=4)
y, step = horizon, 14
while y < S:
    gd.line([(0, y), (S, y)], fill=(43, 232, 217, 220), width=4)
    y += step
    step *= 1.35
bg = Image.alpha_composite(bg, grid)

# Neon "A"
txt = Image.new("RGBA", (S, S), (0, 0, 0, 0))
td = ImageDraw.Draw(txt)
font = None
for path in ("/System/Library/Fonts/Supplemental/SnellRoundhand.ttc", "/System/Library/Fonts/Supplemental/Brush Script.ttf"):
    try:
        font = ImageFont.truetype(path, 560, index=1) if path.endswith("ttc") else ImageFont.truetype(path, 560)
        break
    except Exception:
        continue
font = font or ImageFont.load_default()
td.text((cx, 470), "A", font=font, anchor="mm", fill=(255, 255, 255, 255))
neon = Image.new("RGBA", (S, S), (255, 79, 163, 0))
neon.putalpha(txt.getchannel("A").filter(ImageFilter.GaussianBlur(22)))
bg = Image.alpha_composite(bg, neon)
bg = Image.alpha_composite(bg, neon)
core = Image.new("RGBA", (S, S), (255, 214, 240, 0))
core.putalpha(txt.getchannel("A"))
bg = Image.alpha_composite(bg, core)

# macOS squircle mask with margin
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([100, 100, S - 100, S - 100], radius=185, fill=255)
bg = bg.resize((S - 200, S - 200), Image.LANCZOS)
img.paste(bg, (100, 100))
img.putalpha(mask)
img.save(sys.argv[1])
