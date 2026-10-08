#!/usr/bin/env python3
"""Извлечь формы посуды непосредственно из PDF-прайса Cocktail Embassy.

Никакой генерации/перерисовки товара: исходные контуры, пропорции, ножки и основания
берутся из растра PDF. Для тёмной витрины только подавляется фон фотографии и усиливаются
уже имеющиеся в исходнике контрастные блики стекла; геометрия не меняется.

Запуск:
    python3 scripts/extract_photos.py
    python3 scripts/extract_photos.py "COCKTAIL EMBASSY - прайс.pdf"

Нужны PyMuPDF и Pillow (см. README.md).
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

import pymupdf
from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "webapp" / "assets" / "products"
OUTPUT_SIZE = (928, 1152)  # кадр 4:5, используемый витриной
PHOTO_BACKGROUND = (20, 29, 41)  # #141d29 — единый фон приложения и товарных фото
GLASS_HIGHLIGHT = (232, 241, 253)
GLASS_GLOW = (81, 105, 137)
FIT_RATIO = 0.92

# В прайсе эти два снимка сделаны на контрастном чёрно-белом фоне-разделителе.
# Модель служит только для удаления фона перед извлечением исходного контура.
SPLIT_BACKGROUND = {
    "AG0004": (93, 67),
    "AG0019": (131, 63),
}
# Для этого фото в прайсе тёмная студийная сцена с контрастным столом.
# Сохраняем исходные пиксели предмета, но отделяем фон, чтобы не оставить прямоугольную рамку.
DARK_STUDIO_PHOTOS = {"AG0027"}


def find_pdf() -> pathlib.Path:
    if len(sys.argv) > 1:
        candidate = pathlib.Path(sys.argv[1])
        return candidate if candidate.is_absolute() else ROOT / candidate
    for file in sorted(ROOT.glob("*.pdf")):
        return file
    raise SystemExit("PDF-прайс не найден — передайте его путь аргументом")


def article_rows(page) -> list[tuple[str, float, float]]:
    """Артикулы по порядку строк прайса (сверху вниз)."""
    rows: list[tuple[str, float, float]] = []
    pending: tuple[str, float] | None = None
    for block in page.get_text("blocks"):
        x0, y0, _x1, y1, text = block[0], block[1], block[2], block[3], block[4].strip()
        if x0 < 70:  # поле таблицы и номера строк
            continue
        match = re.search(r"COD:\s*([A-Z]{2}\d{4})", text)
        if match:
            pending = (match.group(1), y0)
            continue
        if pending:
            rows.append((pending[0], pending[1], y1))
            pending = None
    return sorted(rows, key=lambda row: row[1])


def product_images(page) -> list[tuple[int, list[float], int, int]]:
    """Небольшие фотографии из правой колонки PDF, также сверху вниз."""
    items: list[tuple[int, list[float], int, int]] = []
    for info in page.get_image_info(xrefs=True):
        bbox = list(info["bbox"])
        width, height, xref = info["width"], info["height"], info["xref"]
        if bbox[0] < 100 or width > 200 or height < 60 or not xref:
            continue
        items.append((xref, bbox, width, height))
    return sorted(items, key=lambda item: (item[1][1], item[1][0]))


def split_background_residual(gray: Image.Image, article: str) -> Image.Image:
    """Подавить чёрно-белую диагональ фона, оставив детали предмета."""
    width, height = gray.size
    pixels = gray.load()
    top_x, bottom_x = SPLIT_BACKGROUND[article]
    background = Image.new("L", gray.size)
    background_pixels = background.load()

    for y in range(height):
        left = sorted(pixels[x, y] for x in range(min(8, width)))[min(4, width - 1)]
        right_start = max(0, width - 8)
        right = sorted(pixels[x, y] for x in range(right_start, width))[min(4, width - right_start - 1)]
        divider_x = top_x + (bottom_x - top_x) * y / max(1, height - 1)
        # Небольшой мягкий переход повторяет антиалиасинг шва на исходном фото.
        transition = 4
        for x in range(width):
            t = max(0.0, min(1.0, (x - (divider_x - transition / 2)) / transition))
            background_pixels[x, y] = round(left * (1 - t) + right * t)

    return ImageChops.difference(gray, background)


def highlight_mask(image: Image.Image, article: str) -> Image.Image:
    """Перенести видимые в PDF блики/контуры на тёмную сцену без перерисовки формы."""
    gray = ImageOps.grayscale(image.convert("RGB"))
    if article in SPLIT_BACKGROUND:
        detail_source = split_background_residual(gray, article)
    else:
        detail_source = gray

    # Высокочастотная часть сохраняет кромки бокала и тонкие ножки, подавляя
    # бумажный фон, плавные градиенты и тени исходной миниатюры.
    local_background = detail_source.filter(ImageFilter.GaussianBlur(radius=5))
    detail = ImageChops.difference(detail_source, local_background)

    lut = []
    for value in range(256):
        strength = max(0.0, (value - 7) / 85)
        lut.append(round(255 * min(1.0, strength ** 0.55)))
    return detail.point(lut)


def fit_mask(mask: Image.Image) -> tuple[Image.Image, tuple[int, int]]:
    """Обрезать только пустые поля маски и вписать целую форму в холст 4:5."""
    width, height = OUTPUT_SIZE
    bounds = mask.point(lambda value: 255 if value > 24 else 0).getbbox()
    if bounds:
        padding = int(max(mask.size) * 0.12)
        left = max(0, bounds[0] - padding)
        top = max(0, bounds[1] - padding)
        right = min(mask.width, bounds[2] + padding)
        bottom = min(mask.height, bounds[3] + padding)
        mask = mask.crop((left, top, right, bottom))

    fitted = ImageOps.contain(
        mask,
        (round(width * FIT_RATIO), round(height * FIT_RATIO)),
        method=Image.Resampling.LANCZOS,
    )
    return fitted, ((width - fitted.width) // 2, (height - fitted.height) // 2)


def studio_foreground_mask(source: Image.Image) -> Image.Image:
    """Выделить контрастные пиксели предмета относительно фона той же строки."""
    rgb = source.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    mask = Image.new("L", rgb.size)
    mask_pixels = mask.load()
    strip = max(2, min(12, width // 8))

    for y in range(height):
        border = [pixels[x, y] for x in range(strip)] + [pixels[x, y] for x in range(width - strip, width)]
        background = tuple(
            sorted(pixel[channel] for pixel in border)[len(border) // 2]
            for channel in range(3)
        )
        for x in range(width):
            distance = max(abs(pixels[x, y][channel] - background[channel]) for channel in range(3))
            strength = max(0.0, min(1.0, (distance - 55) / 80)) ** 0.65
            mask_pixels[x, y] = round(255 * strength)

    return mask.filter(ImageFilter.GaussianBlur(radius=0.55))


def render_glass(article: str, source: Image.Image) -> Image.Image:
    """Показать PDF-фото на бесшовном тёмном фоне без рамки/карточки."""
    width, height = OUTPUT_SIZE
    background = Image.new("RGB", OUTPUT_SIZE, PHOTO_BACKGROUND)

    if article in DARK_STUDIO_PHOTOS:
        # Оставляем исходные пиксели чайника, но не переносим в интерфейс квадратную сцену.
        photo = source.convert("RGB")
        mask = studio_foreground_mask(photo)
        bounds = mask.point(lambda value: 255 if value > 120 else 0).getbbox()
        if bounds:
            padding = int(max(photo.size) * 0.12)
            crop = (
                max(0, bounds[0] - padding),
                max(0, bounds[1] - padding),
                min(photo.width, bounds[2] + padding),
                min(photo.height, bounds[3] + padding),
            )
            photo, mask = photo.crop(crop), mask.crop(crop)
        box = (round(width * FIT_RATIO), round(height * FIT_RATIO))
        photo = ImageOps.contain(photo, box, method=Image.Resampling.LANCZOS)
        mask = ImageOps.contain(mask, box, method=Image.Resampling.LANCZOS)
        position = ((width - photo.width) // 2, (height - photo.height) // 2)
        background.paste(photo, position, mask)
        return background

    mask, position = fit_mask(highlight_mask(source, article))
    # Очень мягкий локальный блик помогает прозрачному стеклу читаться, не утолщая контуры.
    glow = mask.filter(ImageFilter.GaussianBlur(radius=18)).point(lambda value: round(value * 0.06))
    background.paste(Image.new("RGB", mask.size, GLASS_GLOW), position, glow)
    background.paste(Image.new("RGB", mask.size, GLASS_HIGHLIGHT), position, mask)
    return background


def main() -> int:
    pdf = find_pdf()
    doc = pymupdf.open(pdf)
    if not doc:
        raise SystemExit(f"Пустой PDF: {pdf}")

    rows = article_rows(doc[0])
    images = product_images(doc[0])
    if not rows or not images:
        raise SystemExit("Не удалось найти строки товаров или фото в PDF")
    if len(rows) != len(images):
        raise SystemExit(f"Несовпадение в PDF: артикулов {len(rows)}, фото {len(images)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report: dict[str, dict[str, object]] = {}
    for (article, _top, _bottom), (xref, _bbox, source_width, source_height) in zip(rows, images):
        pixmap = pymupdf.Pixmap(doc, xref)
        if pixmap.colorspace and pixmap.colorspace.name != "DeviceRGB":
            pixmap = pymupdf.Pixmap(pymupdf.csRGB, pixmap)
        source = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        image = render_glass(article, source)

        target = OUT_DIR / f"{article}.jpg"
        image.save(target, "JPEG", quality=94, optimize=True, subsampling=0)
        report[article] = {
            "source": pdf.name,
            "sourceSize": [source_width, source_height],
            "size": list(OUTPUT_SIZE),
            "file": target.name,
            "processing": "PDF photo; dark-background contrast pass; geometry unchanged",
        }

    (OUT_DIR / "photos.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"[photos] извлечено {len(report)} форм из {pdf.name} → {OUT_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
