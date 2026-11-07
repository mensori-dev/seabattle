#!/usr/bin/env python3
"""Обложки портфолио Kwork №3 — упаковка HTML5-игры в APK (1920×1280).

Тема другая: не экраны игры, а процесс упаковки — магазин, иконки,
скриншоты для карточки, PWA и чек-лист публикации. Палитра и хелперы
берутся из `make-kwork-portfolio.py`.

Запуск: python scripts/make-kwork-portfolio3.py
Результат: docs/kwork/pf-cover3/*.png
"""

import importlib.util
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("pf", ROOT / "scripts" / "make-kwork-portfolio.py")
pf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pf)

SHOTS = ROOT / "docs" / "screenshots"
ASSETS = ROOT / "assets"
OUT = ROOT / "docs" / "kwork" / "pf-cover3"
pf.OUT = OUT

TEAL = pf.TEAL
WHITE = pf.WHITE
MUTED = pf.MUTED


def font(size, bold=True):
    return ImageFont.truetype(pf.FONT_BOLD if bold else pf.FONT_REG, max(8, round(size)))


def icon_card(base, draw, path, x, y, size, radius):
    """Иконка в скруглённой карточке с тенью."""
    x, y, size = round(x), round(y), round(size)
    pf.shadowed_card(base, x, y, size, size, radius)
    im = Image.open(path).convert("RGB").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius, fill=255)
    base.paste(im, (x, y), mask)
    draw.rounded_rectangle([x, y, x + size - 1, y + size - 1], radius=radius,
                           outline=TEAL + (130,), width=max(2, round(size / 90)))


def panel(draw, box, radius, fill=(255, 255, 255, 10), outline=TEAL + (70,)):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=max(2, round(radius / 14)))


def check_row(draw, k, x, y, text, size=30):
    r = round(15 * k)
    draw.ellipse([x, y + 4 * k, x + 2 * r, y + 4 * k + 2 * r], fill=TEAL + (36,), outline=TEAL + (200,),
                 width=max(1, round(2 * k)))
    f = font(size * k, False)
    draw.line([x + r * 0.55, y + 4 * k + r, x + r * 0.9, y + 4 * k + r * 1.45], fill=TEAL, width=max(2, round(3 * k)))
    draw.line([x + r * 0.9, y + 4 * k + r * 1.45, x + r * 1.5, y + 4 * k + r * 0.6], fill=TEAL,
              width=max(2, round(3 * k)))
    draw.text((x + 2 * r + 16 * k, y), text, font=f, fill=(214, 234, 245, 255))


def store_badge(draw, k, x, y, text, sub, w=470):
    box = [x, y, x + w * k, y + 96 * k]
    panel(draw, box, round(20 * k), fill=(61, 218, 215, 16))
    draw.text((x + 26 * k, y + 18 * k), text, font=font(34 * k), fill=WHITE)
    draw.text((x + 26 * k, y + 58 * k), sub, font=font(22 * k, False), fill=MUTED)


def main():
    def rustore(img, d, k):
        # телефон с игрой + иконка приложения рядом
        pf.phone(img, d, SHOTS / "03-battle.png", 1090 * k, 150 * k, 450 * k, 800 * k)
        icon_card(img, d, ASSETS / "icon-512.png", 1560 * k, 830 * k, 250 * k, round(56 * k))
        d.text((1560 * k, 1100 * k), "release APK", font=font(26 * k, False), fill=MUTED)

    def icons(img, d, k):
        icon_card(img, d, ASSETS / "icon-1024.png", 1180 * k, 180 * k, 380 * k, round(86 * k))
        icon_card(img, d, ASSETS / "icon-512.png", 1580 * k, 470 * k, 250 * k, round(56 * k))
        icon_card(img, d, ASSETS / "icon-maskable-512.png", 1120 * k, 660 * k, 220 * k, round(50 * k))
        d.text((1120 * k, 920 * k), "adaptive · monochrome", font=font(26 * k, False), fill=MUTED)
        d.text((1580 * k, 750 * k), "1024 · 512 · 192", font=font(26 * k, False), fill=MUTED)

    def shots(img, d, k):
        w, h = 250 * k, 445 * k
        xs = (1040, 1300, 1560)
        files = ("03-battle.png", "07-campaign.png", "01-menu.png")
        for x, name in zip(xs, files):
            pf.phone(img, d, SHOTS / name, x * k, 260 * k, w, h)
        d.text((1040 * k, 740 * k), "1080×1920 · 720×1280 · без обрезки", font=font(26 * k, False), fill=MUTED)
        store_badge(d, k, 1040 * k, 830 * k, "RuStore", "карточка и скриншоты")
        store_badge(d, k, 1040 * k, 950 * k, "Яндекс Игры", "баннер и превью")

    def pwa(img, d, k):
        pf.phone(img, d, SHOTS / "01-menu.png", 1150 * k, 170 * k, 440 * k, 790 * k)
        box = [1140 * k, 1000 * k, 1620 * k, 1130 * k]
        panel(d, box, round(24 * k), fill=(61, 218, 215, 18))
        d.text((1168 * k, 1022 * k), "Установить на телефон", font=font(28 * k), fill=WHITE)
        d.text((1168 * k, 1064 * k), "работает офлайн", font=font(24 * k, False), fill=MUTED)

    def publish(img, d, k):
        x, y, w = 1030 * k, 190 * k, 790 * k
        h = 900 * k
        panel(d, [x, y, x + w, y + h], round(28 * k), fill=(255, 255, 255, 8))
        d.text((x + 34 * k, y + 30 * k), "ЧЕК-ЛИСТ ПУБЛИКАЦИИ", font=font(24 * k), fill=TEAL)
        rows = (
            "APK и AAB подписаны",
            "versionCode и версия подняты",
            "Иконки и сплэш по требованиям",
            "Политика конфиденциальности",
            "Карточка: скриншоты и описание",
            "Модерация RuStore пройдена",
            "Сборка для Яндекс Игр",
        )
        ry = y + 86 * k
        for item in rows:
            check_row(d, k, x + 34 * k, ry, item, 30)
            ry += 84 * k
        bar = [x + 34 * k, ry + 30 * k, x + w - 34 * k, ry + 62 * k]
        d.rounded_rectangle(bar, radius=16 * k, fill=(255, 255, 255, 16))
        d.rounded_rectangle([bar[0], bar[1], bar[0] + (bar[2] - bar[0]) * 0.82, bar[3]], radius=16 * k,
                            fill=TEAL + (170,))
        d.text((x + 34 * k, ry + 78 * k), "7 из 7 · готово к магазину", font=font(24 * k, False), fill=MUTED)

    pf.cover("pf-1-rustore.png", "ANDROID · RUSTORE",
             ["APK ДЛЯ", "RUSTORE"],
             ["Подписанный release APK и AAB", "Проверка установки на телефоне", "Версия, versionCode и обновления"],
             ["Capacitor", "Signed", "RuStore"], rustore)

    pf.cover("pf-2-icons.png", "ГРАФИКА · МАГАЗИНЫ",
             ["ИКОНКИ", "И СПЛЭШИ"],
             ["Адаптивная иконка Android", "Maskable и monochrome версии", "Сплэш под все разрешения"],
             ["1024 px", "Adaptive", "PWA"], icons)

    pf.cover("pf-3-shots.png", "ВИТРИНА · КАРТОЧКА",
             ["СКРИНШОТЫ", "ДЛЯ КАРТОЧКИ"],
             ["Портретные 1080×1920", "Альбомные 1280×720", "Обложки 1920×1080 и 1600×1200"],
             ["RuStore", "VK", "Store"], shots)

    pf.cover("pf-4-pwa.png", "ОФЛАЙН · PWA",
             ["PWA", "И ОФЛАЙН"],
             ["Манифест и service worker", "Установка на домашний экран", "Работа без интернета"],
             ["Manifest", "SW", "Offline"], pwa)

    pf.cover("pf-5-publish.png", "ПУБЛИКАЦИЯ · ПОД КЛЮЧ",
             ["ПУБЛИКАЦИЯ", "ПОД КЛЮЧ"],
             ["RuStore, Яндекс Игры, Google Play", "Карточка, скриншоты и тексты", "Помощь с модерацией и обновлениями"],
             ["RuStore", "Yandex", "Play"], publish)


if __name__ == "__main__":
    main()
