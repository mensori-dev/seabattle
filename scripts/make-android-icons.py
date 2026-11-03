"""Генерирует иконки Android из той же графики, что и PWA.

Нужно, чтобы adaptive-иконка была собрана правильно: отдельный фон
и отдельный якорь на прозрачном слое, а не одна картинка целиком.

Запуск:  npm run android:icons   (или python scripts/make-android-icons.py)
"""

import importlib.util
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

# Плотности Android: 48dp для обычной иконки, 108dp для adaptive-слоёв.
DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}
LEGACY_DP = 48
ADAPTIVE_DP = 108
# Якорь занимает ~53% высоты слоя — внутри безопасной зоны adaptive icon.
ANCHOR_SCALE = 0.86


def load_icons():
    path = os.path.join(ROOT, "scripts", "make-icons.py")
    spec = importlib.util.spec_from_file_location("make_icons", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def save(img, density, name):
    folder = os.path.join(RES, f"mipmap-{density}")
    os.makedirs(folder, exist_ok=True)
    img.save(os.path.join(folder, name), optimize=True)


def circle(img):
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def main():
    icons = load_icons()

    for density, k in DENSITIES.items():
        # Обычная и круглая иконка для старых Android.
        size = max(1, round(LEGACY_DP * k))
        full = icons.render(size)
        save(full, density, "ic_launcher.png")
        save(circle(full), density, "ic_launcher_round.png")

        # Adaptive icon: фон и якорь отдельными слоями.
        layer = max(1, round(ADAPTIVE_DP * k))
        save(icons.background(layer), density, "ic_launcher_background.png")
        save(icons.render_anchor(layer, ANCHOR_SCALE), density, "ic_launcher_foreground.png")

        # Monochrome-слой для тематических иконок Android 13+.
        mask = icons.anchor_mask(layer, ANCHOR_SCALE)
        mono = Image.new("RGBA", (layer, layer), (0, 0, 0, 0))
        white = Image.new("RGBA", (layer, layer), (255, 255, 255, 255))
        save(Image.composite(white, mono, mask), density, "ic_launcher_monochrome.png")

    print("готово: adaptive-иконки Android в", RES)


if __name__ == "__main__":
    main()
