#!/usr/bin/env python3
"""
Сборка каталога Cocktail Embassy из прайса.

На входе — data/price-list.json (выгрузка из прайс-листа бренда: коллекции,
позиции, цены в AED и USD, габариты, материалы). На выходе — data/catalog.json
в формате, который читает приложение:

    { brand, delivery, categories, products[] }

Все тексты хранятся сразу в двух языках ({ "ru": "...", "en": "..." }),
поэтому одна витрина обслуживает и русскую, и английскую версию.

Запуск:
    python3 scripts/build_catalog.py                 # из data/price-list.json
    python3 scripts/build_catalog.py other.json      # из другого файла
"""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def l10n(ru: str, en: str) -> dict:
    return {"ru": ru, "en": en}


def glass_label(glass: str, glass_types: list[dict]) -> dict:
    for item in glass_types:
        if item["id"] == glass:
            return l10n(item["title"], item["titleEn"])
    return l10n(glass, glass)


def material_label(material: str, hand_blown: bool) -> dict:
    borosilicate = "borosilicate" in material.lower()
    glass_ru = "Боросиликатное стекло" if borosilicate else "Хрусталь без свинца"
    glass_en = "Borosilicate glass" if borosilicate else "Lead-free crystal"
    if hand_blown:
        return l10n(f"{glass_ru}, ручная выдувка", f"{glass_en}, hand-blown")
    return l10n(glass_ru, glass_en)


def size(value, unit_ru: str, unit_en: str) -> dict:
    if not value:
        return l10n("—", "—")
    return l10n(f"{value} {unit_ru}", f"{value} {unit_en}")


def build_specs(product: dict, label: dict, collection: dict) -> list[dict]:
    specs = [
        {"key": l10n("Тип", "Type"), "value": label},
        {"key": l10n("Объём", "Capacity"),
         "value": size(product.get("capacityMl"), "мл", "ml")},
        {"key": l10n("Высота", "Height"),
         "value": size(product.get("highMm"), "мм", "mm")},
        {"key": l10n("Диаметр", "Diameter"),
         "value": size(product.get("diameterMm"), "мм", "mm")},
        {"key": l10n("Материал", "Material"),
         "value": material_label(product["material"], product.get("handBlown", True))},
        {"key": l10n("Коллекция", "Collection"), "value": collection},
        {"key": l10n("Упаковка", "Packaging"),
         "value": l10n("Штука, в коробке с защитой", "Sold per piece, boxed with protection")},
    ]
    return specs


def main() -> int:
    source = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DATA / "price-list.json"
    if not source.is_absolute():
        source = ROOT / source
    price = json.loads(source.read_text(encoding="utf-8"))

    categories = {c["id"]: c for c in price["categories"]}
    glass_types = price["glassTypes"]

    hits = {"AG0015", "AG0002", "AG0006", "AG0020", "AG0008", "AG0023"}
    fresh = {"AG0027", "AG0019", "AG0021", "AG0022", "AG0024"}

    products = []
    for raw in price["products"]:
        collection = categories[raw["category"]]
        label = glass_label(raw["glass"], glass_types)
        coming = bool(raw.get("comingSoon", False))
        collection_l10n = l10n(collection["title"], collection["titleEn"])
        products.append({
            "id": raw["article"],
            "article": raw["article"],
            "category": raw["category"],
            "glass": raw["glass"],
            "glassLabel": label,
            "name": l10n(raw["name"], raw["nameEn"]),
            "description": l10n(raw["description"], raw["descriptionEn"]),
            "price": raw.get("priceAed"),
            "priceUsd": raw.get("priceUsd"),
            "currency": "AED",
            "volumeMl": raw.get("capacityMl"),
            "volumeLabel": size(raw.get("capacityMl"), "мл", "ml"),
            "heightMm": raw.get("highMm"),
            "diameterMm": raw.get("diameterMm"),
            "material": material_label(raw["material"], raw.get("handBlown", True)),
            "engraving": bool(raw.get("engraving")),
            "handBlown": bool(raw.get("handBlown", True)),
            "pack": "pc",
            "image": f"assets/products/{raw['article']}.jpg",
            "specs": build_specs(raw, label, collection_l10n),
            "isNew": bool(raw.get("isNew", False)) or raw["article"] in fresh,
            "isHit": bool(raw.get("isHit", False)) or raw["article"] in hits,
            "comingSoon": coming,
            "outOfStock": coming,
            "priceOnRequest": raw.get("priceAed") is None,
            "sort": len(products),
        })

    brand = price["brand"]
    catalog = {
        "version": 1,
        "brand": {
            "name": brand["name"],
            "legalName": brand["legalName"],
            "tagline": l10n(brand["tagline"], brand["taglineEn"]),
            "about": l10n(
                "Cocktail Embassy — поставщик барного и ресторанного стекла из Дубая. "
                "Мы работаем с ручной выдувкой и тонким японским хрусталём: каждая коллекция "
                "отбирается вживую, чтобы держать край, баланс и оптику на уровне, "
                "которого ждут бармены. Отгружаем по ОАЭ и по всему миру.",
                "Cocktail Embassy is a Dubai-based supplier of bar and restaurant glassware. "
                "We work with hand-blown and thin Japanese crystal: every collection is "
                "selected in person so the rim, the balance and the optics stay where "
                "bartenders need them. We ship across the UAE and worldwide.",
            ),
            "instagram": brand["instagram"],
            "telegram": brand["telegram"],
            "whatsapp": brand["whatsapp"],
            "phone": brand["phone"],
            "email": brand["email"],
            "city": brand["city"],
            "country": brand["country"],
            "address": brand["address"],
            "currency": brand["currency"],
            "usdRate": brand["usdRate"],
            "managers": [
                {
                    "name": m["name"],
                    "region": m["region"],
                    "phone": m["phone"],
                    "telegram": m.get("telegram", ""),
                    "whatsapp": m.get("whatsapp", ""),
                }
                for m in brand["managers"]
            ],
        },
        "delivery": {
            "freeCities": ["Dubai"],
            "freeFromAed": 1000,
            "costAed": 50,
            "note": l10n(
                "Отгружаем со склада в Дубае (Al Quoz) в течение 1–2 рабочих дней после оплаты. "
                "По Дубаю доставка бесплатная, по остальным эмиратам — 50 AED, бесплатно от 1000 AED. "
                "Экспорт по всему миру рассчитываем индивидуально (DHL / FedEx, DAP или CIF).",
                "We ship from our Dubai warehouse (Al Quoz) within 1–2 working days after payment. "
                "Delivery inside Dubai is free, to the other Emirates it is AED 50 — free over AED 1000. "
                "Worldwide export is quoted individually (DHL / FedEx, DAP or CIF).",
            ),
        },
        "categories": [
            {
                "id": c["id"],
                "title": l10n(c["title"], c["titleEn"]),
                "subtitle": l10n(c["subtitle"], c["subtitleEn"]),
                "emoji": c["emoji"],
            }
            for c in price["categories"]
        ],
        "products": products,
    }

    out = DATA / "catalog.json"
    out.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"[catalog] собрано {len(products)} позиций -> {out.relative_to(ROOT)}")
    print(f"[catalog] категорий: {len(categories)}")
    missing = [p["article"] for p in products if not (ROOT / "webapp" / p["image"]).exists()]
    print(f"[catalog] фото: {len(products) - len(missing)}/{len(products)}"
          + (f", нет: {', '.join(missing)}" if missing else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
