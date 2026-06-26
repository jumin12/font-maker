#!/usr/bin/env python3
"""Scan fonts/ for .ttf/.otf files and write manifest.json."""

from __future__ import annotations

import json
import re
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
except ImportError:
    TTFont = None  # type: ignore

APP_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = APP_DIR / "manifest.json"

STYLE_SUFFIXES = [
    ("BoldItalic", "boldItalic", "Bold Italic", 700, True),
    ("Bold Italic", "boldItalic", "Bold Italic", 700, True),
    ("Bold", "bold", "Bold", 700, False),
    ("Italic", "italic", "Italic", 400, True),
    ("Regular", "regular", "Regular", 400, False),
]


def parse_name_from_filename(stem: str) -> tuple[str, str, str, int, bool]:
    for suffix, key, label, weight, italic in STYLE_SUFFIXES:
        token = suffix.replace(" ", "")
        if stem.endswith("-" + token) or stem.endswith("_" + token):
            family = stem[: -(len(token) + 1)]
            return family, key, label, weight, italic
        if stem.endswith(" " + suffix):
            family = stem[: -(len(suffix) + 1)]
            return family, key, label, weight, italic
    return stem, "regular", "Regular", 400, False


def read_font_meta(path: Path) -> tuple[str, str, str, int, bool]:
    if TTFont is None:
        return parse_name_from_filename(path.stem)

    try:
        font = TTFont(path, lazy=True)
        names: dict[int, str] = {}
        for record in font["name"].names:
            if record.nameID in (1, 2, 4, 6):
                names[record.nameID] = record.toUnicode()

        family = names.get(1) or path.stem
        style = names.get(2) or "Regular"
        weight = int(font["OS/2"].usWeightClass) if "OS/2" in font else 400
        italic = bool(font["head"].macStyle & 2) if "head" in font else ("Italic" in style)
        font.close()

        key = "boldItalic" if weight >= 700 and italic else (
            "bold" if weight >= 700 else ("italic" if italic else "regular")
        )
        return family, key, style, weight, italic
    except Exception:
        return parse_name_from_filename(path.stem)


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def variant_key(weight: int, italic: bool) -> str:
    if weight >= 700 and italic:
        return "boldItalic"
    if weight >= 700:
        return "bold"
    if italic:
        return "italic"
    return "regular"


def build_manifest() -> dict:
    families: dict[str, dict] = {}

    for path in sorted((APP_DIR / "fonts").rglob("*") if (APP_DIR / "fonts").is_dir() else []):
        if path.suffix.lower() not in {".ttf", ".otf"}:
            continue

        rel = path.relative_to(APP_DIR).as_posix()
        family, vkey, style, weight, italic = read_font_meta(path)
        fid = slugify(family)

        if fid not in families:
            families[fid] = {
                "id": fid,
                "name": family,
                "displayName": family,
                "variants": {},
            }

        families[fid]["variants"][vkey] = {
            "path": rel,
            "style": style,
            "weight": weight,
            "italic": italic,
            "format": "opentype" if path.suffix.lower() == ".otf" else "truetype",
        }

    ordered = sorted(families.values(), key=lambda f: f["name"].lower())
    return {"families": ordered}


def main() -> None:
    data = build_manifest()
    MANIFEST_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Wrote {len(data['families'])} family(ies) to {MANIFEST_PATH}")
    for fam in data["families"]:
        keys = ", ".join(sorted(fam["variants"]))
        print(f"  - {fam['name']} [{keys}]")


if __name__ == "__main__":
    main()
