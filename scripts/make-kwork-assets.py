#!/usr/bin/env python3
"""Материалы профиля Kwork: аватар и шапка.

Рисуются кодом (Pillow), без внешних картинок и шрифтов из репозитория —
в `assets/fonts` только woff2, который Pillow не читает, поэтому берём
системный Arial Bold.

Запуск: python scripts/make-kwork-assets.py
Результат: dist/kwork/avatar-512.png, dist/kwork/header-1200.png
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "kwork"

NAVY_LIGHT = (11, 36, 56)
NAVY_DARK = (7, 26, 43)
TEAL = (61, 218, 215)
WHITE = (233, 246, 250)

FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT_REG = "C:/Windows/Fonts/arial.ttf"


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def radial_background(size, inner=NAVY_LIGHT, outer=NAVY_DARK, steps=64):
    """Радиальный градиент: рисуем маленьким и растягиваем — так без шума."""
    small = Image.new("RGB", (steps, steps))
    px = small.load()
    c = (steps - 1) / 2
    reach = steps * 0.72
    for y in range(steps):
        for x in range(steps):
            d = min(1.0, (((x - c) ** 2 + (y - c) ** 2) ** 0.5) / reach)
            px[x, y] = lerp(inner, outer, d ** 0.85)
    return small.resize((size, size), Image.LANCZOS).convert("RGBA")


def linear_background(w, h, inner=NAVY_LIGHT, outer=NAVY_DARK, steps=48):
    small = Image.new("RGB", (steps, steps))
    px = small.load()
    for y in range(steps):
        for x in range(steps):
            t = (x / (steps - 1) * 0.55 + y / (steps - 1) * 0.45) ** 0.9
            px[x, y] = lerp(inner, outer, t)
    return small.resize((w, h), Image.LANCZOS).convert("RGBA")


def centered_text(draw, box, text, font, fill):
    x0, y0, x1, y1 = box
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    w, h = right - left, bottom - top
    draw.text(
        (x0 + (x1 - x0 - w) / 2 - left, y0 + (y1 - y0 - h) / 2 - top),
        text,
        font=font,
        fill=fill,
    )


def waves(draw, w, h, baseline, count=3, color=TEAL, alpha=46, gap=26, amp=10):
    """Три синусоиды у нижнего края — отсылка к морю."""
    import math

    for i in range(count):
        y0 = baseline + i * gap
        points = []
        for x in range(0, w + 8, 8):
            y = y0 + math.sin((x / 150.0) + i * 1.1) * (amp + i * amp * 0.3)
            points.append((x, y))
        draw.line(points, fill=color + (alpha,), width=3 + i)


def avatar(size=512):
    img = radial_background(size)
    draw = ImageDraw.Draw(img, "RGBA")

    # Кольцо: смещено вправо-вниз, чтобы буква «стояла» на нём.
    ring_r = int(size * 0.355)
    cx, cy = size // 2 + 8, size // 2 + 8
    draw.ellipse(
        [cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r],
        outline=TEAL + (70,),
        width=max(6, size // 40),
    )
    draw.ellipse(
        [cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r],
        outline=TEAL + (30,),
        width=max(2, size // 120),
    )

    font = ImageFont.truetype(FONT_BOLD, int(size * 0.56))
    centered_text(draw, (0, -int(size * 0.02), size, size), "M", font, TEAL)

    # Крошечный блик сверху слева.
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(
        [-size * 0.25, -size * 0.45, size * 0.55, size * 0.35],
        fill=(90, 200, 220, 26),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(size / 12))
    img = Image.alpha_composite(glow, img)
    return img.convert("RGB")


def header(w=1200, h=150):
    """Шапка профиля Kwork: превью 608×72 — соотношение ~8:1, поэтому макет
    рисуется в координатах 1200×150 и масштабируется."""
    k = w / 1200.0
    img = linear_background(w, h)
    draw = ImageDraw.Draw(img, "RGBA")

    waves(draw, w, h, baseline=h - 14 * k, gap=9 * k, amp=5 * k, alpha=34)

    pad = w * 0.035
    name_font = ImageFont.truetype(FONT_BOLD, round(54 * k))
    sub_font = ImageFont.truetype(FONT_REG, round(24 * k))

    draw.text((pad + 2 * k, 38 * k + 2 * k), "MENSORI DEV", font=name_font,
              fill=(0, 0, 0, 70))
    draw.text((pad, 38 * k), "MENSORI DEV", font=name_font, fill=WHITE)
    draw.text((pad + 1 * k, 100 * k), "HTML5-игры  ·  лендинги  ·  PWA",
              font=sub_font, fill=TEAL)

    # Монограмма справа, в кружке.
    r = round(46 * k)
    cx, cy = round(w - pad - r - 6 * k), round(h / 2)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=TEAL + (60,),
                 width=max(1, round(3 * k)))
    m_font = ImageFont.truetype(FONT_BOLD, round(62 * k))
    centered_text(draw, (cx - r, cy - r, cx + r, cy + r), "M", m_font, TEAL)

    return img.convert("RGB")


SS = 3  # суперсэмплинг: рисуем крупнее и уменьшаем — так нет «лесенки»


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    a = OUT / "avatar-512.png"
    hdr = OUT / "header-1200.png"

    big = avatar(512 * SS).resize((512, 512), Image.LANCZOS)
    big.save(a, "PNG", optimize=True)

    big_h = header(1200 * SS, 150 * SS).resize((1200, 150), Image.LANCZOS)
    big_h.save(hdr, "PNG", optimize=True)

    for p in (a, hdr):
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size} B")


if __name__ == "__main__":
    main()
