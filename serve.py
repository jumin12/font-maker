#!/usr/bin/env python3
"""Local dev server for Font Maker."""

from __future__ import annotations

import http.server
import os
import subprocess
import sys
import urllib.parse
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8765"))


def ensure_fonts() -> None:
    fonts_dir = APP_DIR / "fonts"
    if fonts_dir.is_dir() and any(fonts_dir.glob("Eldaraure-*.ttf")):
        return
    generator = fonts_dir / "generate_font.py"
    if generator.is_file():
        print("No Eldaraure .ttf files found — generating fonts…")
        subprocess.run([sys.executable, str(generator)], check=True)


def rebuild_manifest() -> None:
    script = APP_DIR / "build-manifest.py"
    subprocess.run([sys.executable, str(script)], check=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    """Serve Font Maker from the app directory."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def translate_path(self, path: str) -> str:
        raw = urllib.parse.unquote(urllib.parse.urlparse(path).path)
        raw = raw.split("?", 1)[0].split("#", 1)[0].lstrip("/")
        segments = [seg for seg in raw.split("/") if seg and seg != "."]

        if not segments:
            return str(APP_DIR / "index.html")

        candidate = APP_DIR.joinpath(*segments)
        try:
            resolved = candidate.resolve()
            if resolved.is_file() and str(resolved).startswith(str(APP_DIR.resolve())):
                return str(resolved)
        except OSError:
            pass

        return str(APP_DIR / "index.html")

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


def main() -> None:
    os.chdir(APP_DIR)
    ensure_fonts()
    print("Refreshing font manifest…")
    rebuild_manifest()
    print(f"Serving Font Maker at http://localhost:{PORT}/")
    print("Press Ctrl+C to stop.\n")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
