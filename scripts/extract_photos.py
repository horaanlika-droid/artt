#!/usr/bin/env python3
"""
Фото товаров из прайс-листа.

В PDF-прайсе Cocktail Embassy каждая позиция уже снабжена фото (артикул = строка
таблицы). Скрипт вытаскивает эти изображения штатными средствами PDF, находит
соответствие «картинка ↔ артикул» по вертикальной позиции строки и раскладывает
готовые файлы в webapp/assets/products/.

Обработка мягкая, без «доработки» товара:
  * обрезка пустых белых полей вокруг бокала (кроме небольшого отступа),
  * апскейл ×2 фильтром Lanczos (браузер не размывает картинку в крупной плитке),
  * сохранение в JPEG на нейтральном фоне.

Запуск:
    python3 scripts/extract_photos.py                     # PDF из корня репозитория
    python3 scripts/extract_photos.py price.pdf           # другой файл
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

import pymupdf
from PIL import Image, ImageChops

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "webapp" / "assets" / "products"
SCALE = 2
PAD_RATIO = 0.06  # отступ вокруг бокала после обрезки


def find_pdf() -> pathlib.Path:
    if len(sys.argv) > 1:
        candidate = pathlib.Path(sys.argv[1])
        return candidate if candidate.is_absolute() else ROOT / candidate
    for file in sorted(ROOT.glob("*.pdf")):
        return file
    raise SystemExit("PDF-прайс не найден — передайте путь аргументом")


def article_rows(page) -> list[tuple[str, float, float]]:
    """Строки таблицы: артикул -> (y начала, y конца) по блокам текста."""
    rows: list[tuple[str, float, float]] = []
    pending: tuple[str, float] | None = None
    for block in page.get_text("blocks"):
        x0, y0, x1, y1, text = block[0], block[1], block[2], block[3], block[4].strip()
        if x0 < 70:  # колонка с описанием, остальное — служебное
            continue
        match = re.search(r"COD:\s*([A-Z]{2}\d{4})", text)
        if match:
            pending = (match.group(1), y0)
            continue
        if pending:
            article, top = pending
            rows.append((article, top, y1))
            pending = None
    return rows


def product_images(page) -> list[tuple[int, list[float]]]:
    items = []
    for info in page.get_image_info(xrefs=True):
        bbox = list(info["bbox"])
        width, height = info["width"], info["height"]
        # фото товаров — небольшие картинки в правой колонке; баннеры и иконки отсекаем
        if bbox[0] < 100 or width > 200 or height < 60 or width == height == 0:
            continue
        if width == 816:  # скриншот интерфейса Google Таблиц в шапке
            continue
        items.append((info["xref"], bbox))
    return items


def trim_white(image: Image.Image) -> Image.Image:
    """Обрезает пустые белые поля, оставляя аккуратный отступ."""
    rgb = image.convert("RGB")
    background = Image.new("RGB", rgb.size, (255, 255, 255))
    diff = ImageChops.difference(rgb, background).convert("L")
    bbox = diff.point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bbox:
        return rgb
    pad = int(max(rgb.size) * PAD_RATIO)
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(rgb.width, bbox[2] + pad)
    bottom = min(rgb.height, bbox[3] + pad)
    return rgb.crop((left, top, right, bottom))


def main() -> int:
    pdf = find_pdf()
    doc = pymupdf.open(pdf)
    page = doc[0]
    rows = article_rows(page)
    images = product_images(page)
    if not rows or not images:
        raise SystemExit("Не удалось разобрать прайс: нет строк товаров или картинок")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report = {}
    for article, top, bottom in rows:
        center = (top + bottom) / 2
        xref, bbox = min(images, key=lambda item: abs((item[1][1] + item[1][3]) / 2 - center))
        pix = pymupdf.Pixmap(doc, xref)
        if pix.colorspace and pix.colorspace.name != "DeviceRGB":
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        image = trim_white(image)
        image = image.resize((image.width * SCALE, image.height * SCALE), Image.LANCZOS)
        target = OUT_DIR / f"{article}.jpg"
        image.save(target, "JPEG", quality=92, optimize=True, subsampling=0)
        report[article] = {"source": pdf.name, "size": list(image.size), "file": target.name}

    (OUT_DIR / "photos.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"[photos] извлечено {len(report)} фото из «{pdf.name}» → {OUT_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
