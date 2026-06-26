/**
 * Font Maker engine — pixel grids, import, TTF export, chart PNG.
 */
const FontEngine = (() => {
  const GRID_W = 72;
  const GRID_H = 96;
  const LEGACY_GRID_W = 36;
  const LEGACY_GRID_H = 48;
  const UNITS_PER_EM = 1000;
  const ASCENDER = 800;
  const DESCENDER = -200;
  const LEFT_BEARING = 60;
  const UNIT = (UNITS_PER_EM - LEFT_BEARING * 2) / GRID_W;

  const LETTERS_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const LETTERS_LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
  const DIGITS = "0123456789".split("");
  const SPECIAL_CHARS = [".", ",", "!", "?", ";", ":", "'", '"', "-", "(", ")", "[", "]", "@", "#", "&", "*", "+", "/", "="];
  const SPECIAL_CHAR_SET = new Set(SPECIAL_CHARS);
  const SPECIAL_NARROW = new Set([".", ",", ";", ":", "!", "?", "'", '"']);
  const SPECIAL_PARENS = new Set(["(", ")", "[", "]"]);
  const SPECIAL_MATH = new Set(["-", "+", "/", "="]);
  const CHARS = [...LETTERS_UPPER, ...LETTERS_LOWER, ...DIGITS, ...SPECIAL_CHARS];
  const LOWER_ASCENDERS = new Set(["b", "d", "f", "h", "k", "l", "t"]);
  const LOWER_DESCENDERS = new Set(["g", "j", "p", "q", "y"]);
  const TYPO_BASELINE = 72;
  const TYPO_CAP_TOP = 16;
  const TYPO_LOWER_X_TOP = 32;
  const TYPO_LOWER_ASC_TOP = 12;
  const TYPO_DESC_BOTTOM = 88;
  const VARIANTS = ["regular", "italic", "bold", "boldItalic"];
  const VARIANT_LABELS = {
    regular: "Regular",
    italic: "Italic",
    bold: "Bold",
    boldItalic: "Bold Italic",
  };
  const DEFAULT_SPACING = { letter: 0, word: 4 };
  const DEFAULT_WEIGHT = 400;
  const DEFAULT_GLYPH_METRICS = {
    glyphScale: 100,
    offsetX: 0,
    offsetY: 0,
    advanceAdjust: 0,
  };
  const DEFAULT_LAYOUT = {
    lineShiftX: 0,
    lineShiftY: 0,
  };
  const EDITOR_CELL_PX = 6;
  const EDITOR_RESOLUTION_PRESETS = [
    { id: "4", label: "Ultra fine (4px)", cellPx: 4 },
    { id: "6", label: "Fine (6px)", cellPx: 6 },
    { id: "8", label: "Normal (8px)", cellPx: 8 },
    { id: "10", label: "Large (10px)", cellPx: 10 },
    { id: "12", label: "Coarse (12px)", cellPx: 12 },
  ];
  const DEFAULT_EDITOR_RESOLUTION_ID = "6";
  const RESOLUTION_PRESETS = [
    { id: "48", label: "48px", preview: 48, line: 64 },
    { id: "64", label: "64px", preview: 64, line: 80 },
    { id: "96", label: "96px", preview: 96, line: 112 },
    { id: "128", label: "128px", preview: 128, line: 144 },
    { id: "160", label: "160px", preview: 160, line: 176 },
  ];
  const DEFAULT_RESOLUTION_ID = "96";
  const BASE_ADVANCE = UNITS_PER_EM - 20;
  const BASE_SPACE_ADVANCE = 320;
  const ENGLISH_BASE_ID = "english-base";
  const ENGLISH_FONT_FAMILY = '"DM Sans", system-ui, sans-serif';

  function defaultSpacing() {
    return { letter: DEFAULT_SPACING.letter, word: DEFAULT_SPACING.word };
  }

  function defaultWeight() {
    return DEFAULT_WEIGHT;
  }

  function defaultLayout() {
    return { ...DEFAULT_LAYOUT };
  }

  function defaultGlyphMetrics() {
    return { ...DEFAULT_GLYPH_METRICS };
  }

  function ensureGlyphMetrics(fontData) {
    if (!fontData.glyphMetrics) fontData.glyphMetrics = {};
    for (const ch of CHARS) {
      if (!fontData.glyphMetrics[ch]) {
        fontData.glyphMetrics[ch] = defaultGlyphMetrics();
      }
    }
  }

  function getGlyphMetrics(fontData, ch) {
    ensureGlyphMetrics(fontData);
    return { ...DEFAULT_GLYPH_METRICS, ...fontData.glyphMetrics[ch] };
  }

  function setGlyphMetrics(fontData, ch, patch) {
    ensureGlyphMetrics(fontData);
    Object.assign(fontData.glyphMetrics[ch], patch);
  }

  function getWeight(fontData) {
    return fontData.weight ?? DEFAULT_WEIGHT;
  }

  function weightToRadius(weight) {
    if (weight === DEFAULT_WEIGHT) return 0;
    const delta = weight - DEFAULT_WEIGHT;
    return Math.sign(delta) * Math.ceil(Math.abs(delta) / 80);
  }

  function getSpacing(fontData) {
    return {
      letter: fontData.spacing?.letter ?? DEFAULT_SPACING.letter,
      word: fontData.spacing?.word ?? DEFAULT_SPACING.word,
    };
  }

  function defaultEditorResolution() {
    return DEFAULT_EDITOR_RESOLUTION_ID;
  }

  function getEditorResolutionPreset(id) {
    return EDITOR_RESOLUTION_PRESETS.find((p) => p.id === id)
      || EDITOR_RESOLUTION_PRESETS.find((p) => p.id === DEFAULT_EDITOR_RESOLUTION_ID);
  }

  function getEditorCellPx(fontData) {
    const id = fontData?.editorResolution || DEFAULT_EDITOR_RESOLUTION_ID;
    return getEditorResolutionPreset(id).cellPx;
  }

  function defaultResolution() {
    return DEFAULT_RESOLUTION_ID;
  }

  function getResolutionPreset(id) {
    return RESOLUTION_PRESETS.find((p) => p.id === id) || RESOLUTION_PRESETS.find((p) => p.id === DEFAULT_RESOLUTION_ID);
  }

  function weightRadiusForVariant(fontData, variant) {
    return weightToRadius(variantExportWeight(fontData, variant));
  }

  /** Pixel margins for ink drawn inside a standard glyph slot (no clipping). */
  function glyphInkBounds(fontData, ch, cellSize, fontSize, variant = "regular") {
    const m = getGlyphMetrics(fontData, ch);
    const weightR = weightRadiusForVariant(fontData, variant);
    const scale = m.glyphScale / 100;
    const inkCell = cellSize * scale;
    const inkW = GRID_W * inkCell;
    const inkH = GRID_H * inkCell;
    const slotW = GRID_W * cellSize;
    const drawX = (slotW - inkW) / 2 + m.offsetX * cellSize;
    const drawY = (fontSize - inkH) / 2 + m.offsetY * cellSize;
    const expandPx = Math.max(0, weightR) * inkCell;
    const gapFill = Math.max(0.75, inkCell * 0.04);
    let minX = drawX - expandPx;
    let maxX = drawX + inkW + expandPx + gapFill;
    let minY = drawY - expandPx;
    let maxY = drawY + inkH + expandPx + gapFill;
    const shear = variantShear(variant);
    if (shear) {
      let tMinX = Infinity;
      let tMaxX = -Infinity;
      for (const px of [minX, maxX]) {
        for (const py of [minY, maxY]) {
          const tx = px + shear * py - drawY * shear;
          tMinX = Math.min(tMinX, tx);
          tMaxX = Math.max(tMaxX, tx);
        }
      }
      minX = tMinX;
      maxX = tMaxX;
    }
    return { minX, maxX, minY, maxY, drawX, drawY };
  }

  function glyphDrawMargin(fontData, ch, cellSize, variant = "regular") {
    const fontSize = GRID_H * cellSize;
    const slotW = GRID_W * cellSize;
    const slotH = fontSize;
    const { minX, maxX, minY, maxY } = glyphInkBounds(fontData, ch, cellSize, fontSize, variant);
    const safe = cellSize * 0.35;
    return {
      left: Math.max(0, safe - minX),
      right: Math.max(0, safe + maxX - slotW),
      top: Math.max(0, safe - minY),
      bottom: Math.max(0, safe + maxY - slotH),
    };
  }

  function editorCanvasMargins(fontData, variant, cellSize) {
    const weightR = fontData ? weightRadiusForVariant(fontData, variant) : 0;
    const expandPx = Math.max(0, weightR) * cellSize;
    const gapFill = Math.max(0.75, cellSize * 0.04);
    const shear = variantShear(variant);
    const innerH = GRID_H * cellSize;
    const innerW = GRID_W * cellSize;
    let minX = -expandPx;
    let maxX = innerW + expandPx + gapFill;
    let minY = -expandPx;
    let maxY = innerH + expandPx + gapFill;
    if (shear) {
      let tMinX = Infinity;
      let tMaxX = -Infinity;
      for (const gx of [minX, maxX]) {
        for (const gy of [minY, maxY]) {
          const tx = gx + shear * gy;
          tMinX = Math.min(tMinX, tx);
          tMaxX = Math.max(tMaxX, tx);
        }
      }
      minX = tMinX;
      maxX = tMaxX;
    }
    const safe = cellSize * 0.5;
    return {
      left: Math.ceil(safe - minX),
      right: Math.ceil(safe + maxX - innerW),
      top: Math.ceil(safe - minY),
      bottom: Math.ceil(safe + maxY - innerH),
    };
  }

  function editorCanvasPointToCell(px, py, fontData, variant, cellSize) {
    const margins = editorCanvasMargins(fontData, variant, cellSize);
    const padL = margins.left;
    const padT = margins.top;
    const shear = variantShear(variant);
    const y = Math.floor((py - padT) / cellSize);
    if (y < 0 || y >= GRID_H) return null;
    const skewOffset = shear * y * cellSize;
    const x = Math.floor((px - padL - skewOffset) / cellSize);
    if (x < 0 || x >= GRID_W) return null;
    return { x, y };
  }

  function applyEditorDrawTransform(ctx, padT, variant) {
    const shear = variantShear(variant);
    if (shear) ctx.transform(1, 0, shear, 1, -padT * shear, 0);
    return shear;
  }

  function editorCanvasPixelSize(fontData, variant, cellSize) {
    const innerW = GRID_W * cellSize;
    const innerH = GRID_H * cellSize;
    const m = editorCanvasMargins(fontData, variant, cellSize);
    return {
      innerW,
      innerH,
      width: innerW + m.left + m.right,
      height: innerH + m.top + m.bottom,
      margins: m,
    };
  }

  function editorVariantPadding(fontData, variant, cellSize) {
    const m = editorCanvasMargins(fontData, variant, cellSize);
    return Math.max(m.left, m.right, m.top, m.bottom);
  }

  function getLayout(fontData) {
    return { ...DEFAULT_LAYOUT, ...fontData.layout };
  }

  const NUMBER_LABELS = {
    1: "1", 2: "2", 3: "3", 4: "4", 5: "5",
    6: "6", 7: "7", 8: "8", 9: "9", 0: "10",
  };

  function variantFromToggles(bold, italic) {
    if (bold && italic) return "boldItalic";
    if (bold) return "bold";
    if (italic) return "italic";
    return "regular";
  }

  function createEmptyGrid() {
    return Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));
  }

  function cloneGrid(grid) {
    return grid.map((row) => row.slice());
  }

  function createEmptyFont(name) {
    const variants = {};
    for (const v of VARIANTS) {
      variants[v] = {};
      for (const ch of CHARS) variants[v][ch] = createEmptyGrid();
    }
    const glyphMetrics = {};
    for (const ch of CHARS) glyphMetrics[ch] = defaultGlyphMetrics();
    return {
      name,
      variants,
      spacing: defaultSpacing(),
      weight: defaultWeight(),
      layout: defaultLayout(),
      glyphMetrics,
      resolution: defaultResolution(),
      editorResolution: defaultEditorResolution(),
      languages: null,
      activeLanguageId: null,
    };
  }

  function defaultSyntax() {
    return {
      wordSep: " ",
      sentenceEnd: ".",
      clauseSep: ",",
      question: "?",
      exclamation: "!",
      quoteOpen: '"',
      quoteClose: '"',
      direction: "ltr",
      custom: [],
    };
  }

  function latinLanguage() {
    const charMap = {};
    for (const ch of CHARS) charMap[ch] = ch;

    return {
      id: "lang-latin",
      name: "Latin",
      description: "Standard Latin writing system. Characters, punctuation, and common digraphs map directly to their glyphs.",
      syntax: defaultSyntax(),
      alphabet: CHARS.join(""),
      charMap,
      transliteration: [
        { from: "ch", to: "CH" },
        { from: "ph", to: "PH" },
        { from: "th", to: "TH" },
        { from: "sh", to: "SH" },
        { from: "qu", to: "QU" },
        { from: "ng", to: "NG" },
        { from: "ae", to: "AE" },
        { from: "oe", to: "OE" },
      ],
    };
  }

  function isLatinLanguage(lang) {
    return lang?.id === "lang-latin" || lang?.name?.toLowerCase() === "latin";
  }

  function ensureLatinDefaults(lang) {
    if (!isLatinLanguage(lang)) return;
    const latin = latinLanguage();
    if (!lang.description) lang.description = latin.description;
    if (!lang.syntax) lang.syntax = { ...latin.syntax };
    if (!lang.alphabet) lang.alphabet = latin.alphabet;
    if (!lang.charMap || !Object.keys(lang.charMap).length) {
      lang.charMap = { ...latin.charMap };
    }
    if (!lang.transliteration?.length) {
      lang.transliteration = latin.transliteration.map((r) => ({ ...r }));
    }
    if (!lang.syntax.custom?.length && latin.syntax.custom?.length) {
      lang.syntax.custom = latin.syntax.custom.map((e) => ({ ...e }));
    }
  }

  function defaultLanguage(name = "New Language") {
    return {
      id: `lang-${Date.now().toString(36)}`,
      name,
      description: "",
      syntax: defaultSyntax(),
      alphabet: CHARS.join(""),
      charMap: {},
      transliteration: [],
    };
  }

  function ensureLanguages(fontData) {
    if (!fontData.languages?.length) {
      const latin = latinLanguage();
      fontData.languages = [latin];
      fontData.activeLanguageId = latin.id;
    }
    if (!fontData.activeLanguageId) {
      fontData.activeLanguageId = fontData.languages[0].id;
    }
    for (const lang of fontData.languages) {
      if (!lang.syntax) lang.syntax = defaultSyntax();
      if (!lang.alphabet) lang.alphabet = CHARS.join("");
      if (!lang.charMap) lang.charMap = {};
      if (!lang.transliteration) lang.transliteration = [];
      if (!lang.syntax.custom) lang.syntax.custom = [];
      ensureLatinDefaults(lang);
    }
  }

  function getActiveLanguage(fontData) {
    ensureLanguages(fontData);
    return fontData.languages.find((l) => l.id === fontData.activeLanguageId) || fontData.languages[0];
  }

  function applySyntax(text, syntax) {
    if (!syntax) return text;
    let out = text;

    const custom = [...(syntax.custom || [])]
      .filter((e) => e.name && e.symbol)
      .sort((a, b) => b.name.length - a.name.length);
    for (const entry of custom) {
      out = out.split(entry.name).join(entry.symbol);
    }

    const mapChar = (ch) => {
      switch (ch) {
        case " ": return syntax.wordSep ?? " ";
        case ".": return syntax.sentenceEnd ?? ".";
        case ",": return syntax.clauseSep ?? ",";
        case "?": return syntax.question ?? "?";
        case "!": return syntax.exclamation ?? "!";
        default: return ch;
      }
    };

    let quoteToggle = 0;
    out = [...out].map((ch) => {
      if (ch === '"') {
        const q = quoteToggle % 2 === 0
          ? (syntax.quoteOpen ?? '"')
          : (syntax.quoteClose ?? '"');
        quoteToggle += 1;
        return q;
      }
      return mapChar(ch);
    }).join("");

    return out;
  }

  function applyLanguage(text, language) {
    if (!language) return text;
    let out = text;
    const rules = [...(language.transliteration || [])].sort(
      (a, b) => (b.from?.length || 0) - (a.from?.length || 0)
    );
    for (const rule of rules) {
      if (!rule.from) continue;
      out = out.split(rule.from).join(rule.to ?? "");
    }
    out = applySyntax(out, language.syntax);
    const map = language.charMap || {};
    if (Object.keys(map).length) {
      out = [...out].map((ch) => map[ch] ?? map[ch.toLowerCase()] ?? map[ch.toUpperCase()] ?? ch).join("");
    }
    return out;
  }

  function translateForFont(text, fontData) {
    return applyLanguage(text, getActiveLanguage(fontData));
  }

  function isLegacyGrid(grid) {
    return grid?.length === LEGACY_GRID_H && grid[0]?.length === LEGACY_GRID_W;
  }

  function upscaleGrid2x(grid) {
    const out = createEmptyGrid();
    for (let y = 0; y < LEGACY_GRID_H; y++) {
      for (let x = 0; x < LEGACY_GRID_W; x++) {
        if (!grid[y][x]) continue;
        const y2 = y * 2;
        const x2 = x * 2;
        out[y2][x2] = true;
        out[y2][x2 + 1] = true;
        out[y2 + 1][x2] = true;
        out[y2 + 1][x2 + 1] = true;
      }
    }
    return out;
  }

  function ensureGridSize(grid) {
    if (!grid) return createEmptyGrid();
    if (isLegacyGrid(grid)) return upscaleGrid2x(grid);
    if (grid.length === GRID_H && grid[0]?.length === GRID_W) return grid;
    const out = createEmptyGrid();
    const h = Math.min(GRID_H, grid.length);
    const w = Math.min(GRID_W, grid[0]?.length || 0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        out[y][x] = !!grid[y][x];
      }
    }
    return out;
  }

  function upgradeFontGrids(fontData) {
    for (const vkey of VARIANTS) {
      for (const ch of CHARS) {
        fontData.variants[vkey][ch] = ensureGridSize(fontData.variants[vkey][ch]);
      }
    }
  }

  function isUpperLetter(ch) {
    return ch >= "A" && ch <= "Z";
  }

  function isLowerLetter(ch) {
    return ch >= "a" && ch <= "z";
  }

  function isDigit(ch) {
    return ch >= "0" && ch <= "9";
  }

  function isSpecialChar(ch) {
    return SPECIAL_CHAR_SET.has(ch);
  }

  function rasterScaleForChar(ch) {
    if (isLowerLetter(ch)) return 0.34;
    if (isSpecialChar(ch)) {
      if (ch === ".") return 0.22;
      if (ch === ",") return 0.24;
      if (SPECIAL_NARROW.has(ch)) return 0.28;
      if (SPECIAL_PARENS.has(ch)) return 0.32;
      if (SPECIAL_MATH.has(ch)) return 0.34;
      return 0.38;
    }
    return 0.48;
  }

  function caseInkBox(ch) {
    if (isUpperLetter(ch) || isDigit(ch)) {
      return { minY: TYPO_CAP_TOP, maxY: TYPO_BASELINE, maxW: 60 };
    }
    if (isLowerLetter(ch)) {
      const minY = LOWER_ASCENDERS.has(ch) ? TYPO_LOWER_ASC_TOP : TYPO_LOWER_X_TOP;
      const maxY = LOWER_DESCENDERS.has(ch) ? TYPO_DESC_BOTTOM : TYPO_BASELINE;
      return { minY, maxY, maxW: 52 };
    }
    if (isSpecialChar(ch)) {
      if (ch === ".") {
        return { minY: 64, maxY: 74, maxW: 12, anchor: "baseline" };
      }
      if (ch === ",") {
        return { minY: 58, maxY: 76, maxW: 16, anchor: "baseline" };
      }
      if (ch === "'" || ch === '"') {
        return { minY: TYPO_CAP_TOP + 8, maxY: TYPO_LOWER_X_TOP + 8, maxW: ch === '"' ? 28 : 14 };
      }
      if (SPECIAL_PARENS.has(ch)) {
        return { minY: TYPO_LOWER_X_TOP, maxY: TYPO_BASELINE, maxW: 30 };
      }
      if (SPECIAL_MATH.has(ch)) {
        return { minY: TYPO_CAP_TOP + 20, maxY: TYPO_BASELINE - 16, maxW: 36 };
      }
      if (SPECIAL_NARROW.has(ch)) {
        return { minY: TYPO_CAP_TOP + 14, maxY: TYPO_BASELINE - 8, maxW: 20 };
      }
      return { minY: TYPO_CAP_TOP + 4, maxY: TYPO_BASELINE - 2, maxW: 44 };
    }
    return { minY: TYPO_CAP_TOP, maxY: TYPO_BASELINE, maxW: 48 };
  }

  function blitGrid(out, grid, destX, destY) {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!grid[y][x]) continue;
        const nx = destX + x;
        const ny = destY + y;
        if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) out[ny][nx] = true;
      }
    }
  }

  function normalizeInkUniform(grid, ch) {
    const bounds = getGridBounds(grid);
    if (!bounds) return grid;
    const box = caseInkBox(ch);
    const gw = bounds.maxX - bounds.minX + 1;
    const gh = bounds.maxY - bounds.minY + 1;
    const targetH = box.maxY - box.minY;
    const targetW = Math.min(box.maxW, GRID_W - 4);
    let scale = Math.min(targetW / gw, targetH / gh);
    if (isSpecialChar(ch)) {
      const maxScale = ch === "." ? 1.05 : (SPECIAL_NARROW.has(ch) ? 1.2 : 1.45);
      scale = Math.min(scale, maxScale);
    }
    const newW = Math.max(1, Math.round(gw * scale));
    const newH = Math.max(1, Math.round(gh * scale));
    const out = createEmptyGrid();
    const destX = Math.round((GRID_W - newW) / 2);
    const destY = box.anchor === "baseline" ? box.maxY - newH : box.maxY - newH;
    for (let dy = 0; dy < newH; dy++) {
      for (let dx = 0; dx < newW; dx++) {
        const sx = bounds.minX + (dx + 0.5) / scale - 0.5;
        const sy = bounds.minY + (dy + 0.5) / scale - 0.5;
        const ix = Math.round(sx);
        const iy = Math.round(sy);
        if (ix < 0 || iy < 0 || ix >= GRID_W || iy >= GRID_H) continue;
        if (!grid[iy][ix]) continue;
        const ny = destY + dy;
        const nx = destX + dx;
        if (ny >= 0 && ny < GRID_H && nx >= 0 && nx < GRID_W) out[ny][nx] = true;
      }
    }
    return cleanupGrid(out);
  }

  function deriveLowercaseFromUppercase(upperGrid, ch) {
    if (!gridHasInk(upperGrid)) return createEmptyGrid();
    const bounds = getGridBounds(upperGrid);
    if (!bounds) return createEmptyGrid();
    const scale = 0.72;
    const gw = bounds.maxX - bounds.minX + 1;
    const gh = bounds.maxY - bounds.minY + 1;
    const newW = Math.max(1, Math.round(gw * scale));
    const newH = Math.max(1, Math.round(gh * scale));
    const tmp = createEmptyGrid();
    for (let dy = 0; dy < newH; dy++) {
      for (let dx = 0; dx < newW; dx++) {
        const sx = bounds.minX + (dx + 0.5) / scale - 0.5;
        const sy = bounds.minY + (dy + 0.5) / scale - 0.5;
        const ix = Math.round(sx);
        const iy = Math.round(sy);
        if (ix < 0 || iy < 0 || ix >= GRID_W || iy >= GRID_H) continue;
        if (upperGrid[iy][ix]) tmp[dy][dx] = true;
      }
    }
    return normalizeInkUniform(tmp, ch);
  }

  function ensureAllGlyphs(fontData) {
    ensureGlyphMetrics(fontData);
    if (!fontData.editorResolution) fontData.editorResolution = defaultEditorResolution();
    ensureLanguages(fontData);
    upgradeFontGrids(fontData);
    for (const vkey of VARIANTS) {
      for (let i = 0; i < 26; i++) {
        const up = LETTERS_UPPER[i];
        const lo = LETTERS_LOWER[i];
        const lowerGrid = fontData.variants[vkey][lo];
        const upperGrid = fontData.variants[vkey][up];
        if (!gridHasInk(lowerGrid) || (gridHasInk(upperGrid) && gridsMatch(lowerGrid, upperGrid))) {
          fontData.variants[vkey][lo] = deriveLowercaseFromUppercase(upperGrid, lo);
        }
        if (gridHasInk(fontData.variants[vkey][up])) {
          fontData.variants[vkey][up] = normalizeInkUniform(fontData.variants[vkey][up], up);
        }
        if (gridHasInk(fontData.variants[vkey][lo])) {
          fontData.variants[vkey][lo] = normalizeInkUniform(fontData.variants[vkey][lo], lo);
        }
      }
      for (const ch of DIGITS) {
        if (gridHasInk(fontData.variants[vkey][ch])) {
          fontData.variants[vkey][ch] = normalizeInkUniform(fontData.variants[vkey][ch], ch);
        }
      }
      for (const ch of SPECIAL_CHARS) {
        if (gridHasInk(fontData.variants[vkey][ch])) {
          fontData.variants[vkey][ch] = normalizeInkUniform(fontData.variants[vkey][ch], ch);
        }
      }
    }
  }

  function gridsMatch(a, b) {
    if (!a || !b) return false;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!!a[y][x] !== !!b[y][x]) return false;
      }
    }
    return true;
  }

  function resolveTextChar(fontData, variant, ch) {
    if (ch === " ") return " ";
    if (fontData.variants[variant][ch] && gridHasInk(fontData.variants[variant][ch])) return ch;
    return null;
  }

  function gridHasInk(grid) {
    return grid && grid.some((row) => row.some(Boolean));
  }

  async function fetchFontBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Could not load font file (${res.status}): ${url}`);
    }
    return res.arrayBuffer();
  }

  function validateFontData(fontData) {
    const sample = fontData.variants.regular?.A;
    if (!gridHasInk(sample)) {
      throw new Error(
        "Font loaded but no glyph data was captured. Ensure .ttf files exist and run python serve.py."
      );
    }
  }

  function getGridBounds(grid) {
    let minX = GRID_W;
    let minY = GRID_H;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!grid[y][x]) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < 0) return null;
    return { minX, minY, maxX, maxY };
  }

  /** Shift ink so the glyph visual bounding box is centered in the grid. */
  function centerGrid(grid) {
    const bounds = getGridBounds(grid);
    if (!bounds) return grid;

    const gw = bounds.maxX - bounds.minX + 1;
    const gh = bounds.maxY - bounds.minY + 1;
    const targetLeft = Math.round((GRID_W - gw) / 2);
    const targetTop = Math.round((GRID_H - gh) / 2);
    const dx = targetLeft - bounds.minX;
    const dy = targetTop - bounds.minY;

    if (dx === 0 && dy === 0) return cloneGrid(grid);

    const out = createEmptyGrid();
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!grid[y][x]) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) {
          out[ny][nx] = true;
        }
      }
    }
    return out;
  }

  function sampleCanvasToGrid(ctx, sw, sh) {
    const scale = sw / GRID_W;
    const data = ctx.getImageData(0, 0, sw, sh);
    const grid = createEmptyGrid();
    const block = scale * scale;
    const minBright = Math.max(2, Math.ceil(block * 0.1));

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        let bright = 0;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const i = ((Math.floor(y * scale + dy)) * sw + Math.floor(x * scale + dx)) * 4;
            if (data.data[i] > 80) bright++;
          }
        }
        grid[y][x] = bright >= minBright;
      }
    }
    return grid;
  }

  function drawOpentypePath(ctx, path, offsetX, offsetY, fillRule = "evenodd") {
    ctx.beginPath();
    for (const cmd of path.commands) {
      const y = offsetY - cmd.y;
      if (cmd.type === "M") ctx.moveTo(cmd.x + offsetX, y);
      else if (cmd.type === "L") ctx.lineTo(cmd.x + offsetX, y);
      else if (cmd.type === "Q") {
        ctx.quadraticCurveTo(cmd.x1 + offsetX, offsetY - cmd.y1, cmd.x + offsetX, y);
      } else if (cmd.type === "C") {
        ctx.bezierCurveTo(
          cmd.x1 + offsetX, offsetY - cmd.y1,
          cmd.x2 + offsetX, offsetY - cmd.y2,
          cmd.x + offsetX, y
        );
      } else if (cmd.type === "Z") ctx.closePath();
    }
    ctx.fill(fillRule);
  }

  function englishVariantFontSpec(variant) {
    switch (variant) {
      case "italic":
        return { weight: 400, style: "italic" };
      case "bold":
        return { weight: 700, style: "normal" };
      case "boldItalic":
        return { weight: 700, style: "italic" };
      default:
        return { weight: 400, style: "normal" };
    }
  }

  async function ensureEnglishFontsReady() {
    if (!document.fonts) return;
    const specs = [
      `400 48px ${ENGLISH_FONT_FAMILY}`,
      `700 48px ${ENGLISH_FONT_FAMILY}`,
      `italic 400 48px ${ENGLISH_FONT_FAMILY}`,
      `italic 700 48px ${ENGLISH_FONT_FAMILY}`,
    ];
    await Promise.all(specs.map((spec) => document.fonts.load(spec)));
  }

  function rasterizeFromSystemFont(char, variant = "regular") {
    const { weight, style } = englishVariantFontSpec(variant);
    const scale = 4;
    const sw = GRID_W * scale;
    const sh = GRID_H * scale;
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, sw, sh);

    const fontSize = sh * rasterScaleForChar(char);
    const baselineY = sh * (TYPO_BASELINE / GRID_H);

    ctx.font = `${style} ${weight} ${fontSize}px ${ENGLISH_FONT_FAMILY}`;
    ctx.textBaseline = "alphabetic";
    const metrics = ctx.measureText(char);
    const inkW = Math.max(
      metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft,
      metrics.width || 0,
      1
    );
    const ox = sw / 2 - inkW / 2 - (metrics.actualBoundingBoxLeft || 0);
    ctx.fillStyle = "#fff";
    ctx.fillText(char, ox, baselineY);

    return normalizeInkUniform(sampleCanvasToGrid(ctx, sw, sh), char);
  }

  async function createEnglishBaseFont(name = "English Base") {
    await ensureEnglishFontsReady();
    const fontData = createEmptyFont(name);
    fontData.builtin = ENGLISH_BASE_ID;
    for (const vkey of VARIANTS) {
      for (const ch of CHARS) {
        fontData.variants[vkey][ch] = rasterizeFromSystemFont(ch, vkey);
      }
    }
    validateFontData(fontData);
    ensureAllGlyphs(fontData);
    return fontData;
  }

  function isEnglishBaseFont(fontData) {
    return fontData?.builtin === ENGLISH_BASE_ID;
  }

  function englishReferenceGrid(englishBaseFont, ch) {
    if (!englishBaseFont) return null;
    return englishBaseFont.variants.regular[ch] || null;
  }

  function rasterizeFromOpentype(otFont, char) {
    const scale = 4;
    const sw = GRID_W * scale;
    const sh = GRID_H * scale;
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, sw, sh);

    const glyph = otFont.charToGlyph(char);
    const refSize = sh * rasterScaleForChar(char);
    const baselineY = sh * (TYPO_BASELINE / GRID_H);
    let path = glyph.getPath(0, 0, refSize);
    let bbox = path.getBoundingBox();
    const gw = Math.max(bbox.x2 - bbox.x1, 1);
    const gh = Math.max(bbox.y2 - bbox.y1, 1);
    const box = caseInkBox(char);
    const targetH = (box.maxY - box.minY) * scale;
    const targetW = box.maxW * scale;
    const fit = Math.min(targetW / gw, targetH / gh);
    const fontSize = refSize * fit;

    path = glyph.getPath(0, 0, fontSize);
    bbox = path.getBoundingBox();

    const ox = sw / 2 - (bbox.x1 + bbox.x2) / 2;
    const oy = baselineY + bbox.y1;

    ctx.fillStyle = "#fff";
    drawOpentypePath(ctx, path, ox, oy, "evenodd");

    return normalizeInkUniform(sampleCanvasToGrid(ctx, sw, sh), char);
  }

  async function importVariantFromBuffer(buffer, fontData, vkey) {
    const otFont = opentype.parse(buffer);
    for (const ch of CHARS) {
      fontData.variants[vkey][ch] = rasterizeFromOpentype(otFont, ch);
    }
  }

  /** Remove isolated pixel speckle and fill tiny holes. */
  function cleanupGrid(grid) {
    let out = cloneGrid(grid);
    // Drop lone pixels (no orthogonal neighbors)
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!out[y][x]) continue;
        const n = (x > 0 && out[y][x - 1]) + (x < GRID_W - 1 && out[y][x + 1]) +
          (y > 0 && out[y - 1][x]) + (y < GRID_H - 1 && out[y + 1][x]);
        if (n === 0) out[y][x] = false;
      }
    }
    // Fill pixels surrounded on 3+ sides
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (out[y][x]) continue;
        const n = (x > 0 && out[y][x - 1]) + (x < GRID_W - 1 && out[y][x + 1]) +
          (y > 0 && out[y - 1][x]) + (y < GRID_H - 1 && out[y + 1][x]);
        if (n >= 3) out[y][x] = true;
      }
    }
    return out;
  }

  function erodeGrid(grid, radius) {
    if (radius <= 0) return cloneGrid(grid);
    let out = cloneGrid(grid);
    for (let r = 0; r < radius; r++) {
      const next = createEmptyGrid();
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (!out[y][x]) continue;
          let keep = true;
          for (let dy = -1; dy <= 1 && keep; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = y + dy;
              const nx = x + dx;
              if (ny < 0 || ny >= GRID_H || nx < 0 || nx >= GRID_W || !out[ny][nx]) {
                keep = false;
                break;
              }
            }
          }
          next[y][x] = keep;
        }
      }
      out = next;
    }
    return out;
  }

  async function importFamilyFromManifest(family, familyId) {
    if (family.builtin === ENGLISH_BASE_ID || familyId === ENGLISH_BASE_ID) {
      return createEnglishBaseFont(family.displayName || family.name || "English Base");
    }

    const fontData = createEmptyFont(family.name);

    for (const vkey of VARIANTS) {
      const v = family.variants[vkey];
      if (!v?.path) continue;
      const buffer = await fetchFontBuffer(v.path);
      await importVariantFromBuffer(buffer, fontData, vkey);
    }

    if (family.variants.regular) {
      const reg = fontData.variants.regular.A;
      const hasInk = reg && reg.some((row) => row.some(Boolean));
      if (hasInk) {
        for (const vkey of VARIANTS) {
          if (!family.variants[vkey]) {
            for (const ch of CHARS) {
              fontData.variants[vkey][ch] = cloneGrid(fontData.variants.regular[ch]);
            }
          }
        }
      }
    }

    validateFontData(fontData);
    ensureAllGlyphs(fontData);
    return fontData;
  }

  async function importUploadedFont(file) {
    const name = file.name.replace(/\.(ttf|otf)$/i, "") || "CustomFont";
    const buffer = await file.arrayBuffer();
    const fontData = createEmptyFont(name);
    await importVariantFromBuffer(buffer, fontData, "regular");

    for (const vkey of VARIANTS) {
      if (vkey === "regular") continue;
      for (const ch of CHARS) {
        fontData.variants[vkey][ch] = cloneGrid(fontData.variants.regular[ch]);
      }
    }

    validateFontData(fontData);
    ensureAllGlyphs(fontData);
    return { fontData, familyId: "upload-" + Date.now() };
  }

  function variantShear(variant) {
    if (variant === "italic" || variant === "boldItalic") return -0.18;
    return 0;
  }

  function variantExportWeight(fontData, variant) {
    const base = getWeight(fontData);
    if (variant === "bold" || variant === "boldItalic") return Math.min(900, base + 200);
    return base;
  }

  function applyVariantToGrid(grid, fontData, variant) {
    return applyWeightToGrid(grid, variantExportWeight(fontData, variant));
  }

  function applyWeightToGrid(grid, weight) {
    const radius = weightToRadius(weight);
    if (radius > 0) return cleanupGrid(dilateGrid(grid, radius));
    if (radius < 0) return cleanupGrid(erodeGrid(grid, -radius));
    return cleanupGrid(cloneGrid(grid));
  }

  function scaleGridInk(grid, percent) {
    const scale = percent / 100;
    if (scale === 1) return cloneGrid(grid);
    const out = createEmptyGrid();
    const cx = (GRID_W - 1) / 2;
    const cy = (GRID_H - 1) / 2;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!grid[y][x]) continue;
        const sx = Math.round(cx + (x - cx) * scale);
        const sy = Math.round(cy + (y - cy) * scale);
        if (sx >= 0 && sx < GRID_W && sy >= 0 && sy < GRID_H) out[sy][sx] = true;
      }
    }
    let scaled = cleanupGrid(out);
    if (scale > 1) scaled = dilateGrid(scaled, 1);
    return scaled;
  }

  function offsetGrid(grid, dx, dy) {
    if (!dx && !dy) return cloneGrid(grid);
    const out = createEmptyGrid();
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!grid[y][x]) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) out[ny][nx] = true;
      }
    }
    return out;
  }

  function applyGlyphMetricsToGrid(grid, fontData, ch, forExport = false) {
    const { glyphScale } = getGlyphMetrics(fontData, ch);
    let g = cloneGrid(grid);
    if (forExport) g = scaleGridInk(g, glyphScale);
    return g;
  }

  function prepareGrid(grid, fontData, ch, forExport = false, variant = "regular") {
    const weighted = forExport
      ? applyVariantToGrid(grid, fontData, variant)
      : applyWeightToGrid(grid, getWeight(fontData));
    return applyGlyphMetricsToGrid(weighted, fontData, ch, forExport);
  }

  function drawGlyphInSlot(ctx, grid, fontData, ch, slotX, slotY, cellSize, fontSize, color, variant = "regular") {
    const m = getGlyphMetrics(fontData, ch);
    const weightR = weightRadiusForVariant(fontData, variant);
    let weighted = grid;
    let expandCells = 0;
    if (weightR < 0) {
      weighted = applyVariantToGrid(grid, fontData, variant);
    } else {
      expandCells = weightR;
    }
    const scale = m.glyphScale / 100;
    const inkCell = cellSize * scale;
    const slotW = GRID_W * cellSize;
    const inkW = GRID_W * inkCell;
    const inkH = GRID_H * inkCell;
    const drawX = slotX + (slotW - inkW) / 2 + m.offsetX * cellSize;
    const drawY = slotY + (fontSize - inkH) / 2 + m.offsetY * cellSize;
    const shear = variantShear(variant);
    ctx.fillStyle = color;
    if (shear) {
      ctx.save();
      ctx.transform(1, 0, shear, 1, -drawY * shear, 0);
      drawGridToCtx(ctx, weighted, drawX, drawY, inkCell, expandCells);
      ctx.restore();
    } else {
      drawGridToCtx(ctx, weighted, drawX, drawY, inkCell, expandCells);
    }
  }

  function glyphInkPadding(fontData, ch, cellSize, variant = "regular") {
    const m = glyphDrawMargin(fontData, ch, cellSize, variant);
    return Math.ceil(m.left + m.right + m.top + m.bottom + cellSize);
  }

  function glyphPreviewFrame(fontData, ch, cellSize, fontSize, variant = "regular") {
    const { minX, maxX, minY, maxY } = glyphInkBounds(fontData, ch, cellSize, fontSize, variant);
    const safe = Math.max(0.5, cellSize * 0.35);
    return {
      slotX: safe - minX,
      slotY: safe - minY,
      canvasW: Math.ceil(maxX - minX + safe * 2),
      canvasH: Math.ceil(maxY - minY + safe * 2),
    };
  }

  /** Merge pixel runs into solid rectangles for clean vector outlines. */
  function mergeGridToRects(grid) {
    const spans = [];
    for (let y = 0; y < GRID_H; y++) {
      let x = 0;
      while (x < GRID_W) {
        if (!grid[y][x]) { x++; continue; }
        const x1 = x;
        while (x < GRID_W && grid[y][x]) x++;
        spans.push({ x1, x2: x, y1: y, y2: y + 1 });
      }
    }
    const merged = [];
    for (const span of spans) {
      const prev = merged.find(
        (r) => r.y2 === span.y1 && r.x1 === span.x1 && r.x2 === span.x2
      );
      if (prev) prev.y2 = span.y2;
      else merged.push({ ...span });
    }
    return merged;
  }

  function gridToPath(grid, shear = 0, offsetX = 0, offsetY = 0) {
    const path = new opentype.Path();
    const rects = mergeGridToRects(grid);
    const tx = offsetX * UNIT;
    const ty = -offsetY * UNIT;
    for (const r of rects) {
      const x0 = LEFT_BEARING + r.x1 * UNIT + tx;
      const y0 = (GRID_H - r.y2) * UNIT + ty;
      const x1 = LEFT_BEARING + r.x2 * UNIT + tx;
      const y1 = (GRID_H - r.y1) * UNIT + ty;
      const sx0 = x0 + y0 * shear;
      const sx1 = x1 + y0 * shear;
      const sx2 = x1 + y1 * shear;
      const sx3 = x0 + y1 * shear;
      path.moveTo(sx0, y0);
      path.lineTo(sx1, y0);
      path.lineTo(sx2, y1);
      path.lineTo(sx3, y1);
      path.close();
    }
    return path;
  }

  function glyphName(ch) {
    const names = {
      "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
      "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
      ".": "period", ",": "comma", "!": "exclam", "?": "question", ";": "semicolon",
      ":": "colon", "'": "quotesingle", '"': "quotedbl", "-": "hyphen",
      "(": "parenleft", ")": "parenright", "[": "bracketleft", "]": "bracketright",
      "@": "at", "#": "numbersign", "&": "ampersand", "*": "asterisk",
      "+": "plus", "/": "slash", "=": "equal",
    };
    return names[ch] || ch;
  }

  function buildTTF(fontData, variant) {
    const glyphs = [];
    const { letter, word } = getSpacing(fontData);
    const letterUnits = Math.round(letter * UNIT);
    const wordUnits = Math.round(word * UNIT);
    const advance = BASE_ADVANCE + letterUnits;
    const spaceAdvance = BASE_SPACE_ADVANCE + letterUnits + wordUnits;

    glyphs.push(new opentype.Glyph({
      name: ".notdef",
      unicode: 0,
      advanceWidth: advance,
      path: new opentype.Path(),
    }));

    glyphs.push(new opentype.Glyph({
      name: "space",
      unicode: 32,
      advanceWidth: spaceAdvance,
      path: new opentype.Path(),
    }));

    const variantGrids = fontData.variants[variant];

    for (const ch of CHARS) {
      const m = getGlyphMetrics(fontData, ch);
      const grid = prepareGrid(variantGrids[ch], fontData, ch, true, variant);
      const path = gridToPath(grid, variantShear(variant), m.offsetX, m.offsetY);
      const adjust = Math.round(getGlyphMetrics(fontData, ch).advanceAdjust * UNIT);
      const chAdvance = advance + adjust;
      glyphs.push(new opentype.Glyph({
        name: glyphName(ch),
        unicode: ch.charCodeAt(0),
        advanceWidth: chAdvance,
        path,
      }));
    }

    const label = VARIANT_LABELS[variant];
    const weight = getWeight(fontData);
    const font = new opentype.Font({
      familyName: fontData.name,
      styleName: label,
      unitsPerEm: UNITS_PER_EM,
      ascender: ASCENDER,
      descender: DESCENDER,
      glyphs,
    });
    if (font.tables && font.tables.os2) {
      font.tables.os2.usWeightClass = weight;
    }
    return font;
  }

  function dilateGrid(grid, radius) {
    const out = createEmptyGrid();
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!grid[y][x]) continue;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < GRID_H && nx >= 0 && nx < GRID_W) {
              out[ny][nx] = true;
            }
          }
        }
      }
    }
    return out;
  }

  function gridToBlob(grid, cellSize = 8, fg = "#e8f4f8", bg = "transparent") {
    const canvas = document.createElement("canvas");
    canvas.width = GRID_W * cellSize;
    canvas.height = GRID_H * cellSize;
    const ctx = canvas.getContext("2d");
    if (bg !== "transparent") {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.fillStyle = fg;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (grid[y][x]) {
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }
    return canvas;
  }

  function drawGridToCtx(ctx, grid, offsetX, offsetY, cellSize, expandCells = 0) {
    const gapFill = Math.max(0.75, cellSize * 0.04);
    const expand = Math.max(0, expandCells) * cellSize;
    ctx.beginPath();
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        if (!grid[gy][gx]) continue;
        const px = offsetX + gx * cellSize - expand;
        const py = offsetY + gy * cellSize - expand;
        const size = cellSize + gapFill + expand * 2;
        ctx.rect(px, py, size, size);
      }
    }
    ctx.fill();
  }

  function renderGridPreview(grid, canvas, options = {}) {
    const {
      showGrid = true,
      fg = "#a8c4ff",
      bg = "rgba(10, 14, 24, 0.95)",
      displayScale = 1,
      variant = "regular",
      fontData = null,
      cellSize = fontData ? getEditorCellPx(fontData) : EDITOR_CELL_PX,
    } = options;
    const margins = editorCanvasMargins(fontData, variant, cellSize);
    const padL = margins.left;
    const padR = margins.right;
    const padT = margins.top;
    const padB = margins.bottom;
    const innerW = GRID_W * cellSize;
    const innerH = GRID_H * cellSize;
    const shear = variantShear(variant);
    canvas.width = innerW + padL + padR;
    canvas.height = innerH + padT + padB;
    canvas.style.width = `${canvas.width * displayScale}px`;
    canvas.style.height = `${canvas.height * displayScale}px`;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (showGrid) {
      ctx.save();
      applyEditorDrawTransform(ctx, padT, variant);
      ctx.strokeStyle = "rgba(168, 196, 255, 0.1)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= GRID_W; x++) {
        ctx.beginPath();
        ctx.moveTo(padL + x * cellSize + 0.5, padT);
        ctx.lineTo(padL + x * cellSize + 0.5, padT + innerH);
        ctx.stroke();
      }
      for (let y = 0; y <= GRID_H; y++) {
        ctx.beginPath();
        ctx.moveTo(padL, padT + y * cellSize + 0.5);
        ctx.lineTo(padL + innerW, padT + y * cellSize + 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    let display = grid;
    let expandCells = 0;
    if (fontData) {
      const weightR = weightRadiusForVariant(fontData, variant);
      if (weightR < 0) {
        display = applyVariantToGrid(grid, fontData, variant);
      } else {
        expandCells = weightR;
      }
    }
    ctx.fillStyle = fg;
    ctx.save();
    applyEditorDrawTransform(ctx, padT, variant);
    drawGridToCtx(ctx, display, padL, padT, cellSize, expandCells);
    ctx.restore();
  }

  function renderGlyphToCanvas(grid, canvas, height, color = "#eef1f7", pad = 1, fontData = null, ch = null, variant = "regular") {
    const cellSize = height / GRID_H;
    const ctx = canvas.getContext("2d");
    if (fontData && ch) {
      const frame = glyphPreviewFrame(fontData, ch, cellSize, height, variant);
      canvas.width = frame.canvasW + pad * 2;
      canvas.height = frame.canvasH + pad * 2;
      setCanvasDisplaySize(canvas);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawGlyphInSlot(
        ctx, grid, fontData, ch,
        frame.slotX + pad, frame.slotY + pad,
        cellSize, height, color, variant
      );
    } else {
      const glyphW = GRID_W * cellSize;
      canvas.width = Math.ceil(glyphW + pad * 2);
      canvas.height = Math.ceil(height + pad * 2);
      setCanvasDisplaySize(canvas);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      drawGridToCtx(ctx, grid, pad, pad, cellSize);
    }
    return canvas;
  }

  function renderGlyphInBox(grid, canvas, boxW, boxH, options = {}) {
    const {
      fontData = null,
      ch = null,
      variant = "regular",
      color = "#eef1f7",
      fontSize = Math.round(boxH * 0.88),
      bg = null,
    } = options;
    const tmp = document.createElement("canvas");
    renderGlyphToCanvas(grid, tmp, fontSize, color, 0, fontData, ch, variant);
    canvas.width = boxW;
    canvas.height = boxH;
    if (canvas.style) {
      canvas.style.width = `${boxW}px`;
      canvas.style.height = `${boxH}px`;
    }
    const ctx = canvas.getContext("2d");
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, boxW, boxH);
    } else {
      ctx.clearRect(0, 0, boxW, boxH);
    }
    const scale = Math.min(boxW / tmp.width, boxH / tmp.height, 1);
    const dw = Math.max(1, Math.round(tmp.width * scale));
    const dh = Math.max(1, Math.round(tmp.height * scale));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, (boxW - dw) / 2, (boxH - dh) / 2, dw, dh);
    return canvas;
  }

  function measureTextWidth(text, fontData, fontSize) {
    const cellSize = fontSize / GRID_H;
    const charWidth = GRID_W * cellSize;
    const { letter, word } = getSpacing(fontData);
    const letterGap = letter * cellSize;
    const wordGap = word * cellSize;
    let width = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === " ") {
        width += charWidth + letterGap + wordGap;
        continue;
      }
      if (!resolveTextChar(fontData, "regular", ch)) continue;
      const adjust = getGlyphMetrics(fontData, ch).advanceAdjust * cellSize;
      width += charWidth + letterGap + adjust;
    }
    if (text.length > 0) width -= letterGap;
    return Math.max(width, charWidth);
  }

  function layoutTextGlyphs(text, fontData, fontSize, variant = "regular") {
    const cellSize = fontSize / GRID_H;
    const charWidth = GRID_W * cellSize;
    const { letter, word } = getSpacing(fontData);
    const letterGap = letter * cellSize;
    const wordGap = word * cellSize;
    const layout = getLayout(fontData);
    const lineShiftX = layout.lineShiftX * cellSize;
    const lineShiftY = layout.lineShiftY * cellSize;
    const glyphs = [];
    let x = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === " ") {
        const slotW = charWidth + letterGap + wordGap;
        glyphs.push({ ch, x, width: slotW, isSpace: true });
        x += slotW;
        continue;
      }
      if (!resolveTextChar(fontData, variant, ch)) continue;
      const adjust = getGlyphMetrics(fontData, ch).advanceAdjust * cellSize;
      const slotW = charWidth + letterGap + adjust;
      glyphs.push({ ch, x, width: slotW, isSpace: false, index: i });
      x += slotW;
    }
    const textWidth = Math.max(x > 0 ? x - letterGap : 0, charWidth);
    let marginTop = 0;
    let marginBottom = 0;
    let marginLeft = 0;
    let marginRight = 0;
    for (const g of glyphs) {
      if (g.isSpace) continue;
      const m = glyphDrawMargin(fontData, g.ch, cellSize, variant);
      marginTop = Math.max(marginTop, m.top);
      marginBottom = Math.max(marginBottom, m.bottom);
      marginLeft = Math.max(marginLeft, m.left);
      marginRight = Math.max(marginRight, m.right);
    }
    const bleed = cellSize * 2;
    const padT = marginTop + bleed + Math.max(0, -lineShiftY);
    const padB = marginBottom + bleed + Math.max(0, lineShiftY);
    const padL = marginLeft + bleed + Math.max(0, -lineShiftX);
    const padR = marginRight + bleed + Math.max(0, lineShiftX);
    const originX = padL;
    const originY = padT;
    return {
      glyphs,
      cellSize,
      charWidth,
      fontSize,
      textWidth,
      variant,
      padT,
      padB,
      padL,
      padR,
      lineShiftX,
      lineShiftY,
      originX,
      originY,
      canvasWidth: Math.ceil(textWidth + padL + padR),
      canvasHeight: Math.ceil(fontSize + padT + padB),
    };
  }

  function setCanvasDisplaySize(canvas) {
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
  }

  function renderTextToCanvas(text, fontData, variant, canvas, fontSize, color = "#eef1f7", options = {}) {
    const {
      showLineGuide = false,
      selectedChar = null,
      hitRegions = null,
    } = options;
    const ctx = canvas.getContext("2d");
    const laid = layoutTextGlyphs(text, fontData, fontSize, variant);
    canvas.width = laid.canvasWidth;
    canvas.height = laid.canvasHeight;
    setCanvasDisplaySize(canvas);
    ctx.clearRect(0, 0, laid.canvasWidth, laid.canvasHeight);

    if (showLineGuide) {
      ctx.fillStyle = "rgba(10, 14, 24, 0.95)";
      ctx.fillRect(0, 0, laid.canvasWidth, laid.canvasHeight);
      const lineX = laid.originX + laid.lineShiftX;
      const lineY = laid.originY + laid.lineShiftY;
      ctx.strokeStyle = "rgba(139, 156, 255, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(lineX, lineY, laid.textWidth, laid.fontSize);
      const baselineY = lineY + laid.fontSize * 0.88;
      ctx.strokeStyle = "rgba(232, 168, 124, 0.65)";
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(lineX, baselineY);
      ctx.lineTo(lineX + laid.textWidth, baselineY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (hitRegions) hitRegions.length = 0;

    for (const slot of laid.glyphs) {
      const slotX = laid.originX + slot.x + laid.lineShiftX;
      const slotY = laid.originY + laid.lineShiftY;
      if (showLineGuide && !slot.isSpace) {
        const isSelected = selectedChar === slot.ch;
        ctx.fillStyle = isSelected ? "rgba(139, 156, 255, 0.16)" : "rgba(139, 156, 255, 0.05)";
        ctx.fillRect(slotX, slotY, slot.width - laid.cellSize * 0.15, laid.fontSize);
        ctx.strokeStyle = isSelected ? "rgba(139, 156, 255, 0.8)" : "rgba(139, 156, 255, 0.22)";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeRect(slotX, slotY, slot.width - laid.cellSize * 0.15, laid.fontSize);
        if (hitRegions) {
          hitRegions.push({
            ch: slot.ch,
            x: slotX,
            y: slotY,
            w: slot.width - laid.cellSize * 0.15,
            h: laid.fontSize,
          });
        }
      }
      if (slot.isSpace) continue;
      const grid = fontData.variants[variant][slot.ch];
      if (!grid) continue;
      drawGlyphInSlot(ctx, grid, fontData, slot.ch, slotX, slotY, laid.cellSize, laid.fontSize, color, variant);
    }
    return laid;
  }

  function packGrid(grid) {
    const byteLen = (GRID_W * GRID_H + 7) >> 3;
    const bytes = new Uint8Array(byteLen);
    let bit = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (grid[y][x]) bytes[bit >> 3] |= 1 << (bit & 7);
        bit++;
      }
    }
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function unpackGrid(b64) {
    const grid = createEmptyGrid();
    if (!b64) return grid;
    const bin = atob(b64);
    let bit = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const byte = bin.charCodeAt(bit >> 3);
        grid[y][x] = !!(byte & (1 << (bit & 7)));
        bit++;
      }
    }
    return grid;
  }

  function serializeFont(fontData) {
    const variants = {};
    for (const v of VARIANTS) {
      variants[v] = {};
      for (const ch of CHARS) {
        variants[v][ch] = packGrid(fontData.variants[v][ch]);
      }
    }
    ensureLanguages(fontData);
    return {
      version: 1,
      name: fontData.name,
      variants,
      spacing: getSpacing(fontData),
      weight: getWeight(fontData),
      layout: getLayout(fontData),
      glyphMetrics: fontData.glyphMetrics || {},
      resolution: fontData.resolution || defaultResolution(),
      editorResolution: fontData.editorResolution || defaultEditorResolution(),
      activeLanguageId: fontData.activeLanguageId,
      languages: fontData.languages,
    };
  }

  function deserializeFont(raw) {
    const fontData = createEmptyFont(raw?.name || "Untitled");
    if (raw?.variants) {
      for (const v of VARIANTS) {
        if (!raw.variants[v]) continue;
        for (const ch of CHARS) {
          if (raw.variants[v][ch] != null) {
            fontData.variants[v][ch] = unpackGrid(raw.variants[v][ch]);
          }
        }
      }
    }
    if (raw?.spacing) fontData.spacing = { ...raw.spacing };
    if (raw?.weight != null) fontData.weight = raw.weight;
    if (raw?.layout) fontData.layout = { ...raw.layout };
    if (raw?.glyphMetrics) fontData.glyphMetrics = JSON.parse(JSON.stringify(raw.glyphMetrics));
    if (raw?.resolution) fontData.resolution = raw.resolution;
    if (raw?.editorResolution) fontData.editorResolution = raw.editorResolution;
    if (raw?.languages) fontData.languages = JSON.parse(JSON.stringify(raw.languages));
    if (raw?.activeLanguageId) fontData.activeLanguageId = raw.activeLanguageId;
    validateFontData(fontData);
    ensureAllGlyphs(fontData);
    return fontData;
  }

  async function exportZip(fontData) {
    const zip = new JSZip();
    const folder = zip.folder(fontData.name.replace(/\s+/g, "-"));

    for (const variant of VARIANTS) {
      const font = buildTTF(fontData, variant);
      const buffer = font.toArrayBuffer();
      const fname = `${fontData.name.replace(/\s+/g, "")}-${VARIANT_LABELS[variant].replace(/\s+/g, "")}.ttf`;
      folder.file(fname, buffer);
    }

    const pngBlob = await generateChartPNG(fontData);
    folder.file("glyph-reference.png", pngBlob);

    ensureLanguages(fontData);
    folder.file("languages.json", JSON.stringify({
      activeLanguageId: fontData.activeLanguageId,
      languages: fontData.languages,
    }, null, 2));

    folder.file("font-settings.json", JSON.stringify({
      spacing: getSpacing(fontData),
      layout: getLayout(fontData),
      glyphMetrics: fontData.glyphMetrics || {},
      weight: getWeight(fontData),
    }, null, 2));

    return zip.generateAsync({ type: "blob" });
  }

  async function generateChartPNG(fontData) {
    const sections = [
      { title: "Uppercase A–Z", chars: LETTERS_UPPER },
      { title: "Lowercase a–z", chars: LETTERS_LOWER },
      { title: "Numbers", chars: DIGITS, labels: DIGITS.map((ch) => NUMBER_LABELS[Number(ch)] || ch) },
      { title: "Special characters", chars: SPECIAL_CHARS },
    ];
    const cols = 13;
    const cellW = 110;
    const cellH = 100;
    const headerH = 50;
    const sectionGap = 30;
    let imgH = 120;
    for (const variant of VARIANTS) {
      imgH += 28;
      for (const section of sections) {
        const rows = Math.ceil(section.chars.length / cols);
        imgH += headerH + rows * cellH + sectionGap;
      }
      imgH += sectionGap;
    }
    const imgW = cols * cellW + 40;

    const canvas = document.createElement("canvas");
    canvas.width = imgW;
    canvas.height = imgH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, imgW, imgH);

    ctx.fillStyle = "#7ec8e3";
    ctx.font = "bold 22px Outfit, sans-serif";
    ctx.fillText(`${fontData.name} — Glyph Reference Chart`, 20, 35);
    ctx.fillStyle = "#5a7a8a";
    ctx.font = "14px Outfit, sans-serif";
    ctx.fillText("0 key = ten  |  1-9 = one through nine", 20, 58);

    let y = 90;
    for (const variant of VARIANTS) {
      ctx.fillStyle = "#7ec8e3";
      ctx.font = "14px Outfit, sans-serif";
      ctx.fillText(VARIANT_LABELS[variant], 20, y);
      y += 28;

      for (const section of sections) {
        ctx.fillStyle = "#8b9cff";
        ctx.font = "bold 13px DM Sans, sans-serif";
        ctx.fillText(section.title, 20, y + 18);
        y += headerH;

        for (let i = 0; i < section.chars.length; i++) {
          const ch = section.chars[i];
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = 20 + col * cellW;
          const cy = y + row * cellH;

          ctx.fillStyle = "#111820";
          ctx.strokeStyle = "#1e3a4f";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(x, cy, cellW - 8, cellH - 8, 6);
          ctx.fill();
          ctx.stroke();

          const tmp = document.createElement("canvas");
          const grid = fontData.variants[variant][ch];
          if (grid) {
            renderGlyphToCanvas(grid, tmp, 52, "#eef1f7", 1, fontData, ch, variant);
            const boxW = cellW - 8;
            const boxH = cellH - 28;
            const scale = Math.min(boxW / tmp.width, boxH / tmp.height, 1);
            const dw = Math.max(1, Math.round(tmp.width * scale));
            const dh = Math.max(1, Math.round(tmp.height * scale));
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tmp, x + (boxW - dw) / 2, cy + (boxH - dh) / 2, dw, dh);
          }

          const label = section.labels ? section.labels[i] : ch;
          ctx.fillStyle = "#7ec8e3";
          ctx.font = "bold 12px DM Sans, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(label, x + (cellW - 8) / 2, cy + cellH - 22);
          ctx.textAlign = "left";
        }
        const rows = Math.ceil(section.chars.length / cols);
        y += rows * cellH + sectionGap;
      }
      y += sectionGap;
    }

    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  return {
    GRID_W,
    GRID_H,
    CHARS,
    LETTERS_UPPER,
    LETTERS_LOWER,
    DIGITS,
    SPECIAL_CHARS,
    VARIANTS,
    VARIANT_LABELS,
    NUMBER_LABELS,
    variantFromToggles,
    createEmptyGrid,
    cloneGrid,
    createEmptyFont,
    defaultSpacing,
    defaultWeight,
    defaultLayout,
    defaultGlyphMetrics,
    ensureGlyphMetrics,
    ensureAllGlyphs,
    getGlyphMetrics,
    setGlyphMetrics,
    EDITOR_CELL_PX,
    EDITOR_RESOLUTION_PRESETS,
    defaultEditorResolution,
    getEditorResolutionPreset,
    getEditorCellPx,
    RESOLUTION_PRESETS,
    defaultResolution,
    getResolutionPreset,
    editorVariantPadding,
    editorCanvasMargins,
    editorCanvasPixelSize,
    editorCanvasPointToCell,
    defaultSyntax,
    defaultLanguage,
    latinLanguage,
    ensureLatinDefaults,
    ensureLanguages,
    getActiveLanguage,
    applyLanguage,
    translateForFont,
    glyphDrawMargin,
    getSpacing,
    getWeight,
    getLayout,
    prepareGrid,
    layoutTextGlyphs,
    validateFontData,
    gridHasInk,
    getGridBounds,
    centerGrid,
    cleanupGrid,
    variantShear,
    variantExportWeight,
    applyVariantToGrid,
    ENGLISH_BASE_ID,
    createEnglishBaseFont,
    isEnglishBaseFont,
    englishReferenceGrid,
    importFamilyFromManifest,
    importUploadedFont,
    renderGridPreview,
    renderGlyphToCanvas,
    renderGlyphInBox,
    renderTextToCanvas,
    measureTextWidth,
    exportZip,
    serializeFont,
    deserializeFont,
    generateChartPNG,
    buildTTF,
  };
})();

if (typeof module !== "undefined") module.exports = FontEngine;
