#!/usr/bin/env python3
"""Большой сниппет для карточки VK: 1120x630 JPG/PNG."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "vk-assets" / "big-snippet-1120x630.png"
ICON = ROOT / "assets" / "vk" / "icon-576.png"
SHOT = ROOT / "dist" / "vk-assets" / "screenshots" / "05-battle-shots-1200x600.png"

W, H = 1120, 630
BG_TOP = (5, 19, 33)
BG_BOTTOM = (10, 45, 72)
ACCENT = (95, 199, 255)
GOLD = (245, 197, 66)
TEXT = (234, 246, 255)
MUTED = (166, 198, 219)

FONT_DIRS = [Path("C:/Windows/Fonts"), Path.home() / "AppData/Local/Microsoft/Windows/Fonts"]


def font_file(*names):
    for directory in FONT_DIRS:
        for name in names:
            path = directory / name
            if path.exists():
                return str(path)
    raise SystemExit("Не найден шрифт: " + ", ".join(names))


BOLD = font_file("segoeuib.ttf", "arialbd.ttf")
REG = font_file("segoeui.ttf", "arial.ttf")


def fit(text, start, max_width, bold=True):
    path = BOLD if bold else REG
    size = start
    while size > 10:
        f = ImageFont.truetype(path, size)
        if f.getlength(text) <= max_width:
            return f
        size -= 1
    return ImageFont.truetype(path, 10)


def gradient():
    im = Image.new("RGB", (W, H), BG_TOP)
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=(
            round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
            round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
            round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t),
        ))
    # мягкие волны
    wave = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wave)
    for i, yy in enumerate((470, 505, 540, 575, 610)):
        wd.arc([-120 + i * 40, yy - 90, W + 120, yy + 90], 200, 340,
               fill=(95, 199, 255, 20 + i * 3), width=3)
    im = Image.alpha_composite(im.convert("RGBA"), wave)
    # сетка
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 70):
        gd.line([(x, 0), (x, H)], fill=(120, 200, 255, 10))
    for y in range(0, H, 70):
        gd.line([(0, y), (W, y)], fill=(120, 200, 255, 10))
    return Image.alpha_composite(im, grid)


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0], im.size[1]], radius=radius, fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def main():
    if not ICON.exists():
        raise SystemExit(f"Нет иконки: {ICON}")
    if not SHOT.exists():
        raise SystemExit(f"Нет скриншота: {SHOT}")

    im = gradient()
    d = ImageDraw.Draw(im)

    # Левая колонка
    icon = Image.open(ICON).convert("RGBA").resize((128, 128), Image.LANCZOS)
    icon = rounded(icon, 28)
    im.alpha_composite(icon, (56, 54))

    badge_f = ImageFont.truetype(REG, 20)
    d.rounded_rectangle([204, 60, 350, 100], radius=20, fill=(23, 97, 143), outline=(95, 199, 255, 120))
    d.text((222, 69), "6+  ·  HTML5", font=badge_f, fill=TEXT)
    d.text((204, 116), "mensori.dev", font=ImageFont.truetype(REG, 28), fill=MUTED)

    title_f = fit("МОРСКОЙ БОЙ", 66, 520)
    d.text((54, 170), "МОРСКОЙ БОЙ", font=title_f, fill=TEXT)
    sub_f = fit("Морская арена", 34, 500)
    d.text((56, 246), "Морская арена", font=sub_f, fill=ACCENT)

    desc = "Умный бот, рейтинг ELO, ранги и тактика"
    desc_f = fit(desc, 27, 500, bold=False)
    d.text((56, 305), desc, font=desc_f, fill=TEXT)
    desc2 = "Поле 8×8, 10×10 или 12×12. Испытание дня."
    d.text((56, 344), desc2, font=fit(desc2, 23, 510, bold=False), fill=MUTED)

    chips = ["Рейтинг ELO", "3 размера поля", "Без рекламы"]
    x = 56
    chip_f = ImageFont.truetype(REG, 19)
    for text in chips:
        tw = chip_f.getlength(text)
        d.rounded_rectangle([x, 402, x + tw + 32, 442], radius=20, fill=(14, 47, 72), outline=(55, 130, 172))
        d.text((x + 16, 410), text, font=chip_f, fill=TEXT)
        x += tw + 44

    # Кнопка
    btn_f = ImageFont.truetype(BOLD, 26)
    btn_text = "Играть бесплатно"
    bw = btn_f.getlength(btn_text)
    d.rounded_rectangle([54, 486, 54 + bw + 76, 552], radius=33, fill=(245, 197, 66))
    d.text((54 + 38, 505), btn_text, font=btn_f, fill=(8, 26, 42))
    d.text((54, 578), "mensori-dev.github.io/seabattle", font=ImageFont.truetype(REG, 18), fill=(120, 163, 188))

    # Скриншот справа
    shot = Image.open(SHOT).convert("RGBA")
    sw = 500
    sh = round(shot.height * sw / shot.width)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    shot = rounded(shot, 26)

    card_x, card_y = 588, 118
    # тень и подсветка
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.rounded_rectangle([card_x - 8, card_y - 8, card_x + sw + 8, card_y + sh + 8],
                         radius=34, fill=(40, 150, 220, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    im.alpha_composite(glow)

    frame = Image.new("RGBA", (sw + 8, sh + 8), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rounded_rectangle([0, 0, sw + 7, sh + 7], radius=30, fill=(9, 28, 45, 235),
                         outline=(95, 199, 255, 210), width=3)
    im.alpha_composite(frame, (card_x - 4, card_y - 4))
    im.alpha_composite(shot, (card_x, card_y))

    # Плашка на скриншоте
    tag_f = ImageFont.truetype(BOLD, 19)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([card_x + 18, card_y + 18, card_x + 208, card_y + 54], radius=18, fill=(6, 20, 34, 220))
    d.text((card_x + 34, card_y + 25), "ТАКТИКА В БОЮ", font=tag_f, fill=GOLD)

    # Низкая полоса
    d.rounded_rectangle([588, 540, 1064, 588], radius=24, fill=(8, 36, 58, 210), outline=(55, 130, 172))
    d.text((612, 550), "Испытание дня · +60 к рейтингу", font=ImageFont.truetype(REG, 19), fill=TEXT)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(OUT, "PNG", optimize=True)
    jpg = OUT.with_suffix(".jpg")
    im.convert("RGB").save(jpg, "JPEG", quality=92, optimize=True, progressive=True)
    print(f"Готово: {OUT} ({OUT.stat().st_size} bytes), {jpg} ({jpg.stat().st_size} bytes), {W}x{H}")


if __name__ == "__main__":
    main()
