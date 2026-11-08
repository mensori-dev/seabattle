"""Обложка кворка №5 «PWA из готового сайта» (1200x800).

Рисуется с нуля: тёмный градиент, крупный заголовок, три плашки-факта
и макет телефона с установленным приложением.
Запуск: python scripts/make-kwork-cover5.py
"""
import pathlib
import importlib.util

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "kwork" / "kwork-5-cover.png"

spec = importlib.util.spec_from_file_location(
    "kwork_assets", ROOT / "scripts" / "make-kwork-assets.py"
)
kwork = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kwork)

TEAL = kwork.TEAL
FONT_BOLD = kwork.FONT_BOLD
FONT = kwork.FONT_REG
SS = 2
W, H = 1200, 800


def fit(text, size, max_width, path=FONT_BOLD, min_size=18):
    sz = size
    while sz > min_size:
        f = ImageFont.truetype(path, sz)
        if f.getlength(text) <= max_width:
            return f
        sz -= 2
    return ImageFont.truetype(path, min_size)


def rounded(draw, box, r, fill=None, outline=None, width=2):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def main():
    img = kwork.linear_background(W * SS, H * SS).resize((W, H), Image.LANCZOS)
    draw = ImageDraw.Draw(img, "RGBA")

    # Мягкое бирюзовое свечение справа, под макетом телефона.
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([720, 120, 1220, 700], fill=TEAL + (38,))
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img, "RGBA")

    # Метка вверху.
    chip_f = ImageFont.truetype(FONT_BOLD, 22)
    label = "PWA · ДОРАБОТКА САЙТА"
    lw = chip_f.getlength(label)
    rounded(draw, [80, 74, 80 + lw + 44, 74 + 46], 23, fill=(255, 255, 255, 14),
            outline=TEAL + (120,), width=2)
    draw.text((80 + 22, 74 + 11), label, font=chip_f, fill=TEAL)

    # Заголовок.
    l1 = "Сайт, который"
    l2 = "ставится на телефон"
    f1 = fit(l1, 84, 700)
    draw.text((80, 156), l1, font=f1, fill=(255, 255, 255, 255))
    draw.text((80, 156 + 96), l2, font=fit(l2, 84, 700), fill=TEAL)

    # Подзаголовок.
    sub = ImageFont.truetype(FONT, 30)
    draw.text((80, 372), "Иконка на экране, запуск без адресной строки,",
              font=sub, fill=(255, 255, 255, 190))
    draw.text((80, 414), "работа при слабом интернете и офлайн.",
              font=sub, fill=(255, 255, 255, 190))

    # Три факта.
    facts = [("Иконка", "на рабочем столе"), ("Офлайн", "кэш и заглушка"),
             ("Lighthouse", "замер до и после")]
    y = 520
    for i, (a, b) in enumerate(facts):
        x = 80 + i * 218
        rounded(draw, [x, y, x + 202, y + 132], 18, fill=(20, 44, 64),
                outline=(40, 96, 112), width=2)
        fa = ImageFont.truetype(FONT_BOLD, 26)
        fb = ImageFont.truetype(FONT, 22)
        draw.text((x + 20, y + 26), a, font=fa, fill=TEAL)
        draw.text((x + 20, y + 76), b, font=fb, fill=(176, 200, 214))

    # Телефон справа.
    px, py, pw, ph = 800, 170, 300, 560
    rounded(draw, [px, py, px + pw, py + ph], 44, fill=(8, 16, 28, 235),
            outline=(255, 255, 255, 40), width=3)
    # Экран.
    draw.rectangle([px + 12, py + 12, px + pw - 12, py + ph - 12],
                   fill=(14, 26, 42, 255))
    # Пилюля сверху.
    rounded(draw, [px + pw // 2 - 34, py + 24, px + pw // 2 + 34, py + 36], 6,
            fill=(255, 255, 255, 60))

    # Иконка приложения (скруглённый квадрат с якорем-буквой).
    isz = 132
    ix, iy = px + (pw - isz) // 2, py + 110
    rounded(draw, [ix, iy, ix + isz, iy + isz], 30, fill=(16, 34, 52, 255),
            outline=TEAL + (150,), width=3)
    fM = ImageFont.truetype(FONT_BOLD, 78)
    tw = fM.getlength("M")
    draw.text((ix + (isz - tw) / 2, iy + 22), "M", font=fM, fill=TEAL)
    # Три точки-волны — бренд.
    for i in (-1, 0, 1):
        cx = ix + isz // 2 + i * 16
        r = 5 if i == 0 else 3
        draw.ellipse([cx - r, iy + isz - 26, cx + r, iy + isz - 26 + 2 * r],
                     fill=TEAL + (170,))

    # Название под иконкой.
    fname = ImageFont.truetype(FONT_BOLD, 26)
    name = "Морская арена"
    draw.text((px + (pw - fname.getlength(name)) / 2, iy + isz + 26), name,
              font=fname, fill=(255, 255, 255, 235))

    # Кнопка «Открыть».
    bx0, bx1 = px + 46, px + pw - 46
    rounded(draw, [bx0, iy + isz + 82, bx1, iy + isz + 134], 26, fill=TEAL + (255,))
    fb2 = ImageFont.truetype(FONT_BOLD, 24)
    txt = "Открыть"
    draw.text(((bx0 + bx1 - fb2.getlength(txt)) / 2, iy + isz + 95), txt,
              font=fb2, fill=(4, 12, 20, 255))

    # Плашка «без адресной строки» внизу телефона.
    fnote = ImageFont.truetype(FONT, 20)
    note = "без адресной строки"
    draw.text((px + (pw - fnote.getlength(note)) / 2, py + ph - 74), note,
              font=fnote, fill=(255, 255, 255, 120))
    # Зачёркнутая адресная строка.
    lx = px + 96
    ly = py + ph - 42
    draw.line([lx, ly, px + pw - 96, ly], fill=(235, 90, 90, 210), width=4)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"{OUT} {OUT.stat().st_size} B {img.size}")


if __name__ == "__main__":
    main()
