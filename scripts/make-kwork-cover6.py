"""Обложка кворка №6 «Перенос сайта на хостинг + SSL» (1200x800).

Запуск: python scripts/make-kwork-cover6.py
Результат: docs/kwork/kwork-6-cover.png
"""
import importlib.util
import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "kwork" / "kwork-6-cover.png"

spec = importlib.util.spec_from_file_location(
    "kwork_assets", ROOT / "scripts" / "make-kwork-assets.py"
)
kwork = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kwork)

TEAL = kwork.TEAL
WHITE = kwork.WHITE
FONT_BOLD = kwork.FONT_BOLD
FONT_REG = kwork.FONT_REG

W, H = 1200, 800
SS = 2

C_BG_1 = (11, 36, 56)
C_BG_2 = (7, 26, 43)
C_CARD = (16, 42, 62)
C_LINE = (38, 92, 108)
C_DIM = (150, 178, 194)
C_GREEN = (86, 214, 143)


def text(d, xy, s, font, fill):
    d.text(xy, s, font=font, fill=fill)


def rounded(d, box, r, fill, outline=None, width=2):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def main():
    img = kwork.linear_background(W * SS, H * SS, C_BG_1, C_BG_2, 60)
    img = img.resize((W, H), Image.LANCZOS).convert("RGB")
    d = ImageDraw.Draw(img)

    # Свечение справа
    glow = Image.new("RGB", (W, H), C_BG_2)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W * 0.62, -H * 0.25, W * 1.18, H * 0.85], fill=(18, 66, 82))
    glow = glow.filter(__import__("PIL.ImageFilter", fromlist=["ImageFilter"]).GaussianBlur(120))
    img = Image.blend(img, glow, 0.55)
    d = ImageDraw.Draw(img, "RGB")

    # Тонкая сетка
    for x in range(0, W, 48):
        d.line([(x, 0), (x, H)], fill=(14, 40, 58), width=1)

    # Плашка сверху
    rounded(d, [72, 64, 372, 110], 12, C_CARD, C_LINE, 2)
    text(d, (94, 76), "ПЕРЕЕЗД · ХОСТИНГ", ImageFont.truetype(FONT_BOLD, 20), TEAL)

    # Заголовок
    f_head = ImageFont.truetype(FONT_BOLD, 62)
    text(d, (72, 158), "Перенос сайта", f_head, WHITE)
    text(d, (72, 232), "на новый хостинг", f_head, TEAL)

    f_sub = ImageFont.truetype(FONT_REG, 30)
    text(d, (72, 356), "Домен, SSL и почта — без простоя", f_sub, C_DIM)

    # Факты
    facts = [
        (72, "0 минут", "простой"),
        (330, "5 минут", "выпуск SSL"),
        (566, "24/7", "бэкапы"),
    ]
    for fx, big, small in facts:
        f_big = ImageFont.truetype(FONT_BOLD, 40)
        f_sm = ImageFont.truetype(FONT_REG, 22)
        text(d, (fx, 470), big, f_big, WHITE)
        text(d, (fx, 522), small, f_sm, C_DIM)

    # Правая карточка — браузер
    bx, by, bw, bh = 660, 210, 470, 340
    rounded(d, [bx, by, bx + bw, by + bh], 22, C_CARD, C_LINE, 2)
    d.rounded_rectangle([bx + 18, by + 18, bx + bw - 18, by + 62], radius=10, fill=(11, 32, 48))
    for i, c in enumerate([(232, 96, 96), (232, 191, 96), (96, 200, 140)]):
        d.ellipse([bx + 34 + i * 22, by + 33, bx + 46 + i * 22, by + 45], fill=c)
    text(d, (bx + 120, by + 27), "https://ваш-сайт.ru", ImageFont.truetype(FONT_REG, 20), C_DIM)
    # Замок
    d.rounded_rectangle([bx + 396, by + 26, bx + 416, by + 46], radius=6, fill=C_GREEN)
    d.arc([bx + 399, by + 16, bx + 413, by + 34], 180, 360, fill=C_GREEN, width=5)

    rows = [
        ("Сайт работает", "без падений", C_GREEN),
        ("SSL выпущен", "https, зелёный замок", TEAL),
        ("Скорость", "+42 % после переезда", WHITE),
        ("Бэкапы", "каждый день, 30 дней", WHITE),
    ]
    y = by + 92
    for title, note, col in rows:
        d.ellipse([bx + 30, y + 8, bx + 44, y + 22], fill=col)
        text(d, (bx + 60, y), title, ImageFont.truetype(FONT_BOLD, 24), WHITE)
        text(d, (bx + 60, y + 30), note, ImageFont.truetype(FONT_REG, 20), C_DIM)
        y += 62

    # Нижняя полоса
    rounded(d, [72, 636, 1128, 712], 16, (13, 38, 55), C_LINE, 1)
    f_foot = ImageFont.truetype(FONT_REG, 24)
    text(d, (104, 660), "Домен · DNS · SSL · почта · перенос базы — всё под ключ", f_foot, C_DIM)
    text(d, (980, 660), "1 500 ₽", ImageFont.truetype(FONT_BOLD, 28), TEAL)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"{OUT} {OUT.stat().st_size} B {img.size}")


if __name__ == "__main__":
    main()
