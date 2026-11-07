#!/usr/bin/env python3
"""Обложки работ для портфолио Kwork: 1920×1280, реальные скриншоты в макетах.

Скриншоты из `docs/screenshots/` вставляются в рамку телефона/браузера,
слева — заголовок и три буллета. Палитра та же, что у игры.

Запуск: python scripts/make-kwork-portfolio.py
Результат: docs/kwork/pf-cover/*.png (1920×1280).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "screenshots"
OUT = ROOT / "docs" / "kwork" / "pf-cover"

NAVY_LIGHT = (11, 36, 56)
NAVY_DARK = (7, 26, 43)
TEAL = (61, 218, 215)
WHITE = (233, 246, 250)
MUTED = (170, 198, 216)

FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT_REG = "C:/Windows/Fonts/arial.ttf"

SS = 2
W, H = 1920, 1280


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def background(w, h):
    small = Image.new("RGB", (48, 48))
    px = small.load()
    for y in range(48):
        for x in range(48):
            t = (x / 47 * 0.6 + y / 47 * 0.4) ** 0.9
            px[x, y] = lerp(NAVY_LIGHT, NAVY_DARK, t)
    img = small.resize((w, h), Image.LANCZOS).convert("RGBA")

    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-w * 0.2, -h * 0.6, w * 0.6, h * 0.5], fill=(45, 160, 200, 34))
    glow = glow.filter(ImageFilter.GaussianBlur(w / 9))
    img = Image.alpha_composite(img, glow)
    return img


def waves(draw, w, h, k):
    for i, (gap, alpha) in enumerate(((0, 60), (40, 40), (80, 26))):
        pts = []
        for x in range(0, w + 1, 12):
            import math

            y = h - 40 * k + gap * k + math.sin((x / w) * 6.2 + i) * 14 * k
            pts.append((x, y))
        pts += [(w, h), (0, h)]
        draw.polygon(pts, fill=TEAL + (alpha,))


def paste_shot(base, path, box, radius, border=None, shadow=True):
    x0, y0, x1, y1 = (round(v) for v in box)
    w, h = x1 - x0, y1 - y0
    shot = Image.open(path).convert("RGB")
    scale = max(w / shot.width, h / shot.height)
    resized = shot.resize((round(shot.width * scale), round(shot.height * scale)), Image.LANCZOS)
    left = (resized.width - w) // 2
    top = (resized.height - h) // 3
    resized = resized.crop((left, top, left + w, top + h))

    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius, fill=255)

    if shadow:
        sh = Image.new("RGBA", (w + 120, h + 120), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sh)
        sd.rounded_rectangle([60, 60, 60 + w, 60 + h], radius, fill=(0, 0, 0, 150))
        sh = sh.filter(ImageFilter.GaussianBlur(34))
        base.alpha_composite(sh, (x0 - 60, y0 - 60))

    base.paste(resized, (x0, y0), mask)
    if border:
        d = ImageDraw.Draw(base, "RGBA")
        d.rounded_rectangle([x0, y0, x0 + w - 1, y0 + h - 1], radius, outline=border, width=4)


def phone(base, draw, path, x, y, w, h):
    k = w / 470.0
    pad = round(16 * k)
    body = [x, y, x + w, y + h]
    bd = ImageDraw.Draw(base)
    bd.rounded_rectangle(body, radius=round(52 * k), fill=(6, 24, 38))
    paste_shot(base, path, (x + pad, y + pad * 2, x + w - pad, y + h - pad * 2),
               round(38 * k), shadow=False)
    draw.rounded_rectangle(body, radius=round(52 * k), outline=TEAL + (170,),
                           width=max(2, round(4 * k)))
    # вырез сверху
    draw.rounded_rectangle(
        [x + w * 0.36, y + round(16 * k), x + w * 0.64, y + round(30 * k)],
        radius=round(8 * k), fill=(4, 18, 30, 255),
    )


def browser(base, draw, path, x, y, w, h):
    k = w / 1180.0
    bd = ImageDraw.Draw(base)
    bd.rounded_rectangle([x, y, x + w, y + h], radius=round(22 * k), fill=(9, 30, 47))
    bar = round(46 * k)
    bd.rounded_rectangle([x, y, x + w, y + bar], radius=round(22 * k), fill=(14, 42, 63))
    bd.rectangle([x, y + bar - round(12 * k), x + w, y + bar], fill=(14, 42, 63))
    for i, c in enumerate(((255, 105, 97), (255, 189, 46), (39, 201, 63))):
        cx = x + round((26 + i * 26) * k)
        cy = y + bar // 2
        r = round(7 * k)
        bd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    bd.rounded_rectangle(
        [x + round(120 * k), y + round(11 * k), x + w - round(28 * k), y + bar - round(11 * k)],
        radius=round(9 * k), fill=(8, 26, 42),
    )
    paste_shot(base, path, (x + round(4 * k), y + bar, x + w - round(4 * k), y + h - round(4 * k)),
               round(12 * k), shadow=False)
    draw.rounded_rectangle([x, y, x + w, y + h], radius=round(22 * k),
                           outline=TEAL + (140,), width=max(2, round(3 * k)))


def shadowed_card(base, x, y, w, h, radius):
    sh = Image.new("RGBA", (w + 120, h + 120), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([60, 60, 60 + w, 60 + h], radius, fill=(0, 0, 0, 150))
    sh = sh.filter(ImageFilter.GaussianBlur(34))
    base.alpha_composite(sh, (x - 60, y - 60))


def frame(w, h):
    k = w / 1920.0
    img = background(w, h)
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, 0, w, max(6, round(8 * k))], fill=TEAL)
    font = ImageFont.truetype(FONT_BOLD, max(8, round(24 * k)))
    d.text((110 * k, 58 * k), "MENSORI DEV", font=font, fill=(150, 180, 200, 255))
    d.text((w - 330 * k, 58 * k), "HTML · CSS · JS", font=ImageFont.truetype(FONT_REG, max(8, round(24 * k))),
           fill=(120, 152, 176, 255))
    return img, d, k


def text_block(d, k, kicker, title_lines, bullets, chips_items):
    x = 110 * k
    maxw = 820 * k
    fk = ImageFont.truetype(FONT_BOLD, max(8, round(26 * k)))
    d.text((x, 250 * k), kicker, font=fk, fill=TEAL)

    y = 300 * k
    for line in title_lines:
        size = round(96 * k)
        font = ImageFont.truetype(FONT_BOLD, size)
        while d.textlength(line, font=font) > maxw and size > 40:
            size -= 2
            font = ImageFont.truetype(FONT_BOLD, size)
        d.text((x, y), line, font=font, fill=WHITE)
        y += size + 20 * k

    y += 34 * k
    fb = ImageFont.truetype(FONT_REG, max(8, round(32 * k)))
    for item in bullets:
        d.ellipse([x, y + 12 * k, x + 14 * k, y + 26 * k], fill=TEAL + (255,))
        d.text((x + 34 * k, y), item, font=fb, fill=(205, 228, 241, 255))
        y += 54 * k

    y += 26 * k
    fc = ImageFont.truetype(FONT_REG, max(8, round(24 * k)))
    cx = x
    for text in chips_items:
        tw = d.textlength(text, font=fc)
        box = [cx, y, cx + tw + 40 * k, y + 50 * k]
        d.rounded_rectangle(box, radius=25 * k, fill=(61, 218, 215, 20),
                            outline=TEAL + (100,), width=max(1, round(2 * k)))
        d.text((cx + 20 * k, y + 11 * k), text, font=fc, fill=WHITE)
        cx = box[2] + 14 * k


def cover(name, kicker, title, bullets, chips_items, painter, w=1920, h=1280):
    img, d, k = frame(w * SS, h * SS)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(layer)
    waves(od, img.size[0], img.size[1], k)
    text_block(od, k, kicker, title, bullets, chips_items)
    painter(img, od, k)
    img = Image.alpha_composite(img, layer)
    out = img.convert("RGB").resize((w, h), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    out.save(path, optimize=True)
    print(f"{path.name}: {out.size[0]}x{out.size[1]} {path.stat().st_size} B")


def main():
    def game(img, d, k):
        phone(img, d, SHOTS / "03-battle.png", 1160 * k, 170 * k, 470 * k, 836 * k)

    def campaign(img, d, k):
        phone(img, d, SHOTS / "07-campaign.png", 1160 * k, 170 * k, 470 * k, 836 * k)

    def online(img, d, k):
        phone(img, d, SHOTS / "06-online.png", 1160 * k, 170 * k, 470 * k, 836 * k)

    def progress(img, d, k):
        phone(img, d, SHOTS / "05-achievements.png", 1160 * k, 170 * k, 470 * k, 836 * k)

    def landing(img, d, k):
        browser(img, d, ROOT / "docs" / "kwork" / "services-desktop.png",
                1010 * k, 275 * k, 780 * k, 610 * k)
        phone(img, d, ROOT / "docs" / "kwork" / "services-mobile.png",
              770 * k, 690 * k, 235 * k, 418 * k)

    cover("pf-1-game.png", "БРАУЗЕРНАЯ ИГРА · ПОД КЛЮЧ",
          ["ИГРА", "ПОД КЛЮЧ"],
          ["Бот с рейтингом ELO", "Кампания из 12 миссий и боссы", "PWA: установка на телефон"],
          ["Canvas · JS", "Адаптив", "Исходники"], game)

    cover("pf-2-campaign.png", "КОНТЕНТ · КАМПАНИЯ",
          ["КАМПАНИЯ", "12 МИССИЙ"],
          ["Три акта и три босса с фазами", "Модификаторы: туман, шторм, дым", "Звёзды за победы и капитаны"],
          ["Прогресс", "Баланс", "Сейвы"], campaign)

    cover("pf-3-online.png", "СЕТЬ · WEBSOCKET",
          ["ОНЛАЙН", "КОМНАТЫ"],
          ["Комната по ссылке, без регистрации", "Сервер проверяет флот и выстрелы", "Топ побед и живой статус боя"],
          ["WebSocket", "Топ", "Без ПД"], online)

    cover("pf-4-landing.png", "ЛЕНДИНГ · ВИТРИНА УСЛУГ",
          ["ЛЕНДИНГ", "НА ЧИСТОМ КОДЕ"],
          ["Один HTML-файл, правки без сборки", "90+ Lighthouse, Open Graph", "Адаптив от 320 px, формы и FAQ"],
          ["Пакеты и бриф", "Анимации", "SEO"], landing)

    cover("pf-5-progress.png", "ПРОФИЛЬ · ДОСТИЖЕНИЯ",
          ["ПРОГРЕСС", "И ПРОФИЛЬ"],
          ["Достижения и статистика игрока", "Светлая и тёмная тема", "localStorage без сервера и ПД"],
          ["UX", "Темы", "Офлайн"], progress)


if __name__ == "__main__":
    main()
