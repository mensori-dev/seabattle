#!/usr/bin/env python3
"""Материалы профиля Kwork: аватар и шапка.

Рисуются кодом (Pillow), без внешних картинок и шрифтов из репозитория —
в `assets/fonts` только woff2, который Pillow не читает, поэтому берём
системный Arial Bold.

Запуск: python scripts/make-kwork-assets.py
Результат: docs/kwork/avatar-512.png, header-1920.png,
kwork-cover-2.png и kwork-cover-3.png (1200×800).
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


def header(w=1920, h=226):
    """Шапка профиля Kwork: Kwork требует минимум 1920×226, превью 608×72 —
    соотношение ~8.5:1. Макет рисуется в координатах 1920×226 и масштабируется."""
    k = w / 1920.0
    img = linear_background(w, h)
    draw = ImageDraw.Draw(img, "RGBA")

    waves(draw, w, h, baseline=h - 12 * k, gap=9 * k, amp=5 * k, alpha=34)

    pad = w * 0.035
    name_font = ImageFont.truetype(FONT_BOLD, round(52 * k))
    sub_font = ImageFont.truetype(FONT_REG, round(23 * k))

    # Текстовый блок по вертикали центрируем.
    block_top, block_bottom = 46 * k, 132 * k
    shift = (h - (block_bottom - block_top)) / 2 - block_top

    draw.text((pad + 2 * k, 46 * k + shift + 2 * k), "MENSORI DEV", font=name_font,
              fill=(0, 0, 0, 70))
    draw.text((pad, 46 * k + shift), "MENSORI DEV", font=name_font, fill=WHITE)
    draw.text((pad + 1 * k, 106 * k + shift), "HTML5-игры  ·  лендинги  ·  PWA",
              font=sub_font, fill=TEAL)

    # Монограмма справа, в кружке.
    r = round(46 * k)
    cx, cy = round(w - pad - r - 6 * k), round(h / 2)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=TEAL + (60,),
                 width=max(1, round(3 * k)))
    m_font = ImageFont.truetype(FONT_BOLD, round(62 * k))
    centered_text(draw, (cx - r, cy - r, cx + r, cy + r), "M", m_font, TEAL)

    return img.convert("RGB")


def fit_font(draw, text, path, size, max_width, k, min_size=22):
    """Подбираем размер шрифта так, чтобы строка влезла в блок."""
    while size > min_size:
        font = ImageFont.truetype(path, max(8, round(size * k)))
        if draw.textlength(text, font=font) <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(path, max(8, round(min_size * k)))


def cover_base(w, h):
    """Общий фон обложек 1200×800: градиент, блик, волны и подпись."""
    k = w / 1200.0
    img = linear_background(w, h)
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(
        [-w * 0.15, -h * 0.55, w * 0.55, h * 0.55],
        fill=(45, 160, 200, 30),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(w / 10))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img, "RGBA")

    draw.rectangle([0, 0, w, max(4, round(6 * k))], fill=TEAL + (210,))
    brand = ImageFont.truetype(FONT_BOLD, max(8, round(23 * k)))
    draw.text((72 * k, 42 * k), "MENSORI DEV", font=brand, fill=(157, 185, 204, 255))
    waves(draw, w, h, h - 16 * k, count=3, color=TEAL, alpha=42,
          gap=24 * k, amp=10 * k)
    return img, draw, k


def chips(draw, x, y, items, k):
    """Пилюли с короткими преимуществами."""
    font = ImageFont.truetype(FONT_REG, max(8, round(21 * k)))
    cx = x
    for text in items:
        tw = draw.textlength(text, font=font)
        box = [cx, y, cx + tw + 34 * k, y + 44 * k]
        draw.rounded_rectangle(
            box, radius=22 * k, fill=(61, 218, 215, 18),
            outline=TEAL + (95,), width=max(1, round(2 * k)),
        )
        draw.text((cx + 17 * k, y + 9 * k), text, font=font, fill=WHITE)
        cx = box[2] + 12 * k


def game_board(draw, k, x, y, cols=5, cell=62, gap=10):
    """Декоративное игровое поле с попаданиями и промахами."""
    hits = {(0, 0), (2, 1), (1, 3), (4, 2)}
    misses = {(1, 0), (3, 1), (0, 4)}
    for row in range(cols):
        for col in range(cols):
            px = x + col * (cell + gap) * k
            py = y + row * (cell + gap) * k
            box = [px, py, px + cell * k, py + cell * k]
            hit = (col, row) in hits
            draw.rounded_rectangle(
                box, radius=9 * k,
                fill=(61, 218, 215, 170) if hit else (10, 40, 60, 200),
                outline=(61, 218, 215, 70), width=max(1, round(2 * k)),
            )
            if hit:
                pad = 20 * k
                draw.line([(px + pad, py + pad), (box[2] - pad, box[3] - pad)],
                          fill=(5, 36, 48, 230), width=max(2, round(6 * k)))
                draw.line([(box[2] - pad, py + pad), (px + pad, box[3] - pad)],
                          fill=(5, 36, 48, 230), width=max(2, round(6 * k)))
            elif (col, row) in misses:
                r = cell * 0.16 * k
                cx, cy = px + cell * k / 2, py + cell * k / 2
                draw.ellipse([cx - r, cy - r, cx + r, cy + r],
                             fill=(157, 185, 204, 120))


def cover2(w=1200, h=800):
    """Кворк №2: HTML5-игра под ключ."""
    img, draw, k = cover_base(w, h)
    x = 76 * k
    maxw = 660 * k

    kicker = ImageFont.truetype(FONT_BOLD, max(8, round(25 * k)))
    draw.text((x, 184 * k), "HTML5 · JAVASCRIPT", font=kicker, fill=TEAL)

    f1 = fit_font(draw, "HTML5-ИГРА", FONT_BOLD, 96, maxw, k)
    draw.text((x, 228 * k), "HTML5-ИГРА", font=f1, fill=WHITE)
    f2 = fit_font(draw, "ПОД КЛЮЧ", FONT_BOLD, 120, maxw, k)
    draw.text((x, 338 * k), "ПОД КЛЮЧ", font=f2, fill=TEAL)

    sub = ImageFont.truetype(FONT_REG, max(8, round(29 * k)))
    draw.text((x, 504 * k), "Геймплей · графика · звук · адаптив",
              font=sub, fill=(207, 230, 243, 255))
    chips(draw, x, 596 * k, ["Телефон и ПК", "Исходники у вас"], k)

    game_board(draw, k, 795 * k, 250 * k)
    return img.convert("RGB")


def phone(draw, k, x, y, w, h):
    """Декоративный телефон с игровым полем и галочкой готовой сборки."""
    draw.rounded_rectangle(
        [x, y, x + w, y + h], radius=36 * k, fill=(6, 24, 38, 255),
        outline=TEAL + (180,), width=max(2, round(4 * k)),
    )
    sx, sy = x + 14 * k, y + 36 * k
    sw, sh = w - 28 * k, h - 88 * k
    draw.rounded_rectangle(
        [sx, sy, sx + sw, sy + sh], radius=18 * k, fill=(11, 36, 56, 255),
        outline=(28, 74, 102, 255), width=max(1, round(2 * k)),
    )
    cols, rows = 4, 5
    cell = (sw - 36 * k) / cols
    gap = 6 * k
    hits = {(0, 0), (2, 1), (1, 3), (3, 2), (2, 4)}
    for row in range(rows):
        for col in range(cols):
            px = sx + 18 * k + col * (cell + gap)
            py = sy + 18 * k + row * (cell + gap)
            box = [px, py, px + cell, py + cell]
            draw.rounded_rectangle(
                box, radius=6 * k,
                fill=(61, 218, 215, 170) if (col, row) in hits else (18, 52, 76, 255),
                outline=(61, 218, 215, 55), width=max(1, round(1.5 * k)),
            )
    draw.rounded_rectangle(
        [x + w * 0.32, y + h - 26 * k, x + w * 0.68, y + h - 18 * k],
        radius=4 * k, fill=(61, 218, 215, 120),
    )

    cx, cy, r = x + w - 10 * k, y + h - 10 * k, 42 * k
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=TEAL)
    draw.line(
        [(cx - 19 * k, cy + 2 * k), (cx - 5 * k, cy + 16 * k), (cx + 21 * k, cy - 15 * k)],
        fill=(5, 36, 48, 255), width=max(3, round(7 * k)),
    )


def cover3(w=1200, h=800):
    """Кворк №3: APK для RuStore и Яндекс Игр."""
    img, draw, k = cover_base(w, h)
    x = 76 * k
    maxw = 700 * k

    kicker = ImageFont.truetype(FONT_BOLD, max(8, round(25 * k)))
    draw.text((x, 168 * k), "ANDROID · RUSTORE", font=kicker, fill=TEAL)

    f1 = fit_font(draw, "APK", FONT_BOLD, 132, maxw, k)
    draw.text((x, 210 * k), "APK", font=f1, fill=TEAL)
    f2 = fit_font(draw, "ДЛЯ RUSTORE", FONT_BOLD, 80, maxw, k)
    draw.text((x, 370 * k), "ДЛЯ RUSTORE", font=f2, fill=WHITE)
    f3 = fit_font(draw, "И ЯНДЕКС ИГР", FONT_BOLD, 80, maxw, k)
    draw.text((x, 458 * k), "И ЯНДЕКС ИГР", font=f3, fill=WHITE)

    sub = ImageFont.truetype(FONT_REG, max(8, round(28 * k)))
    draw.text((x, 566 * k), "Сборка · подпись · публикация",
              font=sub, fill=(207, 230, 243, 255))
    chips(draw, x, 638 * k, ["APK · AAB", "PWA", "Иконки"], k)

    phone(draw, k, 835 * k, 125 * k, 290 * k, 560 * k)
    return img.convert("RGB")


SS = 3  # суперсэмплинг: рисуем крупнее и уменьшаем — так нет «лесенки»
COVER_SS = 2


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    a = OUT / "avatar-512.png"
    hdr = OUT / "header-1920.png"
    c2 = OUT / "kwork-cover-2.png"
    c3 = OUT / "kwork-cover-3.png"

    big = avatar(512 * SS).resize((512, 512), Image.LANCZOS)
    big.save(a, "PNG", optimize=True)

    big_h = header(1920 * SS, 226 * SS).resize((1920, 226), Image.LANCZOS)
    big_h.save(hdr, "PNG", optimize=True)

    big_c2 = cover2(1200 * COVER_SS, 800 * COVER_SS).resize((1200, 800), Image.LANCZOS)
    big_c2.save(c2, "PNG", optimize=True)

    big_c3 = cover3(1200 * COVER_SS, 800 * COVER_SS).resize((1200, 800), Image.LANCZOS)
    big_c3.save(c3, "PNG", optimize=True)

    for p in (a, hdr, c2, c3):
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size} B")


if __name__ == "__main__":
    main()
