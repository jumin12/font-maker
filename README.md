# Font Maker

Pixel font editor and TTF exporter — draw glyphs on a grid, preview Regular / Italic / Bold / Bold Italic, configure layout and languages, then export a full font family as `.ttf` files.

Created by **Andrew Meehan** · [502coderiver.com](https://502coderiver.com)

## Run locally

```bash
python serve.py
```

Open [http://localhost:8765/](http://localhost:8765/)

The dev server auto-generates Eldaraure fonts if missing and refreshes `manifest.json`.

## Features

- Draw tab with pixel grid editor, character picker, and style linking toggle
- Preview, layout, gallery, language rules, and export (ZIP with 4× TTF + settings)
- Built-in **English Base** and included **Eldaraure** font
- Save and reload fonts in your browser (IndexedDB)
- Upload `.ttf` / `.otf` to edit imported fonts

## Requirements

- Python 3.10+ (stdlib only for `serve.py`)
- Optional: `fonttools` for richer manifest metadata (`pip install fonttools`)

## Project layout

| Path | Purpose |
|------|---------|
| `index.html` | UI shell |
| `app.js` | Application logic |
| `font-engine.js` | Grid engine, import/export, rendering |
| `serve.py` | Local dev server |
| `fonts/` | Eldaraure TTFs and generator |
| `images/` | Brand assets |

## License

All rights reserved unless otherwise noted for bundled fonts.
