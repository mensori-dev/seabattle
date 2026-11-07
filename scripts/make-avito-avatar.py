"""Аватар для Авито: тёмный градиент, бирюзовое кольцо и монограмма M.

Аватар в Авито показывается круглым и маленьким (48-96 px),
поэтому никакого мелкого текста — только крупная буква.

Запуск: python scripts/make-avito-avatar.py
"""
import importlib.util
import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "avito" / "avatar-512.png"

spec = importlib.util.spec_from_file_location(
    "kwork_assets", ROOT / "scripts" / "make-kwork-assets.py"
)
kwork = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kwork)

TEAL = kwork.TEAL
FONT_BOLD = kwork.FONT_BOLD
SS = 4  # суперсэмплинг


def avatar(size=512):
    img = kwork.radial_background(size)
    draw = ImageDraw.Draw(img, "RGBA")

    # Кольцо чуть меньше, чем у Kwork: аватар обрезается в круг.
    ring_r = int(size * 0.40)
    cx = cy = size // 2
    draw.ellipse(
        [cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r],
        outline=TEAL + (90,),
        width=max(8, round(size / 34)),
    )

    font = ImageFont.truetype(FONT_BOLD, int(size * 0.58))
    kwork.centered_text(draw, (0, -int(size * 0.03), size, size - int(size * 0.03)),
                        "M", font, TEAL)

    # Три точки-волны под буквой — намёк на «море» проекта.
    r = max(4, round(size / 70))
    gap = round(size * 0.075)
    y = round(size * 0.80)
    for i in (-1, 0, 1):
        x = cx + i * gap
        rad = r if i == 0 else max(3, round(r * 0.72))
        draw.ellipse([x - rad, y - rad, x + rad, y + rad],
                     fill=TEAL + (150 if i == 0 else 90,))

    return img.convert("RGB")


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    big = avatar(512 * SS).resize((512, 512), Image.LANCZOS)
    big.save(OUT, "PNG", optimize=True)
    print(f"{OUT} {OUT.stat().st_size} B {big.size}")


if __name__ == "__main__":
    main()
