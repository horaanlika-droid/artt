#!/usr/bin/env python3
"""Извлечь фотографии товаров из PDF-прайса Cocktail Embassy — исходные кадры, без вырезания фона.

Фотографии сохраняются целиком, вместе со студийным фоном исходника: никакой маскировки,
подавления фона и перерисовки формы стекла. Исходный кадр вписывается в кадр витрины 4:5,
а доборная площадь заполняется зеркальным повтором краёв собственного фона снимка —
прямоугольной рамки не остаётся, и фото бесшовно ложится на фон приложения
(цвет фона витрины выбран равным фону снимков, см. webapp/css/base.css).

Качество: кадр масштабируется Lanczos-ом до разрешения витрины, фон после добора слегка
сглаживается, а кромки стекла возвращает мягкий unsharp — геометрия и пропорции не меняются.

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
from PIL import Image, ImageFilter, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "webapp" / "assets" / "products"
OUTPUT_SIZE = (1080, 1350)  # кадр 4:5 витрины, достаточно для @2x/@3x на телефоне и десктопе
SEAM_BLUR = 1.05            # лёгкое сглаживание шва между фоном снимка и его зеркальным добором
SHARPEN_RADIUS = 2.2        # возврат чёткости кромок стекла после масштабирования
SHARPEN_PERCENT = 58
PRE_BLUR = 0.4              # лёгкое до-сглаживание JPEG-шума исходника перед апскейлом


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


def fit_frame(photo: Image.Image) -> Image.Image:
    """Вписать исходный кадр в 4:5, добрав фон зеркальным повтором краёв самого снимка.

    Фоновые градиенты студийных кадров плавные, поэтому зеркальный повтор краёвой зоны
    продолжает вертикальный градиент без видимого шва; углы закрываются двойным зеркалом.
    """
    frame_w, frame_h = OUTPUT_SIZE
    width, height = photo.size
    scale = min(frame_w / width, frame_h / height)
    new_w, new_h = max(1, round(width * scale)), max(1, round(height * scale))
    scaled = photo.resize((new_w, new_h), Image.Resampling.LANCZOS)

    off_x, off_y = (frame_w - new_w) // 2, (frame_h - new_h) // 2
    canvas = Image.new("RGB", (frame_w, frame_h), (245, 245, 247))

    def mirrored(box: tuple[int, int, int, int], hflip: bool, vflip: bool) -> Image.Image:
        part = scaled.crop(box)
        if hflip:
            part = part.transpose(Image.FLIP_LEFT_RIGHT)
        if vflip:
            part = part.transpose(Image.FLIP_TOP_BOTTOM)
        return part

    # Горизонтальный добор: зеркальные копии крайних столбцов по высоте кадра.
    pad_l, pad_r = off_x, frame_w - (off_x + new_w)
    if pad_l > 0:
        canvas.paste(mirrored((0, 0, pad_l, new_h), True, False), (off_x - pad_l, off_y))
    if pad_r > 0:
        canvas.paste(mirrored((new_w - pad_r, 0, new_w, new_h), True, False), (off_x + new_w, off_y))
    # Вертикальный добор: зеркальные копии крайних строк по ширине кадра.
    pad_t, pad_b = off_y, frame_h - (off_y + new_h)
    if pad_t > 0:
        canvas.paste(mirrored((0, 0, new_w, pad_t), False, True), (off_x, off_y - pad_t))
    if pad_b > 0:
        canvas.paste(mirrored((0, new_h - pad_b, new_w, new_h), False, True), (off_x, off_y + new_h))
    # Углы: двойное зеркало угловых блоков исходника.
    if pad_l and pad_t:
        canvas.paste(mirrored((0, 0, pad_l, pad_t), True, True), (off_x - pad_l, off_y - pad_t))
    if pad_r and pad_t:
        canvas.paste(mirrored((new_w - pad_r, 0, new_w, pad_t), True, True), (off_x + new_w, off_y - pad_t))
    if pad_l and pad_b:
        canvas.paste(mirrored((0, new_h - pad_b, pad_l, pad_b), True, True),
                     (off_x - pad_l, off_y + new_h))
    if pad_r and pad_b:
        canvas.paste(mirrored((new_w - pad_r, new_h - pad_b, new_w, new_h), True, True),
                     (off_x + new_w, off_y + new_h))
    # Сами исходные пиксели по центру.
    canvas.paste(scaled, (off_x, off_y))
    return canvas


def render_product(source: Image.Image) -> Image.Image:
    """Исходный кадр на фоне своего же снимка — без вырезания фона и изменения формы."""
    if PRE_BLUR:
        source = source.filter(ImageFilter.GaussianBlur(PRE_BLUR))
    canvas = fit_frame(source)
    if SEAM_BLUR:
        canvas = canvas.filter(ImageFilter.GaussianBlur(SEAM_BLUR))
    return canvas.filter(
        ImageFilter.UnsharpMask(radius=SHARPEN_RADIUS, percent=SHARPEN_PERCENT, threshold=2)
    )


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
        raise SystemExit(f"Немсовпадение в PDF: артикулов {len(rows)}, фото {len(images)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report: dict[str, dict[str, object]] = {}
    for (article, _top, _bottom), (xref, _bbox, source_width, source_height) in zip(rows, images):
        pixmap = pymupdf.Pixmap(doc, xref)
        if pixmap.colorspace and pixmap.colorspace.name != "DeviceRGB":
            pixmap = pymupdf.Pixmap(pymupdf.csRGB, pixmap)
        source = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        image = render_product(source)

        target = OUT_DIR / f"{article}.jpg"
        image.save(target, "JPEG", quality=94, optimize=True, subsampling=0)
        report[article] = {
            "source": pdf.name,
            "sourceSize": [source_width, source_height],
            "size": list(OUTPUT_SIZE),
            "file": target.name,
            "processing": "original PDF photo, studio background kept; 4:5 frame padded with mirrored photo edges",
        }

    (OUT_DIR / "photos.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"[photos] извлечено {len(report)} кадров из {pdf.name} → {OUT_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
