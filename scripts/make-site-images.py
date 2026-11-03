# -*- coding: utf-8 -*-
"""Сжимает скриншоты игры для сайта-витрины: site/img/*.webp + og.jpg."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "screenshots"
OUT = ROOT / "site" / "img"
WIDTH = 720
QUALITY = 82
BG = (7, 26, 43)
ACCENT = (255, 122, 89)


def make_screens():
    files = sorted(SRC.glob("*.png"))
    if not files:
        raise SystemExit("нет скриншотов в docs/screenshots")
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for src in files:
        img = Image.open(src).convert("RGB")
        height = round(img.height * WIDTH / img.width)
        img = img.resize((WIDTH, height), Image.LANCZOS)
        dest = OUT / (src.stem + ".webp")
        img.save(dest, "WEBP", quality=QUALITY, method=6)
        size = dest.stat().st_size
        total += size
        print("%-16s %5d KB" % (dest.name, size // 1024))
    print("итого: %d KB" % (total // 1024))


def make_og():
    src = SRC / "03-battle.png"
    if not src.exists():
        return
    canvas = Image.new("RGB", (1200, 630), BG)
    shot = Image.open(src).convert("RGB")
    height = 570
    width = round(shot.width * height / shot.height)
    shot = shot.resize((width, height), Image.LANCZOS)
    canvas.paste(shot, ((1200 - width) // 2, 30))
    canvas.save(OUT / "og.jpg", "JPEG", quality=86, optimize=True)
    print("og.jpg          %5d KB" % ((OUT / "og.jpg").stat().st_size // 1024))


if __name__ == "__main__":
    make_screens()
    make_og()
