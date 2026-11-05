#!/usr/bin/env python3
"""GamePush «Загрузка»: иконки, обложки, фон и скриншоты.

Размеры и безопасные зоны взяты из PSD-шаблонов GamePush:
- обложка 1920×1080: текст/лого dentro 1694×612 по центру;
- иконка 4:3 512×384: текст/лого внутри 512×340;
- VK Play обложка 1790×1080.

Запуск: python scripts/make-gamepush-assets.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "gamepush-assets"
SHOTS = ROOT / "docs" / "screenshots"
ICON_SRC = ROOT / "assets" / "icon-1024.png"

W_BG = (4, 16, 28)
W_TOP = (6, 24, 41)
W_BOTTOM = (10, 45, 72)
ACCENT = (95, 199, 255)
ACCENT_DARK = (23, 97, 143)
GOLD = (245, 197, 66)
TEXT = (234, 246, 255)
MUTED = (166, 198, 219)
DIM = (120, 163, 188)

FONT_DIRS = [Path("C:/Windows/Fonts"), Path.home() / "AppData/Local/Microsoft/Windows/Fonts"]


def font_file(*names):
    for directory in FONT_DIRS:
        for name in names:
            path = directory / name
            if path.exists():
                return str(path)
    raise SystemExit("Не найден шрифт: " + ", ".join(names))


FONT_BOLD = font_file("segoeuib.ttf", "arialbd.ttf")
FONT_REG = font_file("segoeui.ttf", "arial.ttf")


def font(size, bold=True):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def fit(text, start, max_width, bold=True):
    size = start
    while size > 10:
        f = font(size, bold)
        if f.getlength(text) <= max_width:
            return f
        size -= 1
    return font(10, bold)


def base(w, h):
    im = Image.new("RGBA", (w, h), W_BG)
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=(
            round(W_TOP[0] + (W_BOTTOM[0] - W_TOP[0]) * t),
            round(W_TOP[1] + (W_BOTTOM[1] - W_TOP[1]) * t),
            round(W_TOP[2] + (W_BOTTOM[2] - W_TOP[2]) * t),
        ))
    grid = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    step = max(48, w // 24)
    for x in range(0, w, step):
        gd.line([(x, 0), (x, h)], fill=(120, 200, 255, 9))
    for y in range(0, h, step):
        gd.line([(0, y), (w, y)], fill=(120, 200, 255, 9))
    im = Image.alpha_composite(im, grid)
    return im


def add_waves(im, y0=None):
    w, h = im.size
    y0 = h * 0.72 if y0 is None else y0
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(6):
        d.arc([-w * 0.25 + i * w * 0.08, y0 - h * 0.18 + i * h * 0.06,
               w * 1.25 + i * w * 0.08, y0 + h * 0.18 + i * h * 0.06],
              200, 340, fill=(95, 199, 255, 16 + i * 2), width=max(2, w // 640))
    return Image.alpha_composite(im, layer)


def add_vignette(im):
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([-w * 0.2, -h * 0.2, w * 1.2, h * 1.2], fill=180)
    mask = mask.filter(ImageFilter.GaussianBlur(w // 8))
    dark = Image.new("RGBA", (w, h), (0, 8, 16, 60))
    dark.putalpha(Image.eval(mask, lambda v: max(0, 60 - v // 4)))
    return Image.alpha_composite(im, dark)


def rounded(im, r):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1],
                                           radius=r, fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def shadow_box(im, box, r, blur, alpha=110):
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(box, radius=r, fill=(0, 10, 20, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(im, layer)


def icon(size):
    return Image.open(ICON_SRC).convert("RGBA").resize((size, size), Image.LANCZOS)


def chip(d, xy, text, f, fill=(14, 47, 72), outline=(55, 130, 172), color=TEXT):
    x, y = xy
    pad = max(10, f.size // 2)
    w = f.getlength(text) + pad * 2
    h = f.size + pad
    d.rounded_rectangle([x, y, x + w, y + h], radius=h // 2,
                        fill=fill, outline=outline, width=2)
    d.text((x + pad, y + pad // 2 - 1), text, font=f, fill=color)
    return w


def make_icon_1024():
    im = Image.open(ICON_SRC).convert("RGB")
    im = im.resize((1024, 1024), Image.LANCZOS)
    im.save(OUT / "icon-1024x1024.png", "PNG", optimize=True)


def make_icon_4x3():
    w, h = 512, 384
    im = base(w, h)
    im = add_vignette(im)
    d = ImageDraw.Draw(im)
    # safe area 512x340, y=22..362
    a = icon(164)
    im.alpha_composite(a, (34, 110))
    title = font(44, True)
    d.text((228, 104), "МОРСКОЙ", font=title, fill=TEXT)
    d.text((228, 150), "БОЙ", font=title, fill=TEXT)
    sub = font(21, False)
    d.text((230, 204), "Морская арена", font=sub, fill=ACCENT)
    tag = font(16, False)
    d.text((230, 240), "ELO · ранги · тактика", font=tag, fill=MUTED)
    im.convert("RGB").save(OUT / "icon-4x3-512x384.png", "PNG", optimize=True)


def make_icon_2x3():
    w, h = 800, 1200
    im = base(w, h)
    im = add_waves(im, h * 0.8)
    im = add_vignette(im)
    a = icon(300)
    im.alpha_composite(a, ((w - 300) // 2, 130))
    d = ImageDraw.Draw(im)
    title = fit("МОРСКОЙ БОЙ", 82, 700)
    tw = d.textlength("МОРСКОЙ БОЙ", font=title)
    d.text(((w - tw) / 2, 480), "МОРСКОЙ БОЙ", font=title, fill=TEXT)
    sub = font(38, False)
    st = "Морская арена"
    d.text(((w - d.textlength(st, font=sub)) / 2, 585), st, font=sub, fill=ACCENT)
    f = font(24, False)
    line = "Умный бот · рейтинг ELO · 10 достижений"
    d.text(((w - d.textlength(line, font=f)) / 2, 670), line, font=f, fill=MUTED)

    cy = 760
    for text in ["8×8 · 10×10 · 12×12", "Тактика: авиаудар, дым, ПВО", "Испытание дня"]:
        f2 = font(24, True)
        cw = d.textlength(text, font=f2) + 44
        d.rounded_rectangle([(w - cw) / 2, cy, (w + cw) / 2, cy + 54], radius=27,
                            fill=(14, 47, 72), outline=(55, 130, 172), width=2)
        d.text(((w - d.textlength(text, font=f2)) / 2, cy + 12), text, font=f2, fill=TEXT)
        cy += 70

    d.text((70, 1100), "mensori.dev", font=font(24, False), fill=DIM)
    im.convert("RGB").save(OUT / "icon-2x3-800x1200.png", "PNG", optimize=True)


def make_cover():
    w, h = 1920, 1080
    im = base(w, h)
    im = add_waves(im, h * 0.8)
    im = add_vignette(im)
    d = ImageDraw.Draw(im)

    # safe area 1694x612 => x 113..1807, y 234..846
    a = icon(170)
    im.alpha_composite(a, (140, 250))
    badge = font(26, True)
    d.rounded_rectangle([340, 262, 340 + d.textlength("6+  ·  HTML5  ·  ELO", font=badge) + 42, 314],
                        radius=26, fill=ACCENT_DARK, outline=ACCENT, width=2)
    d.text((360, 274), "6+  ·  HTML5  ·  ELO", font=badge, fill=TEXT)
    d.text((342, 326), "mensori.dev", font=font(26, False), fill=MUTED)

    title = fit("МОРСКОЙ БОЙ", 118, 800)
    d.text((136, 390), "МОРСКОЙ БОЙ", font=title, fill=TEXT)
    sub = font(52, True)
    d.text((140, 530), "Морская арена", font=sub, fill=ACCENT)
    f = font(31, False)
    d.text((140, 610), "Умный бот, рейтинг ELO, ранги и тактика.", font=f, fill=TEXT)
    d.text((140, 655), "Поле 8×8, 10×10 или 12×12. Испытание дня.", font=f, fill=MUTED)

    x = 140
    for text in ["Рейтинг ELO", "3 размера поля", "Без рекламы"]:
        x += chip(d, (x, 730), text, font(22, True)) + 18

    # широкий скриншот боя: обе доски, способности и выстрелы
    shot = Image.open(ROOT / "dist" / "vk-assets" / "screenshots" / "05-battle-shots-1200x600.png")
    shot = shot.convert("RGBA")
    sw, sh = 760, 380
    shot = shot.resize((sw, sh), Image.LANCZOS)
    shot = rounded(shot, 28)
    box = (1010, 300, 1010 + sw, 300 + sh)
    im = shadow_box(im, [box[0] - 10, box[1] - 10, box[2] + 10, box[3] + 10], 36, 24, 120)
    frame = Image.new("RGBA", (sw + 10, sh + 10), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rounded_rectangle([0, 0, sw + 9, sh + 9], radius=34, fill=(9, 28, 45, 235),
                         outline=ACCENT, width=3)
    im.alpha_composite(frame, (box[0] - 5, box[1] - 5))
    im.alpha_composite(shot, (box[0], box[1]))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([box[0] + 22, box[1] + 22, box[0] + 300, box[1] + 70],
                        radius=24, fill=(6, 20, 34, 220))
    d.text((box[0] + 42, box[1] + 32), "ТАКТИКА В БОЮ", font=font(24, True), fill=GOLD)

    d.text((140, 820), "mensori-dev.github.io/seabattle", font=font(24, False), fill=DIM)
    im.convert("RGB").save(OUT / "cover-1920x1080.png", "PNG", optimize=True)


def make_cover_portrait():
    w, h = 1080, 1920
    im = base(w, h)
    im = add_waves(im, h * 0.82)
    im = add_vignette(im)
    d = ImageDraw.Draw(im)
    a = icon(230)
    im.alpha_composite(a, ((w - 230) // 2, 120))
    title = fit("МОРСКОЙ БОЙ", 96, 940)
    tw = d.textlength("МОРСКОЙ БОЙ", font=title)
    d.text(((w - tw) / 2, 390), "МОРСКОЙ БОЙ", font=title, fill=TEXT)
    sub = font(46, True)
    st = "Морская арена"
    d.text(((w - d.textlength(st, font=sub)) / 2, 500), st, font=sub, fill=ACCENT)
    f = font(28, False)
    line = "Умный бот · рейтинг ELO · тактика"
    d.text(((w - d.textlength(line, font=f)) / 2, 585), line, font=f, fill=TEXT)

    # свой флот с кораблями, а не пустая доска соперника
    shot = Image.open(SHOTS / "03-battle.png").convert("RGBA").crop((180, 1040, 900, 1760))
    sw, sh = 720, 720
    shot = shot.resize((sw, sh), Image.LANCZOS)
    shot = rounded(shot, 28)
    bx, by = (w - sw) // 2, 700
    im = shadow_box(im, [bx - 10, by - 10, bx + sw + 10, by + sh + 10], 36, 26, 130)
    frame = Image.new("RGBA", (sw + 10, sh + 10), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rounded_rectangle([0, 0, sw + 9, sh + 9], radius=34, fill=(9, 28, 45, 235),
                         outline=ACCENT, width=3)
    im.alpha_composite(frame, (bx - 5, by - 5))
    im.alpha_composite(shot, (bx, by))

    d = ImageDraw.Draw(im)
    cy = 1490
    for text in ["8×8 · 10×10 · 12×12", "Тактика: авиаудар, дым, ПВО", "Испытание дня: +60 ELO"]:
        f2 = font(26, True)
        cw = d.textlength(text, font=f2) + 52
        d.rounded_rectangle([(w - cw) / 2, cy, (w + cw) / 2, cy + 58], radius=29,
                            fill=(14, 47, 72), outline=(55, 130, 172), width=2)
        d.text(((w - d.textlength(text, font=f2)) / 2, cy + 13), text, font=f2, fill=TEXT)
        cy += 76

    d.text((80, 1810), "mensori-dev.github.io/seabattle", font=font(24, False), fill=DIM)
    im.convert("RGB").save(OUT / "cover-portrait-1080x1920.png", "PNG", optimize=True)


def make_background():
    w, h = 1920, 1080
    im = base(w, h)
    im = add_waves(im, h * 0.78)
    im = add_vignette(im)
    # едва заметный якорь справа
    a = icon(720)
    alpha = a.getchannel("A").point(lambda v: int(v * 0.09))
    a.putalpha(alpha)
    im.alpha_composite(a, (1180, 180))
    # компасные дуги
    d = ImageDraw.Draw(im)
    for r in (240, 340, 440):
        d.arc([1600 - r, 720 - r, 1600 + r, 720 + r], 200, 340,
              fill=(95, 199, 255, 18), width=2)
    im.convert("RGB").save(OUT / "background-1920x1080.png", "PNG", optimize=True)


FEATURES = [
    ("01", "РЕЙТИНГ ELO", "От юнги до адмирала",
     ["Победы и поражения", "Ранги и прогресс", "История последних боёв"]),
    ("02", "СВОЙ ФЛОТ", "Поле 8×8, 10×10 или 12×12",
     ["Классический или адмиральский", "Случайная расстановка", "Ручная правка флота"]),
    ("03", "ТАКТИКА", "Авиаудар, дым и ПВО",
     ["Выбери 2 из 3 способностей", "Один заряд на бой", "Работает против бота"]),
    ("04", "КЛАССИКА", "Правила, которые знают все",
     ["Корабли не касаются даже углами", "Потопление раскрывает корабль", "Попадание даёт ход"]),
    ("05", "10 ДОСТИЖЕНИЙ", "Испытание дня",
     ["3 боя без поражения", "+60 к рейтингу раз в день", "Новая цепочка каждый день"]),
]


def make_album():
    srcs = ["01-menu.png", "02-placement.png", "03-battle.png", "04-rules.png", "05-achievements.png"]
    w, h = 1280, 720
    for i, (src, feat) in enumerate(zip(srcs, FEATURES)):
        im = base(w, h)
        im = add_waves(im, h * 0.9)
        im = add_vignette(im)
        # phone 360x640 at x=110,y=40
        shot = Image.open(SHOTS / src).convert("RGBA").resize((360, 640), Image.LANCZOS)
        shot = rounded(shot, 22)
        bx, by = 110, 40
        im = shadow_box(im, [bx - 8, by - 8, bx + 360 + 8, by + 640 + 8], 28, 20, 130)
        frame = Image.new("RGBA", (368, 648), (0, 0, 0, 0))
        fd = ImageDraw.Draw(frame)
        fd.rounded_rectangle([0, 0, 367, 647], radius=26, fill=(8, 24, 40, 240),
                             outline=ACCENT, width=2)
        im.alpha_composite(frame, (bx - 4, by - 4))
        im.alpha_composite(shot, (bx, by))

        d = ImageDraw.Draw(im)
        # index watermark
        d.text((520, 34), feat[0], font=font(120, True), fill=(95, 199, 255, 24))
        d.text((530, 190), feat[1], font=fit(feat[1], 54, 700), fill=GOLD)
        d.text((530, 260), feat[2], font=fit(feat[2], 38, 700), fill=TEXT)
        y = 340
        for line in feat[3]:
            d.ellipse([532, y + 10, 544, y + 22], fill=ACCENT)
            d.text((562, y), line, font=fit(line, 25, 640, False), fill=MUTED)
            y += 48
        d.text((530, 650), "МОРСКОЙ БОЙ · МОРСКАЯ АРЕНА", font=font(20, True), fill=DIM)
        im.convert("RGB").save(OUT / "screenshots" / f"album-1280x720-{i + 1:02d}.png", "PNG", optimize=True)


def make_portrait():
    srcs = ["01-menu.png", "02-placement.png", "03-battle.png", "04-rules.png", "05-achievements.png"]
    for i, src in enumerate(srcs, 1):
        im = Image.open(SHOTS / src).convert("RGB").resize((720, 1280), Image.LANCZOS)
        im.save(OUT / "screenshots" / f"portrait-720x1280-{i:02d}.png", "PNG", optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "screenshots").mkdir(exist_ok=True)
    if not ICON_SRC.exists():
        raise SystemExit(f"Нет иконки: {ICON_SRC}")
    if not (SHOTS / "01-menu.png").exists():
        raise SystemExit(f"Нет скриншотов: {SHOTS} (сначала npm run shots)")

    make_icon_1024()
    make_icon_4x3()
    make_icon_2x3()
    make_cover()
    make_cover_portrait()
    make_background()
    make_album()
    make_portrait()

    files = sorted(p for p in OUT.rglob("*") if p.is_file())
    total = sum(p.stat().st_size for p in files)
    print(f"Готово: {OUT}")
    for p in files:
        print(f"  {p.relative_to(OUT)}  {p.stat().st_size} B")
    print(f"Всего: {len(files)} файлов, {total / 1024:.0f} КБ")


if __name__ == "__main__":
    main()
