"""Генерирует PWA-иконки «Морского боя» без внешних ассетов.

Запуск:  python scripts/make-icons.py
Результат: assets/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
"""

import os
from PIL import Image, ImageDraw, ImageFilter

BASE = 1024          # рабочий размер
SS = 4               # суперсэмплинг для сглаживания
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets")

TOP = (23, 97, 143)      # #17618f
MID = (11, 50, 82)       # #0b3252
BOTTOM = (4, 16, 31)     # #04101f
AQUA = (79, 232, 255)
WAVE = (47, 216, 208)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def background(size):
    """Вертикальный градиент + мягкое свечение сверху."""
    small = Image.new("RGB", (8, 64))
    d = ImageDraw.Draw(small)
    for y in range(64):
        t = y / 63
        color = lerp(TOP, MID, t * 2) if t < 0.5 else lerp(MID, BOTTOM, (t - 0.5) * 2)
        d.line([(0, y), (7, y)], fill=color)
    bg = small.resize((size, size), Image.BICUBIC)

    # радиальное свечение в верхней трети
    glow = Image.radial_gradient("L").resize((size, size), Image.BICUBIC)
    glow = glow.point(lambda v: max(0, 190 - v))
    tint = Image.new("RGB", (size, size), AQUA)
    bg = Image.composite(Image.blend(bg, tint, 0.35), bg, glow)

    # волны у нижней кромки
    waves = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    wd = ImageDraw.Draw(waves)
    for i, r in enumerate((0.42, 0.55, 0.70)):
        cy = int(size * 1.02)
        rr = int(size * r)
        wd.arc([int(size / 2) - rr, cy - rr, int(size / 2) + rr, cy + rr],
               start=200, end=340, fill=WAVE + (34 - i * 8,), width=max(2, size // 110))
    return Image.alpha_composite(bg.convert("RGBA"), waves)


def anchor_mask(size, scale=1.0):
    """Маска якоря: кольцо, шток, шток-перекладина, рога и лапы."""
    s = size * SS * scale
    img = Image.new("L", (int(s), int(s)), 0)

    def pt(x, y):
        """Точка из сетки 1024 с центрированием и масштабом."""
        return ((x - 512) * scale + 512) * SS, ((y - 512) * scale + 512) * SS

    def w(v):
        return max(1, int(v * SS * scale))

    d = ImageDraw.Draw(img)

    # кольцо
    cx, cy = pt(512, 262)
    r = 84 * SS * scale
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=255, width=w(38))

    # шток
    d.line([pt(512, 316), pt(512, 806)], fill=255, width=w(46))
    d.ellipse([*[v - w(23) for v in pt(512, 806)], *[v + w(23) for v in pt(512, 806)]], fill=255)

    # перекладина
    d.line([pt(382, 404), pt(642, 404)], fill=255, width=w(40))
    for x in (382, 642):
        c = pt(x, 404)
        d.ellipse([c[0] - w(20), c[1] - w(20), c[0] + w(20), c[1] + w(20)], fill=255)

    # рога (нижняя дуга)
    cr = 214 * SS * scale
    ccx, ccy = pt(512, 700)
    d.arc([ccx - cr, ccy - cr, ccx + cr, ccy + cr], start=17, end=163, fill=255, width=w(46))

    # лапы
    d.line([pt(716, 764), pt(762, 700)], fill=255, width=w(42))
    d.line([pt(308, 764), pt(262, 700)], fill=255, width=w(42))
    for x, y in ((762, 700), (262, 700)):
        c = pt(x, y)
        d.ellipse([c[0] - w(21), c[1] - w(21), c[0] + w(21), c[1] + w(21)], fill=255)

    return img.resize((size, size), Image.LANCZOS)


def render(size, scale=1.0):
    bg = background(size)
    mask = anchor_mask(size, scale)

    # свечение
    glow = mask.filter(ImageFilter.GaussianBlur(size / 40)).point(lambda v: int(v * 0.55))
    tint = Image.new("RGBA", (size, size), AQUA + (255,))
    bg = Image.composite(tint, bg, glow)

    # сам якорь с лёгким вертикальным градиентом
    hl = Image.new("RGB", (1, 2))
    hl.putpixel((0, 0), (255, 255, 255))
    hl.putpixel((0, 1), (150, 226, 250))
    body = hl.resize((size, size), Image.BICUBIC).convert("RGBA")
    return Image.composite(body, bg, mask).convert("RGBA")


def main():
    os.makedirs(OUT, exist_ok=True)
    base = render(1024)
    base.save(os.path.join(OUT, "icon-1024.png"), optimize=True)

    # ресурсы для Capacitor: иконка приложения и splash-экран
    res = os.path.join(ROOT, "resources")
    os.makedirs(res, exist_ok=True)
    base.save(os.path.join(res, "icon.png"), optimize=True)

    splash = Image.new("RGBA", (2732, 2732), (4, 16, 31, 255))
    logo = base.resize((900, 900), Image.LANCZOS)
    splash.alpha_composite(logo, ((2732 - 900) // 2, (2732 - 900) // 2))
    splash.convert("RGB").save(os.path.join(res, "splash.png"), optimize=True)

    for name, size in (("icon-192.png", 192), ("icon-512.png", 512),
                       ("apple-touch-icon.png", 180), ("favicon-32.png", 32)):
        base.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)

    # maskable: контент в безопасной зоне (80%)
    render(512, 0.78).save(os.path.join(OUT, "icon-maskable-512.png"), optimize=True)
    print("готово:", ", ".join(sorted(os.listdir(OUT))))


if __name__ == "__main__":
    main()
