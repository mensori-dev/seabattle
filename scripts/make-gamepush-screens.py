#!/usr/bin/env python3
"""GamePush/VK Play: скриншоты 1280x720 и 720x1280."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "gamepush-assets"
LAND_SRC = ROOT / "dist" / "vk-assets" / "screenshots"
PORT_SRC = ROOT / "docs" / "screenshots"

LAND = [
    ("01-menu-1280x720.png", "01-menu-1200x600.png"),
    ("02-placement-1280x720.png", "02-placement-1200x600.png"),
    ("03-prepare-1280x720.png", "03-prepare-1200x600.png"),
    ("04-battle-1280x720.png", "04-battle-1200x600.png"),
    ("05-battle-shots-1280x720.png", "05-battle-shots-1200x600.png"),
]
PORT = [
    ("01-menu-720x1280.png", "01-menu.png"),
    ("02-placement-720x1280.png", "02-placement.png"),
    ("03-battle-720x1280.png", "03-battle.png"),
    ("04-rules-720x1280.png", "04-rules.png"),
    ("05-achievements-720x1280.png", "05-achievements.png"),
]


def crop_16_9(im):
    w, h = im.size
    target = 16 / 9
    if w / h > target:
        nw = round(h * target)
        left = (w - nw) // 2
        return im.crop((left, 0, left + nw, h))
    nh = round(w / target)
    top = (h - nh) // 2
    return im.crop((0, top, w, top + nh))


def main():
    land_dir = OUT / "screenshots-landscape"
    port_dir = OUT / "screenshots-portrait"
    land_dir.mkdir(parents=True, exist_ok=True)
    port_dir.mkdir(parents=True, exist_ok=True)

    for out_name, src_name in LAND:
        src = LAND_SRC / src_name
        if not src.exists():
            raise SystemExit(f"Нет исходника: {src}")
        im = crop_16_9(Image.open(src).convert("RGB")).resize((1280, 720), Image.LANCZOS)
        im.save(land_dir / out_name, "PNG", optimize=True)

    for out_name, src_name in PORT:
        src = PORT_SRC / src_name
        if not src.exists():
            raise SystemExit(f"Нет исходника: {src}")
        im = Image.open(src).convert("RGB").resize((720, 1280), Image.LANCZOS)
        im.save(port_dir / out_name, "PNG", optimize=True)

    print(f"Готово: {land_dir} и {port_dir}")


if __name__ == "__main__":
    main()
