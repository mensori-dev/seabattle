"""Портфолио-обложки 1920x1280 для кворков «PWA из сайта» и «Перенос на хостинг».

Запуск: python scripts/make-pf-covers.py
Пишет: docs/kwork/pf-cover/pf-5-pwa.png, pf-6-hosting.png
"""
import importlib.util
import pathlib

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "kwork" / "pf-cover"

spec = importlib.util.spec_from_file_location("kwork", ROOT / "scripts" / "make-kwork-assets.py")
kwork = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kwork)

TEAL = kwork.TEAL
WHITE = kwork.WHITE
BOLD = kwork.FONT_BOLD
REG = kwork.FONT_REG

MUTED = (150, 176, 194)
CARD = (17, 38, 58)
EDGE = (40, 96, 112)

W, H = 1920, 1280
SS = 2


def font(path, size):
    return ImageFont.truetype(str(path), int(size))


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def glow(img, box, color=(61, 218, 215, 60), blur=140):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(box, fill=color)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(img.convert("RGBA"), layer)


def base():
    img = kwork.linear_background(W * SS, H * SS).resize((W, H), Image.LANCZOS).convert("RGBA")
    img = glow(img, (1280, -260, 2140, 620), (61, 218, 215, 46), 160)
    img = glow(img, (-320, 780, 420, 1520), (61, 218, 215, 26), 200)
    return img


def chip(draw, x, y, text, size=26):
    f = font(BOLD, size)
    tw = draw.textlength(text, font=f)
    box = [x, y, x + tw + 64, y + 58]
    rounded(draw, box, 29, fill=(19, 46, 66), outline=EDGE, width=2)
    draw.text((x + 32, y + 14), text, font=f, fill=TEAL)
    return box


def save(img, name):
    img.convert("RGB").save(OUT / name, "PNG", optimize=True)
    print(name, (OUT / name).stat().st_size)


# --- обложка 1: PWA ---------------------------------------------------------

def cover_pwa():
    img = base()
    d = ImageDraw.Draw(img, "RGBA")

    chip(d, 110, 96, "КЕЙС · PWA")

    d.text((110, 200), "Сайт, который", font=font(BOLD, 88), fill=WHITE)
    d.text((110, 300), "ставится на телефон", font=font(BOLD, 88), fill=TEAL)

    sub = font(REG, 34)
    d.text((112, 432), "Манифест, service worker и иконки —", font=sub, fill=MUTED)
    d.text((112, 482), "сайт открывается как приложение,", font=sub, fill=MUTED)
    d.text((112, 532), "без адресной строки и с офлайн-режимом.", font=sub, fill=MUTED)

    # телефон
    px, py, pw, ph = 1290, 250, 400, 760
    rounded(d, [px - 14, py - 14, px + pw + 14, py + ph + 14], 60, fill=(10, 26, 40), outline=EDGE, width=3)
    rounded(d, [px, py, px + pw, py + ph], 48, fill=(13, 33, 50))

    # иконка приложения
    ix, iy, isz = px + 110, py + 150, 180
    rounded(d, [ix, iy, ix + isz, iy + isz], 42, fill=(16, 44, 64), outline=TEAL, width=4)
    d.text((ix + 62, iy + 38), "M", font=font(BOLD, 112), fill=TEAL)

    d.text((px + 86, py + 368), "Морская арена", font=font(BOLD, 38), fill=WHITE)
    d.text((px + 118, py + 424), "игра · офлайн", font=font(REG, 26), fill=MUTED)

    rounded(d, [px + 90, py + 520, px + pw - 90, py + 592], 36, fill=(24, 70, 86), outline=TEAL, width=2)
    d.text((px + 168, py + 542), "Открыть", font=font(BOLD, 32), fill=WHITE)

    d.text((px + 60, py + 660), "установлено с сайта · 1.2 МБ", font=font(REG, 24), fill=MUTED)

    # зачёркнутая адресная строка
    d.line([(px + 40, py + 96), (px + pw - 40, py + 96)], fill=(90, 120, 138), width=3)
    d.text((px + 118, py + 52), "https://arena.ru", font=font(REG, 24), fill=(120, 148, 166))
    d.line([(px + 96, py + 64), (px + 300, py + 64)], fill=(226, 96, 96), width=4)

    # бейдж Lighthouse
    bx, by, br = 1618, 1046, 92
    d.ellipse([bx - br, by - br, bx + br, by + br], fill=(15, 40, 58), outline=TEAL, width=3)
    d.text((bx - 38, by - 46), "100", font=font(BOLD, 62), fill=TEAL)
    d.text((bx - 52, by + 26), "Lighthouse", font=font(REG, 20), fill=MUTED)

    # факты снизу
    facts = [("3 дня", "срок работы"), ("0 ₽", "за хостинг и домен"), ("Android + iOS", "установка")]
    x = 112
    for i, (big, small) in enumerate(facts):
        if i:
            d.line([(x - 40, 1160), (x - 40, 1230)], fill=(36, 70, 88), width=2)
        d.text((x, 1146), big, font=font(BOLD, 44), fill=WHITE)
        d.text((x, 1206), small, font=font(REG, 24), fill=MUTED)
        x += d.textlength(big, font=font(BOLD, 44)) + 120

    save(img, "pf-5-pwa.png")


# --- обложка 2: перенос на хостинг ------------------------------------------

def cover_hosting():
    img = base()
    d = ImageDraw.Draw(img, "RGBA")

    chip(d, 110, 96, "КЕЙС · ПЕРЕЕЗД")

    d.text((110, 200), "Перенос сайта", font=font(BOLD, 88), fill=WHITE)
    d.text((110, 300), "на новый хостинг", font=font(BOLD, 88), fill=TEAL)

    sub = font(REG, 34)
    d.text((112, 432), "Домен, SSL, почта и бэкапы —", font=sub, fill=MUTED)
    d.text((112, 482), "сайт не падает, письма не теряются,", font=sub, fill=MUTED)
    d.text((112, 532), "ПД и файлы на месте.", font=sub, fill=MUTED)

    # карточка-браузер
    cx, cy, cw, ch = 1080, 250, 720, 620
    rounded(d, [cx, cy, cx + cw, cy + ch], 28, fill=CARD, outline=EDGE, width=3)

    # шапка браузера
    rounded(d, [cx, cy, cx + cw, cy + 96], 28, fill=(21, 47, 68))
    for i, col in enumerate([(226, 96, 96), (222, 180, 90), (110, 196, 130)]):
        d.ellipse([cx + 36 + i * 34, cy + 42, cx + 60 + i * 34, cy + 66], fill=col)
    rounded(d, [cx + 156, cy + 30, cx + cw - 36, cy + 78], 24, fill=(14, 34, 52), outline=EDGE, width=2)
    d.text((cx + 186, cy + 42), "site.ru", font=font(REG, 26), fill=WHITE)
    d.text((cx + 300, cy + 42), "Защищено", font=font(REG, 24), fill=(110, 196, 130))

    # замок + SSL
    lx, ly = cx + 60, cy + 150
    rounded(d, [lx, ly + 26, lx + 70, ly + 92], 12, fill=(24, 70, 86), outline=TEAL, width=3)
    d.arc([lx + 12, ly - 6, lx + 58, ly + 46], 180, 360, fill=TEAL, width=8)
    d.ellipse([lx + 28, ly + 50, lx + 42, ly + 64], fill=TEAL)

    d.text((lx + 100, ly + 18), "SSL выпущен", font=font(BOLD, 40), fill=WHITE)
    d.text((lx + 100, ly + 72), "https, без предупреждений браузера", font=font(REG, 26), fill=MUTED)

    rows = [
        ("Простой при переезде", "0 минут"),
        ("Скорость загрузки", "+42 %"),
        ("Бэкапы", "каждый день"),
    ]
    ry = cy + 320
    for i, (name, val) in enumerate(rows):
        if i:
            d.line([(cx + 60, ry - 24), (cx + cw - 60, ry - 24)], fill=(36, 70, 88), width=2)
        d.text((cx + 60, ry), name, font=font(REG, 30), fill=MUTED)
        tw = d.textlength(val, font=font(REG, 30))
        d.text((cx + cw - 60 - tw, ry), val, font=font(BOLD, 30), fill=TEAL)
        ry += 92

    # бейдж «без потерь»
    bx, by, br = 1614, 1006, 96
    d.ellipse([bx - br, by - br, bx + br, by + br], fill=(15, 40, 58), outline=TEAL, width=3)
    d.text((bx - 34, by - 34), "0", font=font(BOLD, 78), fill=TEAL)
    d.text((bx - 60, by + 38), "потеряно", font=font(REG, 22), fill=MUTED)

    facts = [("2 дня", "срок работы"), ("1 500 ₽", "под ключ"), ("24/7", "сайт доступен")]
    x = 112
    for i, (big, small) in enumerate(facts):
        if i:
            d.line([(x - 40, 1160), (x - 40, 1230)], fill=(36, 70, 88), width=2)
        d.text((x, 1146), big, font=font(BOLD, 44), fill=WHITE)
        d.text((x, 1206), small, font=font(REG, 24), fill=MUTED)
        x += d.textlength(big, font=font(BOLD, 44)) + 120

    save(img, "pf-6-hosting.png")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    cover_pwa()
    cover_hosting()
