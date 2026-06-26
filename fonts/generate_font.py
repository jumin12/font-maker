#!/usr/bin/env python3
"""
Eldaraure — a custom display font blending Elvish (Tengwar-inspired) curves
with Galactic Basic (Aurebesh-inspired) geometry.

Generates Regular, Italic, Bold, and Bold Italic TTF files plus a reference chart.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass, field
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

FAMILY_NAME = "Eldaraure"
VERSION = "1.000"
UNITS_PER_EM = 1000
ASCENDER = 800
DESCENDER = -200
CAP_HEIGHT = 700
X_HEIGHT = 500
BASELINE = 0

OUTPUT_DIR = Path(__file__).parent
CHART_DIR = Path(__file__).parent / "charts"

# Number mapping: type '0' for ten, '1'-'9' for 1-9
NUMBER_LABELS = {
    "1": "1", "2": "2", "3": "3", "4": "4", "5": "5",
    "6": "6", "7": "7", "8": "8", "9": "9", "0": "10",
}

SPECIAL_CHARS = [".", ",", "!", "?", ";", ":", "'", '"', "-", "(", ")", "[", "]", "@", "#", "&", "*", "+", "/", "="]
SPECIAL_CHAR_SET = set(SPECIAL_CHARS)

GLYPH_ORDER = (
    [".notdef", "space"]
    + list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    + list("abcdefghijklmnopqrstuvwxyz")
    + list("0123456789")
    + SPECIAL_CHARS
)


# ---------------------------------------------------------------------------
# Path primitives
# ---------------------------------------------------------------------------

@dataclass
class Contour:
    points: list[tuple[str, tuple[float, ...]]] = field(default_factory=list)

    def move(self, x: float, y: float) -> None:
        self.points.append(("M", (x, y)))

    def line(self, x: float, y: float) -> None:
        self.points.append(("L", (x, y)))

    def quad(self, cx: float, cy: float, x: float, y: float) -> None:
        self.points.append(("Q", (cx, cy, x, y)))

    def curve(self, c1x: float, c1y: float, c2x: float, c2y: float, x: float, y: float) -> None:
        self.points.append(("C", (c1x, c1y, c2x, c2y, x, y)))

    def close(self) -> None:
        self.points.append(("Z", ()))


class GlyphCanvas:
    """Collects closed contours for a single glyph."""

    def __init__(self) -> None:
        self.contours: list[Contour] = []

    def new_contour(self) -> Contour:
        c = Contour()
        self.contours.append(c)
        return c

    # --- Elvish-inspired curves ------------------------------------------------

    def teardrop(self, cx: float, cy: float, w: float, h: float, flip: bool = False) -> None:
        c = self.new_contour()
        hw = w / 2
        top = cy + h if not flip else cy
        bot = cy if not flip else cy - h
        c.move(cx - hw, bot + h * 0.35)
        c.quad(cx - hw, top, cx, top + h * 0.08)
        c.quad(cx + hw, top, cx + hw, bot + h * 0.35)
        c.quad(cx, bot - h * 0.05, cx - hw, bot + h * 0.35)
        c.close()

    def elven_arc(self, x1: float, y: float, x2: float, bulge: float) -> None:
        """Horizontal Tengwar-style flowing arc."""
        c = self.new_contour()
        mid = (x1 + x2) / 2
        c.move(x1, y)
        c.quad(mid, y + bulge, x2, y)
        c.line(x2, y - 18)
        c.quad(mid, y + bulge - 18, x1, y - 18)
        c.close()

    # --- Aurebesh-inspired geometry --------------------------------------------

    def diamond(self, cx: float, cy: float, size: float) -> None:
        c = self.new_contour()
        s = size / 2
        c.move(cx, cy + s)
        c.line(cx + s, cy)
        c.line(cx, cy - s)
        c.line(cx - s, cy)
        c.close()

    def hex_node(self, cx: float, cy: float, r: float) -> None:
        c = self.new_contour()
        for i in range(6):
            ang = math.pi / 2 + i * math.pi / 3
            x = cx + r * math.cos(ang)
            y = cy + r * math.sin(ang)
            if i == 0:
                c.move(x, y)
            else:
                c.line(x, y)
        c.close()

    def angular_frame(self, x: float, y: float, w: float, h: float, notch: float) -> None:
        """Aurebesh-style cut-corner rectangle."""
        c = self.new_contour()
        c.move(x + notch, y)
        c.line(x + w - notch, y)
        c.line(x + w, y + notch)
        c.line(x + w, y + h - notch)
        c.line(x + w - notch, y + h)
        c.line(x + notch, y + h)
        c.line(x, y + h - notch)
        c.line(x, y + notch)
        c.close()

    def stem(self, x: float, y0: float, y1: float, w: float) -> None:
        c = self.new_contour()
        hw = w / 2
        c.move(x - hw, y0)
        c.line(x + hw, y0)
        c.line(x + hw, y1)
        c.line(x - hw, y1)
        c.close()

    def bar(self, x1: float, x2: float, y: float, h: float) -> None:
        c = self.new_contour()
        c.move(x1, y)
        c.line(x2, y)
        c.line(x2, y + h)
        c.line(x1, y + h)
        c.close()

    def crescent(self, cx: float, cy: float, r: float, thickness: float, opening: str = "right") -> None:
        c = self.new_contour()
        ri = r - thickness
        if opening == "right":
            c.move(cx + ri, cy)
            c.curve(cx + ri, cy + r * 0.95, cx - r * 0.3, cy + r, cx - r * 0.55, cy)
            c.curve(cx - r * 0.3, cy - r, cx + ri, cy - r * 0.95, cx + ri, cy)
        else:
            c.move(cx - ri, cy)
            c.curve(cx - ri, cy + r * 0.95, cx + r * 0.3, cy + r, cx + r * 0.55, cy)
            c.curve(cx + r * 0.3, cy - r, cx - ri, cy - r * 0.95, cx - ri, cy)
        c.close()

    def ring_segment(self, cx: float, cy: float, r: float, thickness: float, a0: float, a1: float) -> None:
        c = self.new_contour()
        ro, ri = r + thickness / 2, r - thickness / 2
        steps = 8
        pts_o, pts_i = [], []
        for i in range(steps + 1):
            t = a0 + (a1 - a0) * i / steps
            pts_o.append((cx + ro * math.cos(t), cy + ro * math.sin(t)))
            pts_i.append((cx + ri * math.cos(t), cy + ri * math.sin(t)))
        c.move(*pts_o[0])
        for p in pts_o[1:]:
            c.line(*p)
        for p in reversed(pts_i):
            c.line(*p)
        c.close()

    def chevron(self, cx: float, cy: float, w: float, h: float, up: bool = True) -> None:
        c = self.new_contour()
        hw = w / 2
        if up:
            c.move(cx - hw, cy)
            c.line(cx, cy + h)
            c.line(cx + hw, cy)
            c.line(cx + hw - 20, cy - h * 0.15)
            c.line(cx, cy + h * 0.55)
            c.line(cx - hw + 20, cy - h * 0.15)
        else:
            c.move(cx - hw, cy)
            c.line(cx, cy - h)
            c.line(cx + hw, cy)
            c.line(cx + hw - 20, cy + h * 0.15)
            c.line(cx, cy - h * 0.55)
            c.line(cx - hw + 20, cy + h * 0.15)
        c.close()


# ---------------------------------------------------------------------------
# Style parameters
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Style:
    name: str
    subfamily: str
    weight: int
    italic: bool
    stroke_scale: float = 1.0
    italic_shear: float = 0.0


STYLES = [
    Style("Regular", "Regular", 400, False, 1.0, 0.0),
    Style("Italic", "Italic", 400, True, 1.0, 0.22),
    Style("Bold", "Bold", 700, False, 1.45, 0.0),
    Style("BoldItalic", "Bold Italic", 700, True, 1.45, 0.22),
]


def s(stroke_scale: float, base: float) -> float:
    return base * stroke_scale


# ---------------------------------------------------------------------------
# Letter builders  (A–Z)
# ---------------------------------------------------------------------------

def build_letter(ch: str, style: Style) -> GlyphCanvas:
    g = GlyphCanvas()
    sw = style.stroke_scale
    margin = 80
    W = UNITS_PER_EM - margin * 2
    cx = UNITS_PER_EM / 2

    def stem_at(x, y0, y1, w=42):
        g.stem(x, y0, y1, s(sw, w))

    def bar_at(x1, x2, y, h=36):
        g.bar(x1, x2, y, s(sw, h))

  # Each letter: unique blend of elven curves + aurebesh angles
    if ch == "A":
        g.chevron(cx, 120, W * 0.82, 560, up=True)
        g.elven_arc(margin + 60, 340, UNITS_PER_EM - margin - 60, 55 * sw)
        g.teardrop(cx, 95, s(sw, 55), s(sw, 70))
        g.diamond(cx, 340, s(sw, 38))

    elif ch == "B":
        stem_at(margin + 70, 80, 680)
        g.crescent(margin + 200, 520, 130, s(sw, 42), "right")
        g.crescent(margin + 200, 280, 130, s(sw, 42), "right")
        g.hex_node(margin + 200, 520, s(sw, 22))
        g.hex_node(margin + 200, 280, s(sw, 22))

    elif ch == "C":
        g.crescent(cx, 380, 260, s(sw, 52), "right")
        g.teardrop(margin + 90, 620, s(sw, 40), s(sw, 55))
        g.teardrop(margin + 90, 140, s(sw, 40), s(sw, 55), flip=True)
        g.angular_frame(margin + 55, 280, 90, 200, 18)

    elif ch == "D":
        stem_at(margin + 70, 80, 680)
        g.crescent(margin + 200, 380, 250, s(sw, 50), "right")
        g.elven_arc(margin + 120, 660, margin + 320, 30 * sw)
        g.diamond(margin + 200, 380, s(sw, 45))

    elif ch == "E":
        # Three staggered crescents (Tengwar vowel-stack) — no Latin "E" bars
        g.crescent(margin + 200, 560, 150, s(sw, 40), "right")
        g.crescent(margin + 260, 380, 150, s(sw, 40), "right")
        g.crescent(margin + 200, 200, 150, s(sw, 40), "right")
        g.hex_node(margin + 200, 560, s(sw, 24))
        g.hex_node(margin + 260, 380, s(sw, 28))
        g.hex_node(margin + 200, 200, s(sw, 24))
        g.teardrop(margin + 90, 380, s(sw, 42), s(sw, 55))
        g.elven_arc(margin + 100, 530, margin + 175, 30 * sw)
        g.elven_arc(margin + 100, 230, margin + 175, -30 * sw)

    elif ch == "F":
        # Open sigil frame with teardrop crown — no horizontal crossbars
        g.angular_frame(margin + 70, 140, 130, 520, 28)
        g.teardrop(margin + 200, 660, s(sw, 44), s(sw, 58))
        g.hex_node(margin + 200, 420, s(sw, 30))
        g.crescent(margin + 280, 260, 120, s(sw, 38), "right")
        g.diamond(margin + 200, 160, s(sw, 32))

    elif ch == "G":
        g.crescent(cx, 380, 260, s(sw, 52), "right")
        bar_at(cx + 40, cx + 200, 360)
        g.angular_frame(cx + 60, 330, 150, 80, 15)
        g.teardrop(cx, 95, s(sw, 50), s(sw, 65))

    elif ch == "H":
        # Four-corner gate sigil — diamond hub with teardrop pillars, no crossbar
        g.diamond(cx, 380, s(sw, 72))
        g.teardrop(margin + 100, 640, s(sw, 40), s(sw, 52))
        g.teardrop(UNITS_PER_EM - margin - 100, 640, s(sw, 40), s(sw, 52))
        g.teardrop(margin + 100, 120, s(sw, 40), s(sw, 52), flip=True)
        g.teardrop(UNITS_PER_EM - margin - 100, 120, s(sw, 40), s(sw, 52), flip=True)
        g.elven_arc(margin + 120, 600, UNITS_PER_EM - margin - 120, 50 * sw)
        g.elven_arc(margin + 120, 160, UNITS_PER_EM - margin - 120, -50 * sw)

    elif ch == "I":
        # Vertical hex-node chain with flanking teardrops — no serif stem
        g.hex_node(cx, 620, s(sw, 32))
        g.hex_node(cx, 380, s(sw, 38))
        g.hex_node(cx, 140, s(sw, 32))
        stem_at(cx, 170, 350, 22)
        stem_at(cx, 410, 590, 22)
        g.teardrop(cx - 110, 380, s(sw, 38), s(sw, 50))
        g.teardrop(cx + 110, 380, s(sw, 38), s(sw, 50))
        g.diamond(cx, 680, s(sw, 26))

    elif ch == "J":
        g.crescent(cx + 40, 300, 200, s(sw, 45), "left")
        g.elven_arc(cx - 80, 120, cx + 200, 45 * sw)
        g.teardrop(cx + 40, 90, s(sw, 48), s(sw, 60), flip=True)
        g.diamond(cx + 120, 500, s(sw, 35))

    elif ch == "K":
        stem_at(margin + 70, 80, 680)
        g.chevron(margin + 160, 400, 200, 280, up=True)
        g.chevron(margin + 160, 400, 200, 280, up=False)
        g.hex_node(margin + 230, 400, s(sw, 24))

    elif ch == "L":
        # Ascending orbital arc with corner sigil — no right-angle "L"
        g.crescent(cx + 50, 340, 280, s(sw, 48), "left")
        g.teardrop(margin + 90, 120, s(sw, 48), s(sw, 62), flip=True)
        g.hex_node(UNITS_PER_EM - margin - 110, 600, s(sw, 30))
        g.elven_arc(margin + 100, 180, UNITS_PER_EM - margin - 100, 60 * sw)
        g.angular_frame(UNITS_PER_EM - margin - 160, 540, 90, 90, 16)

    elif ch == "M":
        stem_at(margin + 60, 80, 680)
        stem_at(UNITS_PER_EM - margin - 60, 80, 680)
        g.chevron(cx, 120, W * 0.7, 560, up=True)
        g.diamond(cx, 400, s(sw, 40))
        g.elven_arc(margin + 100, 580, cx - 30, 25 * sw)

    elif ch == "N":
        stem_at(margin + 70, 80, 680)
        stem_at(UNITS_PER_EM - margin - 70, 80, 680)
        g.chevron(cx, 200, W * 0.55, 480, up=True)
        g.hex_node(cx, 420, s(sw, 26))

    elif ch == "O":
        # Interlocking crescents with hex core — no plain circle
        g.crescent(cx - 50, 490, 210, s(sw, 44), "left")
        g.crescent(cx + 50, 270, 210, s(sw, 44), "right")
        g.hex_node(cx, 380, s(sw, 48))
        g.teardrop(cx, 680, s(sw, 36), s(sw, 48))
        g.teardrop(cx, 80, s(sw, 36), s(sw, 48), flip=True)

    elif ch == "P":
        stem_at(margin + 70, 80, 680)
        g.crescent(margin + 200, 520, 130, s(sw, 42), "right")
        bar_at(margin + 70, margin + 200, 400)
        g.teardrop(margin + 280, 560, s(sw, 35), s(sw, 45))

    elif ch == "Q":
        g.ring_segment(cx, 400, 240, s(sw, 48), 0, 2 * math.pi)
        g.chevron(cx + 80, 180, 180, 200, up=False)
        g.hex_node(cx, 400, s(sw, 30))

    elif ch == "R":
        stem_at(margin + 70, 80, 680)
        g.crescent(margin + 200, 520, 130, s(sw, 42), "right")
        bar_at(margin + 70, margin + 200, 400)
        g.chevron(margin + 180, 260, 220, 240, up=False)

    elif ch == "S":
        # Zigzag sigil path with hex joints — no Latin "S" curve
        g.chevron(cx - 110, 540, 170, 130, up=True)
        g.chevron(cx + 110, 380, 170, 130, up=False)
        g.chevron(cx - 110, 220, 170, 130, up=True)
        g.hex_node(cx - 110, 540, s(sw, 26))
        g.hex_node(cx + 110, 380, s(sw, 30))
        g.hex_node(cx - 110, 220, s(sw, 26))
        g.elven_arc(cx - 180, 460, cx - 40, 30 * sw)
        g.elven_arc(cx + 40, 300, cx + 180, -30 * sw)

    elif ch == "T":
        # Winged crown sigil — diamond crest with sweeping arcs, no "T" stem
        g.diamond(cx, 630, s(sw, 55))
        g.elven_arc(margin + 60, 520, cx - 20, 70 * sw)
        g.elven_arc(cx + 20, 520, UNITS_PER_EM - margin - 60, 70 * sw)
        g.teardrop(cx, 90, s(sw, 50), s(sw, 65), flip=True)
        g.hex_node(cx, 350, s(sw, 28))
        g.angular_frame(cx - 35, 300, 70, 70, 12)

    elif ch == "U":
        g.crescent(cx, 400, 250, s(sw, 50), "left")
        g.elven_arc(margin + 80, 120, UNITS_PER_EM - margin - 80, 40 * sw)
        g.teardrop(cx, 95, s(sw, 50), s(sw, 65), flip=True)

    elif ch == "V":
        g.chevron(cx, 100, W * 0.85, 580, up=False)
        g.teardrop(cx, 95, s(sw, 48), s(sw, 62), flip=True)
        g.diamond(cx, 350, s(sw, 32))

    elif ch == "W":
        g.chevron(cx - 160, 100, 240, 560, up=False)
        g.chevron(cx + 160, 100, 240, 560, up=False)
        g.elven_arc(margin + 60, 200, UNITS_PER_EM - margin - 60, 35 * sw)
        g.hex_node(cx, 200, s(sw, 28))

    elif ch == "X":
        g.chevron(cx - 120, 380, 240, 300, up=True)
        g.chevron(cx + 120, 380, 240, 300, up=False)
        g.diamond(cx, 380, s(sw, 50))

    elif ch == "Y":
        g.chevron(cx, 380, 200, 300, up=True)
        stem_at(cx, 80, 380)
        g.teardrop(cx, 680, s(sw, 40), s(sw, 52))
        g.angular_frame(cx - 40, 340, 80, 80, 10)

    elif ch == "Z":
        bar_at(margin + 60, UNITS_PER_EM - margin - 60, 640)
        bar_at(margin + 60, UNITS_PER_EM - margin - 60, 120)
        g.chevron(cx, 380, W * 0.75, 80, up=False)
        g.hex_node(margin + 120, 640, s(sw, 22))
        g.hex_node(UNITS_PER_EM - margin - 120, 120, s(sw, 22))

    # --- Numbers 1–9 and 0 (=10) -----------------------------------------------
    elif ch == "1":
        stem_at(cx, 120, 660, 50)
        g.chevron(cx - 60, 580, 120, 100, up=True)
        g.teardrop(cx, 90, s(sw, 40), s(sw, 52), flip=True)

    elif ch == "2":
        g.elven_arc(margin + 60, 600, UNITS_PER_EM - margin - 60, 40 * sw)
        g.ring_segment(cx, 280, 180, s(sw, 40), math.pi * 0.1, math.pi * 1.1)
        bar_at(margin + 60, UNITS_PER_EM - margin - 60, 120)
        g.diamond(cx, 440, s(sw, 35))

    elif ch == "3":
        g.ring_segment(cx - 30, 520, 150, s(sw, 40), -math.pi / 2, math.pi / 2)
        g.ring_segment(cx - 30, 280, 150, s(sw, 40), -math.pi / 2, math.pi / 2)
        g.hex_node(cx + 80, 400, s(sw, 24))

    elif ch == "4":
        stem_at(margin + 100, 80, 420)
        bar_at(margin + 80, UNITS_PER_EM - margin - 80, 420)
        g.chevron(margin + 280, 200, 200, 480, up=True)
        g.teardrop(margin + 100, 90, s(sw, 35), s(sw, 45), flip=True)

    elif ch == "5":
        bar_at(margin + 60, UNITS_PER_EM - margin - 60, 620)
        stem_at(margin + 80, 80, 400)
        g.crescent(margin + 220, 260, 140, s(sw, 38), "right")
        g.diamond(margin + 200, 620, s(sw, 30))

    elif ch == "6":
        g.ring_segment(cx, 380, 240, s(sw, 48), 0, 2 * math.pi)
        g.ring_segment(cx, 300, 120, s(sw, 35), math.pi * 0.3, math.pi * 1.5)
        g.teardrop(cx, 90, s(sw, 40), s(sw, 52), flip=True)

    elif ch == "7":
        bar_at(margin + 50, UNITS_PER_EM - margin - 50, 640)
        g.chevron(cx + 40, 200, 280, 460, up=True)
        g.elven_arc(margin + 80, 300, UNITS_PER_EM - margin - 80, 25 * sw)

    elif ch == "8":
        g.ring_segment(cx, 530, 140, s(sw, 40), 0, 2 * math.pi)
        g.ring_segment(cx, 280, 140, s(sw, 40), 0, 2 * math.pi)
        g.diamond(cx, 530, s(sw, 28))
        g.diamond(cx, 280, s(sw, 28))

    elif ch == "9":
        g.ring_segment(cx, 420, 220, s(sw, 45), 0, 2 * math.pi)
        g.ring_segment(cx, 540, 110, s(sw, 32), math.pi * 0.5, math.pi * 1.7)
        g.teardrop(cx, 680, s(sw, 38), s(sw, 48))

    elif ch == "0":  # represents "10"
        stem_at(margin + 120, 100, 660, 46)
        g.ring_segment(cx + 60, 380, 200, s(sw, 45), 0, 2 * math.pi)
        g.elven_arc(margin + 200, 640, UNITS_PER_EM - margin - 60, 30 * sw)
        g.diamond(cx + 60, 380, s(sw, 40))

    return g


def scale_contours(
    contours: list[Contour],
    sx: float,
    sy: float,
    origin_x: float,
    origin_y: float,
    dx: float = 0,
    dy: float = 0,
) -> list[Contour]:
    """Uniform scale about a point, then translate."""
    out: list[Contour] = []
    for contour in contours:
        nc = Contour()
        for cmd, pts in contour.points:
            if cmd == "Z":
                nc.points.append(("Z", ()))
            elif cmd == "M":
                x, y = pts
                nx = (x - origin_x) * sx + origin_x + dx
                ny = (y - origin_y) * sy + origin_y + dy
                nc.points.append(("M", (nx, ny)))
            elif cmd == "L":
                x, y = pts
                nx = (x - origin_x) * sx + origin_x + dx
                ny = (y - origin_y) * sy + origin_y + dy
                nc.points.append(("L", (nx, ny)))
            elif cmd == "Q":
                cx, cy, x, y = pts
                nc.points.append(("Q", (
                    (cx - origin_x) * sx + origin_x + dx,
                    (cy - origin_y) * sy + origin_y + dy,
                    (x - origin_x) * sx + origin_x + dx,
                    (y - origin_y) * sy + origin_y + dy,
                )))
            elif cmd == "C":
                c1x, c1y, c2x, c2y, x, y = pts
                nc.points.append(("C", (
                    (c1x - origin_x) * sx + origin_x + dx,
                    (c1y - origin_y) * sy + origin_y + dy,
                    (c2x - origin_x) * sx + origin_x + dx,
                    (c2y - origin_y) * sy + origin_y + dy,
                    (x - origin_x) * sx + origin_x + dx,
                    (y - origin_y) * sy + origin_y + dy,
                )))
        out.append(nc)
    return out


def build_special_char(ch: str, style: Style) -> GlyphCanvas:
    """Punctuation and symbols sized for Eldaraure's metrics."""
    g = GlyphCanvas()
    sw = style.stroke_scale
    cx = UNITS_PER_EM / 2
    margin = 80

    if ch == ".":
        g.hex_node(cx, 110, s(sw, 22))
    elif ch == ",":
        g.hex_node(cx, 105, s(sw, 20))
        g.teardrop(cx, 75, s(sw, 18), s(sw, 32), flip=True)
    elif ch == "!":
        stem_at = lambda x, y0, y1, w=36: g.stem(x, y0, y1, s(sw, w))
        stem_at(cx, 200, 560)
        g.hex_node(cx, 130, s(sw, 24))
    elif ch == "?":
        g.crescent(cx, 480, 120, s(sw, 36), "right")
        g.hex_node(cx, 130, s(sw, 24))
        g.teardrop(cx, 95, s(sw, 18), s(sw, 28), flip=True)
    elif ch == ";":
        g.hex_node(cx, 520, s(sw, 20))
        g.hex_node(cx, 105, s(sw, 20))
        g.teardrop(cx, 75, s(sw, 16), s(sw, 28), flip=True)
    elif ch == ":":
        g.hex_node(cx, 520, s(sw, 22))
        g.hex_node(cx, 200, s(sw, 22))
    elif ch == "'":
        g.teardrop(cx, 560, s(sw, 22), s(sw, 40))
    elif ch == '"':
        g.teardrop(cx - 55, 560, s(sw, 20), s(sw, 38))
        g.teardrop(cx + 55, 560, s(sw, 20), s(sw, 38))
    elif ch == "-":
        g.bar(cx - 120, cx + 120, 380, s(sw, 28))
    elif ch == "(":
        g.crescent(margin + 150, 380, 180, s(sw, 40), "right")
    elif ch == ")":
        g.crescent(UNITS_PER_EM - margin - 150, 380, 180, s(sw, 40), "left")
    elif ch == "[":
        g.angular_frame(margin + 90, 180, 70, 400, 14)
        g.bar(margin + 90, margin + 200, 580, s(sw, 28))
    elif ch == "]":
        g.angular_frame(UNITS_PER_EM - margin - 160, 180, 70, 400, 14)
        g.bar(UNITS_PER_EM - margin - 200, UNITS_PER_EM - margin - 90, 580, s(sw, 28))
    elif ch == "@":
        g.ring_segment(cx, 380, 200, s(sw, 42), 0, 2 * math.pi)
        g.crescent(cx + 60, 380, 90, s(sw, 30), "left")
        g.hex_node(cx, 380, s(sw, 26))
    elif ch == "#":
        g.stem(margin + 160, 180, 580, s(sw, 32))
        g.stem(UNITS_PER_EM - margin - 160, 180, 580, s(sw, 32))
        g.bar(margin + 100, UNITS_PER_EM - margin - 100, 420, s(sw, 28))
        g.bar(margin + 100, UNITS_PER_EM - margin - 100, 260, s(sw, 28))
    elif ch == "&":
        g.crescent(cx - 40, 420, 150, s(sw, 38), "right")
        g.crescent(cx + 60, 280, 120, s(sw, 34), "left")
        g.teardrop(cx - 80, 120, s(sw, 32), s(sw, 42), flip=True)
    elif ch == "*":
        g.chevron(cx, 380, 200, 160, up=True)
        g.chevron(cx, 380, 200, 160, up=False)
        g.diamond(cx, 380, s(sw, 30))
    elif ch == "+":
        g.bar(cx - 120, cx + 120, 380, s(sw, 28))
        g.stem(cx, 260, 500, s(sw, 28))
    elif ch == "/":
        g.chevron(cx, 380, 180, 420, up=True)
    elif ch == "=":
        g.bar(cx - 140, cx + 140, 440, s(sw, 26))
        g.bar(cx - 140, cx + 140, 320, s(sw, 26))
    return g


def build_lowercase_letter(ch: str, style: Style) -> GlyphCanvas:
    """Derive a uniform lowercase glyph from the uppercase design."""
    upper = build_letter(ch.upper(), style)
    baseline = 80.0
    cx = UNITS_PER_EM / 2
    scale = 0.68
    extra_y = 50.0 if ch in "gjpqy" else 0.0
    g = GlyphCanvas()
    g.contours = scale_contours(upper.contours, scale, scale, cx, baseline, dx=0, dy=extra_y)
    return g


# ---------------------------------------------------------------------------
# Transform & render contours to TTGlyphPen
# ---------------------------------------------------------------------------

def apply_italic(contours: list[Contour], shear: float) -> list[Contour]:
    if shear == 0:
        return contours
    out = []
    for contour in contours:
        nc = Contour()
        for cmd, pts in contour.points:
            if cmd == "Z":
                nc.points.append(("Z", ()))
            elif cmd == "M":
                x, y = pts
                nc.points.append(("M", (x + y * shear, y)))
            elif cmd == "L":
                x, y = pts
                nc.points.append(("L", (x + y * shear, y)))
            elif cmd == "Q":
                cx, cy, x, y = pts
                nc.points.append(("Q", (cx + cy * shear, cy, x + y * shear, y)))
            elif cmd == "C":
                c1x, c1y, c2x, c2y, x, y = pts
                nc.points.append(("C", (
                    c1x + c1y * shear, c1y,
                    c2x + c2y * shear, c2y,
                    x + y * shear, y,
                )))
        out.append(nc)
    return out


def contours_to_pen(contours: list[Contour], pen: TTGlyphPen) -> None:
    for contour in contours:
        for cmd, pts in contour.points:
            if cmd == "M":
                pen.moveTo(pts)
            elif cmd == "L":
                pen.lineTo(pts)
            elif cmd == "Q":
                pen.qCurveTo(pts[:2], pts[2:])
            elif cmd == "C":
                pen.curveTo(pts[:2], pts[2:4], pts[4:])
            elif cmd == "Z":
                pen.closePath()


def build_glyph(char: str, style: Style, pen: TTGlyphPen) -> None:
    if char == ".notdef":
        g = GlyphCanvas()
        g.angular_frame(100, 100, 800, 600, 40)
        g.diamond(500, 400, 80)
        contours = apply_italic(g.contours, style.italic_shear)
        contours_to_pen(contours, pen)
        return
    if char == "space":
        # Empty glyph — no contours
        return

    if char in SPECIAL_CHAR_SET:
        canvas = build_special_char(char, style)
    elif char.islower():
        canvas = build_lowercase_letter(char, style)
    else:
        canvas = build_letter(char, style)
    contours = apply_italic(canvas.contours, style.italic_shear)
    contours_to_pen(contours, pen)


# ---------------------------------------------------------------------------
# Font assembly
# ---------------------------------------------------------------------------

def build_cmap() -> dict[int, str]:
    cmap: dict[int, str] = {32: "space"}
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        cmap[ord(ch)] = ch
    for ch in "abcdefghijklmnopqrstuvwxyz":
        cmap[ord(ch)] = ch
    for ch in "0123456789":
        cmap[ord(ch)] = ch
    for ch in SPECIAL_CHARS:
        cmap[ord(ch)] = ch
    return cmap


def build_metrics(glyph_names: list[str]) -> dict[str, tuple[int, int]]:
    metrics = {}
    for name in glyph_names:
        if name == ".notdef":
            metrics[name] = (920, 80)
        elif name == "space":
            metrics[name] = (300, 0)
        elif name in SPECIAL_CHAR_SET:
            metrics[name] = (420, 80) if name in {".", ",", "'", '"', ";", ":"} else (520, 80)
        elif name.islower():
            metrics[name] = (560, 80)
        else:
            metrics[name] = (620, 80)
    return metrics


def create_font(style: Style, out_path: Path) -> None:
    glyph_names = GLYPH_ORDER[:]
    glyphs: dict = {}
    for name in glyph_names:
        tt_pen = TTGlyphPen(None)
        pen = Cu2QuPen(tt_pen, max_err=1.0)
        build_glyph(name, style, pen)
        glyphs[name] = tt_pen.glyph()

    cmap = build_cmap()
    metrics = build_metrics(glyph_names)

    fb = FontBuilder(UNITS_PER_EM, isTTF=True)
    fb.setupGlyphOrder(glyph_names)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHead()
    fb.setupHorizontalHeader(ascent=ASCENDER, descent=DESCENDER)
    fb.setupMaxp()
    fb.setupHorizontalMetrics(metrics)
    fb.setupOS2(
        sTypoAscender=ASCENDER,
        sTypoDescender=DESCENDER,
        sTypoLineGap=90,
        usWinAscent=ASCENDER,
        usWinDescent=abs(DESCENDER),
        sxHeight=X_HEIGHT,
        sCapHeight=CAP_HEIGHT,
        usWeightClass=style.weight,
    )
    fb.setupPost()

    name_records = {
        "familyName": FAMILY_NAME,
        "styleName": style.subfamily,
        "uniqueFontIdentifier": f"{FAMILY_NAME}-{style.name}-{VERSION}",
        "fullName": f"{FAMILY_NAME} {style.subfamily}",
        "psName": f"{FAMILY_NAME}-{style.name}",
        "version": VERSION,
    }
    fb.setupNameTable(name_records)

    mac_style = 0
    if style.weight >= 700:
        mac_style |= 1
    if style.italic:
        mac_style |= 2
    fb.font["head"].macStyle = mac_style
    fb.font["OS/2"].fsSelection = (1 if style.italic else 0) | (32 if style.weight >= 700 else 0)

    if style.italic:
        fb.font["post"].italicAngle = -12.0

    fb.save(out_path)
    print(f"  wrote {out_path}")


# ---------------------------------------------------------------------------
# Reference chart (HTML + PNG)
# ---------------------------------------------------------------------------

def generate_chart_html(font_paths: dict[str, Path]) -> str:
    letters = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    lowers = list("abcdefghijklmnopqrstuvwxyz")
    numbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]
    specials = SPECIAL_CHARS

    face_specs = {
        "Regular": (400, "normal"),
        "Italic": (400, "italic"),
        "Bold": (700, "normal"),
        "BoldItalic": (700, "italic"),
    }
    css_fonts = ""
    for style_name, path in font_paths.items():
        rel = os.path.relpath(path, CHART_DIR).replace("\\", "/")
        weight, fstyle = face_specs[style_name]
        css_fonts += f"""
@font-face {{
  font-family: '{FAMILY_NAME}';
  src: url('{rel}') format('truetype');
  font-weight: {weight};
  font-style: {fstyle};
}}
"""

    def grid_section(title: str, chars: list[str], labels: dict[str, str] | None = None) -> str:
        labels = labels or {}
        cells = ""
        for ch in chars:
            label = labels.get(ch, ch)
            cells += f"""
      <div class="cell">
        <div class="glyph">{ch}</div>
        <div class="latin">{label}</div>
      </div>"""
        return f"""
    <h2>{title}</h2>
    <div class="grid">{cells}
    </div>"""

    styles_html = ""
    style_classes = [
        ("Regular", "regular"),
        ("Italic", "italic"),
        ("Bold", "bold"),
        ("BoldItalic", "bold-italic"),
    ]
    for label, cls in style_classes:
        styles_html += f"""
    <section class="style-block {cls}">
      <h1>{FAMILY_NAME} — {label.replace('BoldItalic', 'Bold Italic')}</h1>
      {grid_section("Letters A–Z", letters)}
      {grid_section("Lowercase a–z", lowers)}
      {grid_section("Numbers 1–10", numbers, NUMBER_LABELS)}
      {grid_section("Special characters", specials)}
    </section>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{FAMILY_NAME} Glyph Reference Chart</title>
  <style>
    {css_fonts}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0a0e14;
      color: #c8d6e5;
      margin: 0;
      padding: 2rem;
    }}
    h1 {{
      font-family: inherit;
      font-size: 1.4rem;
      color: #7ec8e3;
      border-bottom: 1px solid #1e3a4f;
      padding-bottom: 0.5rem;
    }}
    h2 {{
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #5a7a8a;
      margin: 1.5rem 0 0.75rem;
    }}
    .style-block {{ margin-bottom: 3rem; }}
    .style-block .glyph {{
      font-family: '{FAMILY_NAME}', serif;
      font-size: 3.2rem;
      line-height: 1;
      color: #e8f4f8;
    }}
    .regular .glyph {{ font-weight: 400; font-style: normal; }}
    .italic .glyph {{ font-weight: 400; font-style: italic; }}
    .bold .glyph {{ font-weight: 700; font-style: normal; }}
    .bold-italic .glyph {{ font-weight: 700; font-style: italic; }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
      gap: 0.75rem;
    }}
    .cell {{
      background: #111820;
      border: 1px solid #1e3a4f;
      border-radius: 6px;
      padding: 0.75rem 0.5rem;
      text-align: center;
    }}
    .latin {{
      font-family: inherit;
      font-size: 0.75rem;
      color: #7ec8e3;
      margin-top: 0.4rem;
      font-weight: 600;
    }}
    .intro {{
      max-width: 720px;
      line-height: 1.6;
      margin-bottom: 2rem;
      color: #8aa0b0;
    }}
    .note {{
      background: #141c28;
      border-left: 3px solid #7ec8e3;
      padding: 0.75rem 1rem;
      margin: 1rem 0 2rem;
      font-size: 0.9rem;
    }}
  </style>
</head>
<body>
  <h1 style="font-size:2rem;border:none;">{FAMILY_NAME} Glyph Reference</h1>
  <p class="intro">
    Eldaraure blends flowing Elvish (Tengwar-inspired) curves with angular
    Galactic Basic (Aurebesh-inspired) geometry. Type standard Latin keys;
    the font renders the custom glyphs shown below.
  </p>
  <div class="note">
    <strong>Number mapping:</strong> Keys <code>1</code>–<code>9</code> render digits one through nine.
    Key <code>0</code> renders <strong>ten</strong> (a combined 1+0 glyph).
  </div>
  {styles_html}
</body>
</html>"""


def generate_chart_png(font_paths: dict[str, Path], out_path: Path) -> None:
    from PIL import Image, ImageDraw, ImageFont

    letters = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    lowers = list("abcdefghijklmnopqrstuvwxyz")
    numbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]
    specials = SPECIAL_CHARS
    all_chars = letters + lowers + numbers + specials
    all_labels = {ch: ch for ch in letters + lowers + specials}
    all_labels.update(NUMBER_LABELS)

    cols = 13
    cell_w, cell_h = 110, 100
    header_h = 50
    section_gap = 30
    styles = ["Regular", "Italic", "Bold", "BoldItalic"]
    rows_per_section = math.ceil(len(all_chars) / cols)
    section_h = header_h + rows_per_section * cell_h + 40
    img_h = 120 + len(styles) * section_h + section_gap * (len(styles) - 1)
    img_w = cols * cell_w + 40

    img = Image.new("RGB", (img_w, img_h), "#0a0e14")
    draw = ImageDraw.Draw(img)

    try:
        label_font = ImageFont.truetype("arial.ttf", 14)
        title_font = ImageFont.truetype("arial.ttf", 22)
    except OSError:
        label_font = ImageFont.load_default()
        title_font = label_font

    draw.text((20, 15), f"{FAMILY_NAME} — Glyph Reference Chart", fill="#7ec8e3", font=title_font)
    draw.text((20, 48), "0 key = ten  |  1-9 = one through nine", fill="#5a7a8a", font=label_font)

    y = 90
    for style_name in styles:
        font_path = font_paths[style_name]
        pil_font = ImageFont.truetype(str(font_path), 52)
        display_name = style_name.replace("BoldItalic", "Bold Italic")
        draw.text((20, y), display_name, fill="#7ec8e3", font=label_font)
        y += 28

        for i, ch in enumerate(all_chars):
            col = i % cols
            row = i // cols
            x = 20 + col * cell_w
            cy = y + row * cell_h
            draw.rectangle([x, cy, x + cell_w - 8, cy + cell_h - 8], outline="#1e3a4f", fill="#111820")
            bbox = draw.textbbox((0, 0), ch, font=pil_font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw.text((x + (cell_w - 8 - tw) // 2 - bbox[0], cy + 8 - bbox[1]), ch, fill="#e8f4f8", font=pil_font)
            lbl = all_labels[ch]
            lb = draw.textbbox((0, 0), lbl, font=label_font)
            lw = lb[2] - lb[0]
            draw.text((x + (cell_w - 8 - lw) // 2, cy + cell_h - 30), lbl, fill="#7ec8e3", font=label_font)

        y += rows_per_section * cell_h + section_gap

    img.save(out_path)
    print(f"  wrote {out_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CHART_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Generating {FAMILY_NAME} font family...")
    font_paths: dict[str, Path] = {}
    for style in STYLES:
        filename = f"{FAMILY_NAME}-{style.name}.ttf"
        out = OUTPUT_DIR / filename
        create_font(style, out)
        font_paths[style.name] = out

    print("Generating reference charts...")
    html = generate_chart_html(font_paths)
    html_path = CHART_DIR / "glyph-reference.html"
    html_path.write_text(html, encoding="utf-8")
    print(f"  wrote {html_path}")

    png_path = CHART_DIR / "glyph-reference.png"
    generate_chart_png(font_paths, png_path)

    print("\nDone! Files:")
    for p in font_paths.values():
        print(f"  {p}")
    print(f"  {html_path}")
    print(f"  {png_path}")


if __name__ == "__main__":
    main()
