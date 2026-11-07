"""Обложка кворка «Правки и доработка сайта» (1200×800).

Только крупный текст и телефон-макет: обложка видна в каталоге мелко.

Запуск: python scripts/make-kwork-cover4.py
Результат: docs/kwork/kwork-4-cover.png
"""

import importlib.util
import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "kwork" / "kwork-4-cover.png"

spec = importlib.util.spec_from_file_location(
    "kwork_assets", ROOT / "scripts" / "make-kwork-assets.py"
)
kwork = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kwork)

TEAL = kwork.TEAL
WHITE = kwork.WHITE
FONT_BOLD = kwork.FONT_BOLD

W, H = 1200, 800
SS = 2


def f(size):
    return ImageFont.truetype(FONT_BOLD, size)


def main():
    img = kwork.linear_background(W * SS, H * SS).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    S = SS

    # Верхняя метка
    d.text((70 * S, 62 * S), "ДОРАБОТКА САЙТА", font=f(30 * S), fill=TEAL + (235,))

    # Заголовок
    d.text((70 * S, 130 * S), "Правки и", font=f(84 * S), fill=WHITE)
    d.text((70 * S, 225 * S), "доработка", font=f(84 * S), fill=WHITE)
    d.text((70 * S, 320 * S), "сайта", font=f(84 * S), fill=TEAL)

    # Пункты
    items = ["вёрстка и адаптив", "баги JavaScript", "формы и кнопки", "хостинг и домен"]
    y = 500
    for it in items:
        d.ellipse([72 * S, (y + 12) * S, 84 * S, (y + 24) * S], fill=TEAL + (220,))
        d.text((100 * S, y * S), it, font=f(34 * S), fill=WHITE)
        y += 62

    # Справа: телефон «до/после»
    px0, py0, px1, py1 = 780, 130, 1120, 690
    d.rounded_rectangle([px0 * S, py0 * S, px1 * S, py1 * S], radius=34 * S,
                        outline=TEAL + (190,), width=5 * S, fill=(9, 30, 47, 255))
    # «до»: кривая красная полоса и обрезанный текст
    d.rectangle([820 * S, 190 * S, 1090 * S, 206 * S], fill=(235, 106, 96, 220))
    d.rectangle([820 * S, 240 * S, 980 * S, 254 * S], fill=WHITE + (80,))
    d.rectangle([820 * S, 278 * S, 1040 * S, 292 * S], fill=WHITE + (55,))
    # «после»: ровные блоки
    d.rounded_rectangle([820 * S, 360 * S, 1090 * S, 470 * S], radius=12 * S,
                        outline=TEAL + (200,), width=3 * S)
    d.rounded_rectangle([820 * S, 500 * S, 1090 * S, 590 * S], radius=12 * S,
                        fill=TEAL + (70,))
    d.rounded_rectangle([820 * S, 620 * S, 990 * S, 660 * S], radius=12 * S,
                        fill=WHITE + (90,))

    out = img.resize((W, H), Image.LANCZOS).convert("RGB")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG", optimize=True)
    print(f"{OUT} {OUT.stat().st_size} B {out.size}")


if __name__ == "__main__":
    main()
