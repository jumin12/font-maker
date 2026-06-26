/**
 * Font Maker — application UI logic.
 */
(() => {
  const $ = (id) => document.getElementById(id);

  let families = [];
  let fontData = null;
  let currentFamilyId = null;
  let selectedChar = "A";
  let editorGrid = FontEngine.createEmptyGrid();
  let tool = "pen";
  let isDrawing = false;
  let lineHitRegions = [];
  let lineDrag = null;
  let lineDragMoved = false;
  let linkVariants = true;

  const LOCAL_DB_NAME = "fontMaker";
  const LOCAL_STORE = "savedFonts";
  const IDB_TIMEOUT_MS = 4000;
  const FETCH_TIMEOUT_MS = 12000;
  const FONT_FACE_TIMEOUT_MS = 6000;
  let catalogReady = false;

  const SAMPLES = [
    "The Quick Brown Fox",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "abcdefghijklmnopqrstuvwxyz",
    "1234567890",
    ". , ! ? ; : ' \" - ( ) [ ] @ # & * + / =",
    "Hello, world! How are you?",
    "Eldaraure",
  ];

  function showWorkspace() {
    $("home").hidden = true;
    $("main").hidden = false;
    document.querySelector(".app-shell").classList.add("workspace");
    updateRotatePrompt();
    requestAnimationFrame(() => {
      fitEditorToView();
    });
  }

  function showHome() {
    if (fontData) commitEditorGlyph();
    $("home").hidden = false;
    $("main").hidden = true;
    document.querySelector(".app-shell").classList.remove("workspace");
    updateRotatePrompt();
    if (catalogReady) queueSavedFontsRefresh();
  }

  function resolveAssetUrl(path) {
    if (!path) return path;
    if (path.startsWith("http:") || path.startsWith("https:") || path.startsWith("blob:")) return path;
    return new URL(path, document.baseURI).href;
  }

  async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { signal: ctrl.signal, cache: "no-cache" });
    } finally {
      clearTimeout(timer);
    }
  }

  function withTimeout(promise, ms, label = "operation") {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  }

  function readEmbeddedManifest() {
    const el = document.getElementById("embeddedManifest");
    if (!el?.textContent?.trim()) return null;
    try {
      return JSON.parse(el.textContent);
    } catch {
      return null;
    }
  }

  async function fetchManifestData(url) {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith("<")) return null;
    try {
      const data = JSON.parse(trimmed);
      if (!Array.isArray(data?.families)) return null;
      return data;
    } catch {
      return null;
    }
  }

  async function loadFontCatalog() {
    const embedded = readEmbeddedManifest();
    if (embedded?.families?.length) return embedded;

    const candidates = [
      resolveAssetUrl("manifest.json"),
      new URL("manifest.json", location.href).href,
    ];
    for (const url of [...new Set(candidates)]) {
      try {
        const data = await fetchManifestData(url);
        if (data) return data;
      } catch {
        /* try next */
      }
    }
    throw new Error("Font catalog unavailable");
  }

  function buildFamiliesList(catalog) {
    return [
      {
        id: FontEngine.ENGLISH_BASE_ID,
        name: "English Base",
        displayName: "English Base",
        builtin: FontEngine.ENGLISH_BASE_ID,
        variants: {},
      },
      ...catalog.filter((f) => f.id !== FontEngine.ENGLISH_BASE_ID),
    ];
  }

  function showHomeCatalog() {
    catalogReady = true;
    document.documentElement.classList.add("catalog-ready");
    const loading = $("homeLoading");
    const content = $("homeContent");
    const empty = $("homeEmpty");
    if (loading) loading.hidden = true;
    if (empty) empty.hidden = true;
    if (content) content.hidden = false;
  }

  function showHomeCatalogError(message) {
    if (catalogReady) return;
    const loading = $("homeLoading");
    if (!loading) return;
    loading.hidden = false;
    loading.innerHTML = `<p style="color:#e88">${message}</p>
      <p style="margin-top:0.75rem;font-size:0.85rem;color:var(--text-muted)">
        Check your connection or try refreshing the page.</p>`;
  }

  function bootCatalogFromData(data) {
    const catalog = data?.families;
    if (!Array.isArray(catalog) || !catalog.length) return false;
    families = buildFamiliesList(catalog);
    buildFontGallery();
    showHomeCatalog();
    queueSavedFontsRefresh();
    return true;
  }

  function bootCatalogSync() {
    if (catalogReady) return true;
    return bootCatalogFromData(readEmbeddedManifest());
  }

  function queueSavedFontsRefresh() {
    void withTimeout(refreshSavedFontsSection(), 8000, "saved fonts").catch(() => {});
  }

  function isMobileEditorDevice() {
    return window.matchMedia("(max-width: 900px) and (pointer: coarse)").matches
      || window.matchMedia("(max-width: 900px) and (hover: none)").matches;
  }

  function isPortraitViewport() {
    return window.matchMedia("(orientation: portrait)").matches;
  }

  function updateRotatePrompt() {
    const el = $("rotatePrompt");
    if (!el) return;
    const inWorkspace = document.querySelector(".app-shell.workspace");
    el.hidden = !(inWorkspace && isMobileEditorDevice() && isPortraitViewport());
  }

  function setupRotatePrompt() {
    $("rotateBackBtn")?.addEventListener("click", showHome);
    const onLayoutChange = () => {
      updateRotatePrompt();
      const drawPanel = document.querySelector('[data-tab-panel="draw"]');
      if (drawPanel?.classList.contains("active")) fitEditorToView();
    };
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("orientationchange", () => setTimeout(onLayoutChange, 150));
    updateRotatePrompt();
  }

  function openLocalDb() {
    return Promise.race([
      new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          reject(new Error("IndexedDB unavailable"));
          return;
        }
        const req = indexedDB.open(LOCAL_DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(LOCAL_STORE, { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error("IndexedDB blocked"));
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("IndexedDB timeout")), IDB_TIMEOUT_MS);
      }),
    ]);
  }

  async function listSavedFonts() {
    try {
      const db = await openLocalDb();
      return await withTimeout(new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_STORE, "readonly");
        const req = tx.objectStore(LOCAL_STORE).getAll();
        req.onsuccess = () => {
          resolve((req.result || []).sort((a, b) => b.savedAt - a.savedAt));
        };
        req.onerror = () => reject(req.error);
      }), IDB_TIMEOUT_MS, "IndexedDB read");
    } catch {
      return [];
    }
  }

  async function putSavedFont(entry) {
    const db = await openLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_STORE, "readwrite");
      tx.objectStore(LOCAL_STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteSavedFont(id) {
    const db = await openLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_STORE, "readwrite");
      tx.objectStore(LOCAL_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function formatSavedDate(ts) {
    try {
      return new Date(ts).toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric",
      });
    } catch {
      return "";
    }
  }

  async function refreshSavedFontsSection() {
    const title = $("savedFontsTitle");
    const grid = $("savedFontGallery");
    if (!title || !grid) return;
    let saved = [];
    try {
      saved = await listSavedFonts();
    } catch {
      title.hidden = true;
      grid.innerHTML = "";
      return;
    }
    title.hidden = saved.length === 0;
    grid.innerHTML = saved.map((entry) => `
      <div class="font-card font-card-saved" data-saved-id="${entry.id}" role="button" tabindex="0">
        <button type="button" class="font-card-delete" data-delete-id="${entry.id}" title="Delete saved font" aria-label="Delete">×</button>
        <span class="font-card-badge font-card-badge-saved">Saved</span>
        <span class="font-card-preview font-card-preview-saved" data-saved-preview-id="${entry.id}">
          <canvas class="font-card-preview-canvas" aria-hidden="true"></canvas>
        </span>
        <span class="font-card-name">${entry.displayName || entry.name}</span>
        <span class="font-card-date">${formatSavedDate(entry.savedAt)}</span>
      </div>
    `).join("");

    grid.querySelectorAll(".font-card-saved[data-saved-id]").forEach((card) => {
      const open = () => loadSavedFont(card.dataset.savedId);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });
    grid.querySelectorAll(".font-card-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeSavedFont(btn.dataset.deleteId);
      });
    });

    hydrateSavedFontPreviews(saved);
  }

  function hydrateSavedFontPreviews(saved) {
    const previewSize = 32;
    const sample = "Aa Bb 123";
    const renderOne = (entry) => {
      const wrap = document.querySelector(`[data-saved-preview-id="${entry.id}"]`);
      const canvas = wrap?.querySelector(".font-card-preview-canvas");
      if (!canvas || !entry.payload) return;
      try {
        const data = FontEngine.deserializeFont(entry.payload);
        FontEngine.renderTextToCanvas(sample, data, "regular", canvas, previewSize, "#a8c4ff");
        const maxW = 220;
        const scale = Math.min(1, maxW / canvas.width);
        canvas.style.width = `${Math.round(canvas.width * scale)}px`;
        canvas.style.height = `${Math.round(canvas.height * scale)}px`;
      } catch {
        wrap.textContent = sample;
        wrap.classList.remove("font-card-preview-saved");
      }
    };
    if (typeof requestIdleCallback === "function") {
      saved.forEach((entry, i) => {
        requestIdleCallback(() => renderOne(entry), { timeout: 2000 + i * 100 });
      });
    } else {
      saved.forEach((entry, i) => {
        setTimeout(() => renderOne(entry), i * 50);
      });
    }
  }

  async function loadSavedFont(id) {
    try {
      const db = await openLocalDb();
      const entry = await new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_STORE, "readonly");
        const req = tx.objectStore(LOCAL_STORE).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!entry?.payload) throw new Error("Saved font not found");
      fontData = FontEngine.deserializeFont(entry.payload);
      currentFamilyId = entry.id;
      initWorkspaceFromFont({ displayName: entry.displayName || entry.name, name: entry.name });
    } catch (err) {
      alert("Could not load saved font: " + err.message);
    }
  }

  async function removeSavedFont(id) {
    if (!confirm("Delete this saved font from your browser?")) return;
    try {
      await deleteSavedFont(id);
      if (currentFamilyId === id) currentFamilyId = null;
      await refreshSavedFontsSection();
    } catch (err) {
      alert("Could not delete: " + err.message);
    }
  }

  async function saveCurrentFont() {
    if (!fontData) return;
    commitEditorGlyph();
    const defaultName = fontData.name || "My Font";
    const raw = prompt("Save font as", defaultName);
    if (raw === null) return;
    const name = raw.trim() || defaultName;
    fontData.name = name;
    const existingId = currentFamilyId?.startsWith("saved-") ? currentFamilyId : null;
    const id = existingId || `saved-${Date.now().toString(36)}`;
    const entry = {
      id,
      name,
      displayName: name,
      savedAt: Date.now(),
      payload: FontEngine.serializeFont(fontData),
    };
    try {
      await putSavedFont(entry);
      currentFamilyId = id;
      setToolbarFontLabel({ displayName: name, name });
      await refreshSavedFontsSection();
    } catch (err) {
      alert("Could not save font: " + err.message);
    }
  }

  function initWorkspaceFromFont(familyLabel) {
    linkVariants = true;
    if ($("linkVariants")) $("linkVariants").checked = true;
    $("toggleBold").checked = false;
    $("toggleItalic").checked = false;
    $("variantBadge").textContent = "Regular";
    if (familyLabel) setToolbarFontLabel(familyLabel);
    selectedChar = "A";
    FontEngine.ensureGlyphMetrics(fontData);
    FontEngine.ensureAllGlyphs(fontData);
    syncSpacingUI();
    syncWeightUI();
    syncLayoutUI();
    syncResolutionUI();
    syncEditorResolutionUI();
    syncLanguageUI();
    buildCharPicker();
    syncEditorFromFont();
    refreshAllViews();
    syncVariantUI();
    showWorkspace();
  }

  function createBlankFont() {
    const raw = prompt("Name your font", "My Font");
    if (raw === null) return;
    const name = raw.trim() || "My Font";
    fontData = FontEngine.createEmptyFont(name);
    currentFamilyId = `blank-${Date.now().toString(36)}`;
    initWorkspaceFromFont({ displayName: name, name });
  }

  function fitEditorToView() {
    const wrap = document.querySelector(".pixel-wrap");
    if (!wrap || wrap.clientWidth < 40 || wrap.clientHeight < 40) return;
    const cell = fontData ? FontEngine.getEditorCellPx(fontData) : FontEngine.EDITOR_CELL_PX;
    const variant = currentVariant();
    const { width, height } = FontEngine.editorCanvasPixelSize(fontData, variant, cell);
    const scale = Math.min(
      (wrap.clientWidth - 4) / width,
      (wrap.clientHeight - 4) / height
    ) * 0.995;
    const pct = Math.round(Math.max(40, Math.min(400, scale * 100)));
    $("pixelZoom").value = pct;
    $("pixelZoomVal").textContent = pct + "%";
    drawEditor();
  }

  function syncVariantUI() {
    const v = currentVariant();
    $("variantBadge").textContent = FontEngine.VARIANT_LABELS[v];
    document.querySelectorAll("[data-variant-btn]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.variantBtn === v);
    });
  }

  function currentVariant() {
    return FontEngine.variantFromToggles($("toggleBold").checked, $("toggleItalic").checked);
  }

  function editorDisplayScale() {
    return parseInt($("pixelZoom").value, 10) / 100;
  }

  function updateEditorHint() {
    const hint = $("editorHint");
    if (!hint) return;
    const label = $("editCharLabel")?.textContent || selectedChar;
    const variant = FontEngine.VARIANT_LABELS[currentVariant()];
    const mode = linkVariants
      ? "linked across all styles"
      : `editing <strong>${variant}</strong> only`;
    hint.innerHTML = `Editing <strong id="editCharLabel">${label}</strong> · ${mode}`;
  }

  function editorSourceVariant() {
    return linkVariants ? "regular" : currentVariant();
  }

  function syncEditorFromFont() {
    if (!fontData) return;
    editorGrid = FontEngine.cloneGrid(fontData.variants[editorSourceVariant()][selectedChar]);
    drawEditor();
    syncGlyphMetricsUI();
    updateEditorHint();
  }

  function commitEditorGlyph() {
    if (!fontData) return;
    const cleaned = FontEngine.cleanupGrid(editorGrid);
    if (linkVariants) {
      for (const variant of FontEngine.VARIANTS) {
        fontData.variants[variant][selectedChar] = FontEngine.cloneGrid(cleaned);
      }
    } else {
      fontData.variants[currentVariant()][selectedChar] = FontEngine.cloneGrid(cleaned);
    }
  }

  function syncGlyphEdits() {
    commitEditorGlyph();
    updatePreview();
    updateChart();
    updateLinePreview();
    paintCharPickerGlyphs();
  }

  function drawEditor() {
    const canvas = $("pixelCanvas");
    FontEngine.renderGridPreview(editorGrid, canvas, {
      showGrid: true,
      fg: "#a8c4ff",
      displayScale: editorDisplayScale(),
      variant: currentVariant(),
      fontData,
      cellSize: fontData ? FontEngine.getEditorCellPx(fontData) : FontEngine.EDITOR_CELL_PX,
    });
  }

  function syncWeightUI() {
    if (!fontData) return;
    if (fontData.weight == null) fontData.weight = FontEngine.defaultWeight();
    $("weightSlider").value = fontData.weight;
    $("weightNum").value = fontData.weight;
    $("weightVal").textContent = fontData.weight;
  }

  function updateWeightFromUI() {
    if (!fontData) return;
    if (document.activeElement === $("weightNum")) {
      $("weightSlider").value = $("weightNum").value;
    }
    const raw = parseInt($("weightSlider").value, 10);
    const clamped = Math.max(100, Math.min(900, Number.isNaN(raw) ? 400 : raw));
    fontData.weight = clamped;
    $("weightSlider").value = clamped;
    $("weightNum").value = clamped;
    $("weightVal").textContent = clamped;
    refreshAllViews();
  }

  function updateWeightFromNumber() {
    if (!fontData) return;
    const num = parseInt($("weightNum").value, 10);
    if (Number.isNaN(num)) return;
    const clamped = Math.max(100, Math.min(900, num));
    $("weightSlider").value = clamped;
    $("weightNum").value = clamped;
    fontData.weight = clamped;
    $("weightVal").textContent = clamped;
    refreshAllViews();
  }

  function ensureSpacing() {
    if (!fontData.spacing) fontData.spacing = FontEngine.defaultSpacing();
  }

  function ensureLayout() {
    if (!fontData.layout) fontData.layout = FontEngine.defaultLayout();
  }

  function syncGlyphMetricsUI() {
    if (!fontData) return;
    FontEngine.ensureGlyphMetrics(fontData);
    const m = FontEngine.getGlyphMetrics(fontData, selectedChar);
    const numLabel = selectedChar >= "0" && selectedChar <= "9"
      ? FontEngine.NUMBER_LABELS[Number(selectedChar)] : null;
    $("metricsCharLabel").textContent = numLabel ? `${selectedChar} (${numLabel})` : selectedChar;
    $("glyphScale").value = m.glyphScale;
    $("glyphScaleVal").textContent = `${m.glyphScale}%`;
    $("offsetX").value = m.offsetX;
    $("offsetY").value = m.offsetY;
    $("advanceAdjust").value = m.advanceAdjust;
    $("offsetXVal").textContent = m.offsetX;
    $("offsetYVal").textContent = m.offsetY;
    $("advanceAdjustVal").textContent = m.advanceAdjust;
    $("offsetXNum").value = m.offsetX;
    $("offsetYNum").value = m.offsetY;
    $("advanceAdjustNum").value = m.advanceAdjust;
  }

  function syncLayoutUI() {
    if (!fontData) return;
    ensureSpacing();
    ensureLayout();
    const l = fontData.layout;
    $("lineShiftX").value = l.lineShiftX;
    $("lineShiftY").value = l.lineShiftY;
    $("lineShiftXVal").textContent = l.lineShiftX;
    $("lineShiftYVal").textContent = l.lineShiftY;
    $("letterSpacingNum").value = fontData.spacing.letter;
    $("wordSpacingNum").value = fontData.spacing.word;
    syncGlyphMetricsUI();
  }

  function updateGlyphMetricsFromUI() {
    if (!fontData) return;
    FontEngine.setGlyphMetrics(fontData, selectedChar, {
      glyphScale: parseInt($("glyphScale").value, 10),
      offsetX: parseInt($("offsetX").value, 10),
      offsetY: parseInt($("offsetY").value, 10),
      advanceAdjust: parseInt($("advanceAdjust").value, 10),
    });
    $("glyphScaleVal").textContent = `${FontEngine.getGlyphMetrics(fontData, selectedChar).glyphScale}%`;
    $("offsetXVal").textContent = FontEngine.getGlyphMetrics(fontData, selectedChar).offsetX;
    $("offsetYVal").textContent = FontEngine.getGlyphMetrics(fontData, selectedChar).offsetY;
    $("advanceAdjustVal").textContent = FontEngine.getGlyphMetrics(fontData, selectedChar).advanceAdjust;
    $("offsetXNum").value = FontEngine.getGlyphMetrics(fontData, selectedChar).offsetX;
    $("offsetYNum").value = FontEngine.getGlyphMetrics(fontData, selectedChar).offsetY;
    $("advanceAdjustNum").value = FontEngine.getGlyphMetrics(fontData, selectedChar).advanceAdjust;
    refreshAllViews();
  }

  function updateLayoutFromUI() {
    if (!fontData) return;
    ensureLayout();
    fontData.layout.lineShiftX = parseInt($("lineShiftX").value, 10);
    fontData.layout.lineShiftY = parseInt($("lineShiftY").value, 10);
    $("lineShiftXVal").textContent = fontData.layout.lineShiftX;
    $("lineShiftYVal").textContent = fontData.layout.lineShiftY;
    refreshAllViews();
  }

  function updateSpacingFromUI() {
    if (!fontData) return;
    ensureSpacing();
    const letterEl = $("letterSpacing");
    const wordEl = $("wordSpacing");
    if (document.activeElement === $("letterSpacingNum")) {
      letterEl.value = $("letterSpacingNum").value;
    } else if (document.activeElement === $("wordSpacingNum")) {
      wordEl.value = $("wordSpacingNum").value;
    }
    fontData.spacing.letter = parseInt(letterEl.value, 10);
    fontData.spacing.word = parseInt(wordEl.value, 10);
    $("letterSpacingVal").textContent = fontData.spacing.letter;
    $("wordSpacingVal").textContent = fontData.spacing.word;
    $("letterSpacingNum").value = fontData.spacing.letter;
    $("wordSpacingNum").value = fontData.spacing.word;
    refreshAllViews();
  }

  function updateSpacingFromNumber(which) {
    if (!fontData) return;
    ensureSpacing();
    const num = parseInt($(which === "letter" ? "letterSpacingNum" : "wordSpacingNum").value, 10);
    if (Number.isNaN(num)) return;
    const clamped = Math.max(
      which === "letter" ? -12 : -8,
      Math.min(num, which === "letter" ? 40 : 48)
    );
    if (which === "letter") {
      fontData.spacing.letter = clamped;
      $("letterSpacing").value = clamped;
      $("letterSpacingVal").textContent = clamped;
      $("letterSpacingNum").value = clamped;
    } else {
      fontData.spacing.word = clamped;
      $("wordSpacing").value = clamped;
      $("wordSpacingVal").textContent = clamped;
      $("wordSpacingNum").value = clamped;
    }
    refreshAllViews();
  }

  function syncSpacingUI() {
    if (!fontData) return;
    ensureSpacing();
    $("letterSpacing").value = fontData.spacing.letter;
    $("wordSpacing").value = fontData.spacing.word;
    $("letterSpacingVal").textContent = fontData.spacing.letter;
    $("wordSpacingVal").textContent = fontData.spacing.word;
  }

  function refreshAllViews() {
    updatePreview();
    updateChart();
    updateLinePreview();
    paintCharPickerGlyphs();
    updateLanguagePreview();
  }

  function updatePreview() {
    if (!fontData) return;
    const text = $("typeArea").value || " ";
    if (document.activeElement === $("sizeNum")) {
      $("sizeSlider").value = $("sizeNum").value;
    }
    const raw = parseInt($("sizeSlider").value, 10);
    const size = Math.max(24, Math.min(160, Number.isNaN(raw) ? 96 : raw));
    $("sizeSlider").value = size;
    $("sizeNum").value = size;
    FontEngine.renderTextToCanvas(text, fontData, currentVariant(), $("previewCanvas"), size);
    $("sizeValue").textContent = size + "px";

    $("heroEnglish").textContent = fontData.name;
    FontEngine.renderTextToCanvas(fontData.name, fontData, currentVariant(), $("heroCanvas"), 48);
    $("heroSub").textContent = `Previewing ${FontEngine.VARIANT_LABELS[currentVariant()]} · editing ${selectedChar}`;
  }

  function updateSizeFromNumber() {
    if (!fontData) return;
    const num = parseInt($("sizeNum").value, 10);
    if (Number.isNaN(num)) return;
    const clamped = Math.max(24, Math.min(160, num));
    $("sizeSlider").value = clamped;
    $("sizeNum").value = clamped;
    updatePreview();
  }

  function updateLinePreview() {
    if (!fontData) return;
    const text = $("layoutTypeArea").value || " ";
    const size = parseInt($("linePreviewSize").value, 10);
    const canvas = $("linePreviewCanvas");
    lineHitRegions = [];
    FontEngine.renderTextToCanvas(text, fontData, currentVariant(), canvas, size, "#eef1f7", {
      showLineGuide: true,
      selectedChar,
      hitRegions: lineHitRegions,
    });
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    $("linePreviewSizeVal").textContent = size + "px";
  }

  function selectChar(ch) {
    if (!ch || ch === " ") return;
    commitEditorGlyph();
    selectedChar = ch;
    buildCharPicker();
    syncEditorFromFont();
    refreshAllViews();
  }

  function buildCharPicker() {
    const wrap = $("charPicker");
    const numLabel = selectedChar >= "0" && selectedChar <= "9"
      ? FontEngine.NUMBER_LABELS[Number(selectedChar)] : null;
    $("editCharLabel").textContent = numLabel ? `${selectedChar} (${numLabel})` : selectedChar;

    const renderSection = (label, chars) => {
      const buttons = chars.map((ch) => {
        const safe = ch.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        const numLabel = ch >= "0" && ch <= "9" ? FontEngine.NUMBER_LABELS[Number(ch)] : null;
        const glyphText = numLabel || (ch === '"' ? "&quot;" : ch);
        return `<button type="button" class="char-btn${ch === selectedChar ? " active" : ""}" data-ch="${safe}">
          <span class="char-mini-slot"><canvas class="char-mini" aria-hidden="true"></canvas></span>
          <span class="char-glyph">${glyphText}</span>
        </button>`;
      }).join("");
      return `<div class="char-section"><span class="char-section-label">${label}</span><div class="char-section-row">${buttons}</div></div>`;
    };

    wrap.innerHTML = [
      renderSection("Uppercase", FontEngine.LETTERS_UPPER),
      renderSection("Lowercase", FontEngine.LETTERS_LOWER),
      renderSection("Numbers", FontEngine.DIGITS),
      renderSection("Special", FontEngine.SPECIAL_CHARS),
    ].join("");

    wrap.querySelectorAll(".char-btn").forEach((btn) => {
      btn.addEventListener("click", () => selectChar(btn.dataset.ch));
    });
    paintCharPickerGlyphs();
  }

  function paintCharPickerGlyphs() {
    if (!fontData) return;
    const dataVariant = editorSourceVariant();
    const previewVariant = currentVariant();
    const boxW = 30;
    const boxH = 30;
    document.querySelectorAll(".char-btn").forEach((btn) => {
      const ch = btn.dataset.ch;
      const mini = btn.querySelector(".char-mini");
      const slot = btn.querySelector(".char-mini-slot");
      if (!mini || !ch) return;
      const grid = fontData.variants[dataVariant][ch];
      if (!grid || !FontEngine.gridHasInk(grid)) {
        if (slot) slot.style.visibility = "hidden";
        return;
      }
      if (slot) slot.style.visibility = "visible";
      FontEngine.renderGlyphInBox(grid, mini, boxW, boxH, {
        fontData,
        ch,
        variant: previewVariant,
        color: "#a8c4ff",
        fontSize: 34,
      });
    });
  }

  function updateChart() {
    if (!fontData) return;
    const variant = currentVariant();
    const renderGrid = (containerId, chars, labels) => {
      const el = $(containerId);
      el.innerHTML = chars.map((ch, i) => {
        const label = labels ? labels[i] : ch;
        return `<div class="glyph-cell" data-ch="${ch}">
          <canvas class="glyph-mini"></canvas>
          <span class="glyph-label">${label}</span>
        </div>`;
      }).join("");

      el.querySelectorAll(".glyph-cell").forEach((cell) => {
        const ch = cell.dataset.ch;
        const cvs = cell.querySelector("canvas");
        const grid = fontData.variants[variant][ch];
        if (grid) {
          FontEngine.renderGlyphInBox(grid, cvs, 64, 56, {
            fontData,
            ch,
            variant,
            color: "#eef1f7",
            fontSize: 52,
            bg: "#111820",
          });
        } else {
          cvs.width = 64;
          cvs.height = 56;
          cvs.style.width = "64px";
          cvs.style.height = "56px";
          const ctx = cvs.getContext("2d");
          ctx.fillStyle = "#111820";
          ctx.fillRect(0, 0, 64, 56);
        }
        cell.addEventListener("click", () => {
          selectChar(ch);
          $("editorPanel").scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    };

    renderGrid("letterChart", FontEngine.LETTERS_UPPER);
    renderGrid("lowerChart", FontEngine.LETTERS_LOWER);
    renderGrid("numberChart", FontEngine.DIGITS,
      FontEngine.DIGITS.map((ch) => FontEngine.NUMBER_LABELS[Number(ch)] || ch));
    renderGrid("specialChart", FontEngine.SPECIAL_CHARS);
  }

  function activeLanguage() {
    if (!fontData) return null;
    return FontEngine.getActiveLanguage(fontData);
  }

  function syncLanguageUI() {
    if (!fontData) return;
    FontEngine.ensureLanguages(fontData);
    const list = $("languageList");
    const lang = activeLanguage();
    list.innerHTML = fontData.languages.map((l) => `
      <button type="button" class="lang-item${l.id === fontData.activeLanguageId ? " active" : ""}" data-lang-id="${l.id}">
        <span class="lang-item-name">${l.name}</span>
        <span class="lang-item-meta">${(l.transliteration?.length || 0)} rules</span>
      </button>
    `).join("");
    list.querySelectorAll(".lang-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        fontData.activeLanguageId = btn.dataset.langId;
        syncLanguageUI();
        updateLanguagePreview();
      });
    });

    $("langName").value = lang.name;
    $("langDescription").value = lang.description || "";
    const s = lang.syntax;
    $("synWordSep").value = s.wordSep ?? " ";
    $("synSentenceEnd").value = s.sentenceEnd ?? ".";
    $("synClauseSep").value = s.clauseSep ?? ",";
    $("synQuestion").value = s.question ?? "?";
    $("synExclamation").value = s.exclamation ?? "!";
    $("synQuoteOpen").value = s.quoteOpen ?? '"';
    $("synQuoteClose").value = s.quoteClose ?? '"';
    $("synDirection").value = s.direction ?? "ltr";

    renderTransliterationTable();
    renderCharMapTable();
    renderCustomSyntaxTable();
    updateLanguagePreview();
  }

  function readSyntaxFromUI() {
    const lang = activeLanguage();
    if (!lang) return;
    lang.syntax.wordSep = $("synWordSep").value;
    lang.syntax.sentenceEnd = $("synSentenceEnd").value;
    lang.syntax.clauseSep = $("synClauseSep").value;
    lang.syntax.question = $("synQuestion").value;
    lang.syntax.exclamation = $("synExclamation").value;
    lang.syntax.quoteOpen = $("synQuoteOpen").value;
    lang.syntax.quoteClose = $("synQuoteClose").value;
    lang.syntax.direction = $("synDirection").value;
    if (!lang.syntax.custom) lang.syntax.custom = [];
  }

  function saveLanguageMetaFromUI() {
    if (!fontData) return;
    const lang = activeLanguage();
    if (!lang) return;
    lang.name = $("langName").value.trim() || "New Language";
    lang.description = $("langDescription").value;
    readSyntaxFromUI();
    updateLanguageListLabels();
    updateLanguagePreview();
  }

  function updateLanguageListLabels() {
    if (!fontData) return;
    document.querySelectorAll(".lang-item").forEach((btn) => {
      const lang = fontData.languages.find((l) => l.id === btn.dataset.langId);
      if (!lang) return;
      btn.querySelector(".lang-item-name").textContent = lang.name;
      btn.querySelector(".lang-item-meta").textContent = `${(lang.transliteration?.length || 0)} rules`;
    });
  }

  function renderTransliterationTable() {
    const lang = activeLanguage();
    const tbody = $("translitBody");
    tbody.innerHTML = (lang.transliteration || []).map((rule, i) => `
      <tr>
        <td><input type="text" class="lang-input" data-translit-from="${i}" value="${escapeAttr(rule.from || "")}" placeholder="th" /></td>
        <td><input type="text" class="lang-input" data-translit-to="${i}" value="${escapeAttr(rule.to || "")}" placeholder="T" /></td>
        <td><button type="button" class="ghost-btn sm" data-del-translit="${i}">×</button></td>
      </tr>
    `).join("") || `<tr><td colspan="3" class="hint">No rules yet — add a rule to transform letter patterns into glyphs.</td></tr>`;

    const onTranslitInput = () => updateLanguagePreview();
    tbody.querySelectorAll("[data-translit-from]").forEach((el) => {
      el.addEventListener("input", () => {
        lang.transliteration[parseInt(el.dataset.translitFrom, 10)].from = el.value;
        onTranslitInput();
      });
    });
    tbody.querySelectorAll("[data-translit-to]").forEach((el) => {
      el.addEventListener("input", () => {
        lang.transliteration[parseInt(el.dataset.translitTo, 10)].to = el.value;
        onTranslitInput();
      });
    });
    tbody.querySelectorAll("[data-del-translit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        lang.transliteration.splice(parseInt(btn.dataset.delTranslit, 10), 1);
        renderTransliterationTable();
        updateLanguagePreview();
      });
    });
  }

  function renderCustomSyntaxTable() {
    const lang = activeLanguage();
    if (!lang.syntax.custom) lang.syntax.custom = [];
    const tbody = $("customSyntaxBody");
    tbody.innerHTML = lang.syntax.custom.map((entry, i) => `
      <tr>
        <td><input type="text" class="lang-input" data-custom-name="${i}" value="${escapeAttr(entry.name || "")}" placeholder="Ellipsis" /></td>
        <td><input type="text" class="lang-input" data-custom-symbol="${i}" value="${escapeAttr(entry.symbol || "")}" placeholder="…" maxlength="8" /></td>
        <td><button type="button" class="ghost-btn sm" data-del-custom="${i}">×</button></td>
      </tr>
    `).join("") || `<tr><td colspan="3" class="hint">No custom syntax yet — add your own punctuation or markers.</td></tr>`;

    tbody.querySelectorAll("[data-custom-name]").forEach((el) => {
      el.addEventListener("input", () => {
        lang.syntax.custom[parseInt(el.dataset.customName, 10)].name = el.value;
        updateLanguagePreview();
      });
    });
    tbody.querySelectorAll("[data-custom-symbol]").forEach((el) => {
      el.addEventListener("input", () => {
        lang.syntax.custom[parseInt(el.dataset.customSymbol, 10)].symbol = el.value;
        updateLanguagePreview();
      });
    });
    tbody.querySelectorAll("[data-del-custom]").forEach((btn) => {
      btn.addEventListener("click", () => {
        lang.syntax.custom.splice(parseInt(btn.dataset.delCustom, 10), 1);
        renderCustomSyntaxTable();
        updateLanguagePreview();
      });
    });
  }

  function escapeAttr(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function renderCharMapTable() {
    const lang = activeLanguage();
    const tbody = $("charMapBody");
    const chars = lang.alphabet ? [...lang.alphabet] : FontEngine.CHARS;
    tbody.innerHTML = chars.map((ch) => {
      const mapped = lang.charMap[ch] ?? ch;
      const safe = escapeAttr(ch);
      const display = ch === '"' ? "&quot;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch;
      return `<tr>
        <td class="map-from">${display}</td>
        <td><input type="text" class="lang-input map-input" maxlength="2" data-map-from="${safe}" value="${escapeAttr(mapped)}" placeholder="${display}" /></td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-map-from]").forEach((el) => {
      el.addEventListener("input", () => {
        const from = el.dataset.mapFrom;
        const val = el.value;
        if (val) lang.charMap[from] = val;
        else delete lang.charMap[from];
        updateLanguagePreview();
      });
    });
  }

  function flushLanguageEditsFromUI() {
    const lang = activeLanguage();
    if (!lang) return;
    readSyntaxFromUI();
    document.querySelectorAll("[data-translit-from]").forEach((el) => {
      const i = parseInt(el.dataset.translitFrom, 10);
      if (lang.transliteration[i]) lang.transliteration[i].from = el.value;
    });
    document.querySelectorAll("[data-translit-to]").forEach((el) => {
      const i = parseInt(el.dataset.translitTo, 10);
      if (lang.transliteration[i]) lang.transliteration[i].to = el.value;
    });
    document.querySelectorAll("[data-map-from]").forEach((el) => {
      const from = el.dataset.mapFrom;
      const val = el.value;
      if (val) lang.charMap[from] = val;
      else delete lang.charMap[from];
    });
    document.querySelectorAll("[data-custom-name]").forEach((el) => {
      const i = parseInt(el.dataset.customName, 10);
      if (lang.syntax.custom[i]) lang.syntax.custom[i].name = el.value;
    });
    document.querySelectorAll("[data-custom-symbol]").forEach((el) => {
      const i = parseInt(el.dataset.customSymbol, 10);
      if (lang.syntax.custom[i]) lang.syntax.custom[i].symbol = el.value;
    });
  }

  function updateLanguagePreview() {
    if (!fontData) return;
    flushLanguageEditsFromUI();
    const raw = $("langTypeArea").value || "";
    const translated = FontEngine.translateForFont(raw, fontData);
    $("langTranslated").textContent = translated || "—";
    const size = parseInt($("langPreviewSize").value, 10) || 64;
    FontEngine.renderTextToCanvas(translated || " ", fontData, currentVariant(), $("langPreviewCanvas"), size);
    $("langPreviewSizeVal").textContent = size + "px";
  }

  function setupLanguage() {
    $("addLanguageBtn").addEventListener("click", () => {
      if (!fontData) return;
      const lang = FontEngine.defaultLanguage(`Language ${fontData.languages.length + 1}`);
      fontData.languages.push(lang);
      fontData.activeLanguageId = lang.id;
      syncLanguageUI();
    });

    $("deleteLanguageBtn").addEventListener("click", () => {
      if (!fontData || fontData.languages.length <= 1) return;
      const id = fontData.activeLanguageId;
      fontData.languages = fontData.languages.filter((l) => l.id !== id);
      fontData.activeLanguageId = fontData.languages[0].id;
      syncLanguageUI();
    });

    $("addTranslitBtn").addEventListener("click", () => {
      if (!fontData) return;
      activeLanguage().transliteration.push({ from: "", to: "" });
      renderTransliterationTable();
      updateLanguagePreview();
    });

    $("addCustomSyntaxBtn").addEventListener("click", () => {
      if (!fontData) return;
      const lang = activeLanguage();
      if (!lang.syntax.custom) lang.syntax.custom = [];
      lang.syntax.custom.push({ name: "", symbol: "" });
      renderCustomSyntaxTable();
    });

    $("langName").addEventListener("input", saveLanguageMetaFromUI);
    $("langDescription").addEventListener("input", saveLanguageMetaFromUI);
    ["synWordSep", "synSentenceEnd", "synClauseSep",
      "synQuestion", "synExclamation", "synQuoteOpen", "synQuoteClose"
    ].forEach((id) => {
      $(id).addEventListener("input", saveLanguageMetaFromUI);
    });
    $("synDirection").addEventListener("change", saveLanguageMetaFromUI);

    $("langTypeArea").addEventListener("input", updateLanguagePreview);
    $("langPreviewSize").addEventListener("input", updateLanguagePreview);
  }

  function buildFontGallery() {
    const grid = $("fontGallery");
    grid.innerHTML = families.map((fam) => {
      const isEnglish = fam.id === FontEngine.ENGLISH_BASE_ID;
      const previewClass = isEnglish
        ? "font-card-preview font-card-preview-english"
        : "font-card-preview";
      const badge = isEnglish
        ? `<span class="font-card-badge">Built-in</span>`
        : `<span class="font-card-badge">Included</span>`;
      return `
        <button type="button" class="font-card" data-id="${fam.id}">
          ${badge}
          <span class="${previewClass}" data-preview-id="${fam.id}">Aa Bb 123</span>
          <span class="font-card-name">${fam.displayName}</span>
        </button>`;
    }).join("");

    grid.querySelectorAll(".font-card").forEach((btn) => {
      btn.addEventListener("click", () => loadFamily(btn.dataset.id));
    });

    hydrateFamilyPreviews();
  }

  function hydrateFamilyPreviews() {
    void hydrateFamilyPreviewsAsync();
  }

  async function hydrateFamilyPreviewsAsync() {
    for (const fam of families) {
      const el = document.querySelector(`[data-preview-id="${fam.id}"]`);
      if (!el) continue;
      if (fam.id === FontEngine.ENGLISH_BASE_ID) {
        el.style.fontFamily = '"DM Sans", system-ui, sans-serif';
        continue;
      }
      const regular = fam.variants?.regular;
      if (!regular?.path) continue;
      try {
        const res = await fetchWithTimeout(resolveAssetUrl(regular.path), 8000);
        if (!res.ok) continue;
        const buffer = await res.arrayBuffer();
        const blob = new Blob([buffer], { type: "font/ttf" });
        const url = URL.createObjectURL(blob);
        const faceName = `preview-${fam.id}`;
        const face = new FontFace(faceName, `url(${url})`);
        await withTimeout(face.load(), FONT_FACE_TIMEOUT_MS, "font preview");
        document.fonts.add(face);
        el.style.fontFamily = `"${faceName}", sans-serif`;
      } catch {
        /* keep default preview styling */
      }
    }
  }

  function setToolbarFontLabel(fam) {
    const name = typeof fam === "string" ? fam : fam.displayName || fam.name;
    $("heroEnglish").textContent = name;
  }

  async function loadFamily(familyId) {
    const family = families.find((f) => f.id === familyId);
    if (!family) return;
    $("loadingOverlay").hidden = false;
    $("loadingText").textContent = `Loading ${family.name}…`;

    try {
      fontData = await withTimeout(
        FontEngine.importFamilyFromManifest(family, familyId),
        45000,
        "font load"
      );
      currentFamilyId = familyId;
      initWorkspaceFromFont(family);
    } catch (err) {
      alert("Failed to load font: " + err.message);
    } finally {
      $("loadingOverlay").hidden = true;
    }
  }

  async function handleUpload(file) {
    if (!file) return;
    $("loadingOverlay").hidden = false;
    $("loadingText").textContent = `Importing ${file.name}…`;
    try {
      const { fontData: imported, familyId } = await FontEngine.importUploadedFont(file);
      fontData = imported;
      currentFamilyId = familyId;
      initWorkspaceFromFont({ id: familyId, displayName: fontData.name, name: fontData.name });
    } catch (err) {
      alert("Import failed: " + err.message);
    } finally {
      $("loadingOverlay").hidden = true;
    }
  }

  function editorCanvasPad() {
    if (!fontData) return { left: 0, top: 0 };
    return FontEngine.editorCanvasMargins(fontData, currentVariant(), FontEngine.getEditorCellPx(fontData));
  }

  function canvasCellFromEvent(e) {
    const canvas = $("pixelCanvas");
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const pt = e.touches?.[0] ?? e.changedTouches?.[0] ?? e;
    const px = (pt.clientX - rect.left) * scaleX;
    const py = (pt.clientY - rect.top) * scaleY;
    const cell = fontData ? FontEngine.getEditorCellPx(fontData) : FontEngine.EDITOR_CELL_PX;
    if (!fontData) {
      const pad = FontEngine.editorCanvasMargins(null, currentVariant(), cell);
      const x = Math.floor((px - pad.left) / cell);
      const y = Math.floor((py - pad.top) / cell);
      if (x < 0 || y < 0 || x >= FontEngine.GRID_W || y >= FontEngine.GRID_H) return null;
      return { x, y };
    }
    return FontEngine.editorCanvasPointToCell(px, py, fontData, currentVariant(), cell);
  }

  function buildResolutionSelect() {
    const sel = $("resolutionSelect");
    sel.innerHTML = FontEngine.RESOLUTION_PRESETS.map((p) =>
      `<option value="${p.id}">${p.label}</option>`
    ).join("");
  }

  function buildEditorResolutionSelect() {
    const sel = $("editorResolutionSelect");
    sel.innerHTML = FontEngine.EDITOR_RESOLUTION_PRESETS.map((p) =>
      `<option value="${p.id}">${p.label}</option>`
    ).join("");
  }

  function syncResolutionUI() {
    if (!fontData) return;
    if (!fontData.resolution) fontData.resolution = FontEngine.defaultResolution();
    $("resolutionSelect").value = fontData.resolution;
    const preset = FontEngine.getResolutionPreset(fontData.resolution);
    $("sizeSlider").value = preset.preview;
    $("sizeNum").value = preset.preview;
    $("sizeValue").textContent = preset.preview + "px";
    $("linePreviewSize").value = preset.line;
    $("linePreviewSizeVal").textContent = preset.line + "px";
  }

  function syncEditorResolutionUI() {
    if (!fontData) return;
    if (!fontData.editorResolution) fontData.editorResolution = FontEngine.defaultEditorResolution();
    $("editorResolutionSelect").value = fontData.editorResolution;
    const preset = FontEngine.getEditorResolutionPreset(fontData.editorResolution);
    $("editorResolutionVal").textContent = preset.cellPx + "px/cell";
  }

  function updateEditorResolutionFromUI() {
    if (!fontData) return;
    fontData.editorResolution = $("editorResolutionSelect").value;
    syncEditorResolutionUI();
    drawEditor();
    fitEditorToView();
  }

  function updateResolutionFromUI() {
    if (!fontData) return;
    fontData.resolution = $("resolutionSelect").value;
    const preset = FontEngine.getResolutionPreset(fontData.resolution);
    $("sizeSlider").value = preset.preview;
    $("sizeNum").value = preset.preview;
    $("linePreviewSize").value = preset.line;
    refreshAllViews();
  }

  function linePreviewPointFromEvent(e) {
    const canvas = $("linePreviewCanvas");
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function hitTestLinePreview(x, y) {
    for (let i = lineHitRegions.length - 1; i >= 0; i--) {
      const r = lineHitRegions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.ch;
    }
    return null;
  }

  function paintAt(x, y) {
    editorGrid[y][x] = tool === "pen";
    drawEditor();
    syncGlyphEdits();
  }

  function setupEditor() {
    const canvas = $("pixelCanvas");
    const wrap = document.querySelector(".pixel-wrap");
    if (wrap && !wrap.dataset.resizeBound) {
      wrap.dataset.resizeBound = "1";
      new ResizeObserver(() => {
        const drawPanel = document.querySelector('[data-tab-panel="draw"]');
        if (drawPanel?.classList.contains("active")) fitEditorToView();
      }).observe(wrap);
    }

    const onPointerDown = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if ($("rotatePrompt") && !$("rotatePrompt").hidden) return;
      canvas.setPointerCapture(e.pointerId);
      isDrawing = true;
      const cell = canvasCellFromEvent(e);
      if (cell) paintAt(cell.x, cell.y);
    };

    const onPointerMove = (e) => {
      if (!isDrawing) return;
      const cell = canvasCellFromEvent(e);
      if (cell) paintAt(cell.x, cell.y);
    };

    const endStroke = (e) => {
      if (canvas.hasPointerCapture?.(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      isDrawing = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointercancel", endStroke);
    canvas.addEventListener("lostpointercapture", () => { isDrawing = false; });
  }

  function setupLinePreview() {
    const canvas = $("linePreviewCanvas");

    canvas.addEventListener("mousedown", (e) => {
      const pt = linePreviewPointFromEvent(e);
      const ch = hitTestLinePreview(pt.x, pt.y);
      if (!ch) return;
      selectChar(ch);
      lineDragMoved = false;
      lineDrag = {
        ch,
        startX: pt.x,
        startY: pt.y,
        baseOffsetX: FontEngine.getGlyphMetrics(fontData, ch).offsetX,
        baseOffsetY: FontEngine.getGlyphMetrics(fontData, ch).offsetY,
        cellSize: parseInt($("linePreviewSize").value, 10) / FontEngine.GRID_H,
      };
    });

    canvas.addEventListener("mousemove", (e) => {
      if (!lineDrag) return;
      const pt = linePreviewPointFromEvent(e);
      const dx = Math.round((pt.x - lineDrag.startX) / lineDrag.cellSize);
      const dy = Math.round((pt.y - lineDrag.startY) / lineDrag.cellSize);
      if (dx !== 0 || dy !== 0) lineDragMoved = true;
      FontEngine.setGlyphMetrics(fontData, lineDrag.ch, {
        offsetX: Math.max(-16, Math.min(16, lineDrag.baseOffsetX + dx)),
        offsetY: Math.max(-16, Math.min(16, lineDrag.baseOffsetY + dy)),
      });
      if (lineDrag.ch === selectedChar) syncGlyphMetricsUI();
      refreshAllViews();
      syncVariantUI();
    });

    document.addEventListener("mouseup", () => { lineDrag = null; });

    canvas.addEventListener("click", (e) => {
      if (lineDragMoved) return;
      const pt = linePreviewPointFromEvent(e);
      const ch = hitTestLinePreview(pt.x, pt.y);
      if (ch) selectChar(ch);
    });
  }

  function setupTools() {
    document.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        tool = btn.dataset.tool;
        document.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("active", b === btn));
      });
    });

    $("clearGrid").addEventListener("click", () => {
      editorGrid = FontEngine.createEmptyGrid();
      drawEditor();
      syncGlyphEdits();
    });

    $("fillGrid").addEventListener("click", () => {
      editorGrid = editorGrid.map((row) => row.map(() => true));
      drawEditor();
      syncGlyphEdits();
    });

    $("pixelZoom").addEventListener("input", () => {
      $("pixelZoomVal").textContent = $("pixelZoom").value + "%";
      drawEditor();
    });
  }

  function setupToggles() {
    const onVariantChange = () => {
      syncVariantUI();
      if (!linkVariants) syncEditorFromFont();
      else drawEditor();
      fitEditorToView();
      refreshAllViews();
    };

    $("toggleBold").addEventListener("change", onVariantChange);
    $("toggleItalic").addEventListener("change", onVariantChange);

    document.querySelectorAll("[data-variant-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!linkVariants && fontData) commitEditorGlyph();
        const v = btn.dataset.variantBtn;
        $("toggleBold").checked = v === "bold" || v === "boldItalic";
        $("toggleItalic").checked = v === "italic" || v === "boldItalic";
        onVariantChange();
      });
    });

    $("linkVariants").addEventListener("change", () => {
      const turningOn = $("linkVariants").checked;
      if (fontData) {
        if (linkVariants && !turningOn) {
          commitEditorGlyph();
        } else if (!linkVariants && turningOn) {
          commitEditorGlyph();
          const cleaned = FontEngine.cleanupGrid(editorGrid);
          for (const variant of FontEngine.VARIANTS) {
            fontData.variants[variant][selectedChar] = FontEngine.cloneGrid(cleaned);
          }
          editorGrid = FontEngine.cloneGrid(cleaned);
        }
      }
      linkVariants = turningOn;
      if (!linkVariants) syncEditorFromFont();
      updateEditorHint();
      drawEditor();
      refreshAllViews();
    });
  }

  function setupTabs() {
    const tabs = document.querySelectorAll("[data-tab]");
    const panels = document.querySelectorAll("[data-tab-panel]");

    function showTab(tabId) {
      tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabId));
      panels.forEach((p) => {
        const show = p.dataset.tabPanel === tabId;
        p.hidden = !show;
        p.classList.toggle("active", show);
      });
      requestAnimationFrame(() => {
        if (tabId === "draw") fitEditorToView();
        if (tabId === "layout") updateLinePreview();
        if (tabId === "gallery") updateChart();
        if (tabId === "language") {
          syncLanguageUI();
          updateLanguagePreview();
        }
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => showTab(tab.dataset.tab));
    });

    showTab("draw");

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const active = document.querySelector(".tab-panel.active");
        if (!active) return;
        const id = active.dataset.tabPanel;
        if (id === "draw") fitEditorToView();
      }, 120);
    });

    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        updateRotatePrompt();
        fitEditorToView();
      }, 200);
    });
  }

  async function exportFont() {
    if (!fontData) return;
    $("exportBtn").disabled = true;
    $("exportBtn").textContent = "Exporting…";
    try {
      const blob = await FontEngine.exportZip(fontData);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${fontData.name.replace(/\s+/g, "-")}-font-pack.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      alert("Export failed: " + err.message);
    } finally {
      $("exportBtn").disabled = false;
      $("exportBtn").textContent = "Download Font Pack";
    }
  }


  function setupAbout() {
    const overlay = $("aboutOverlay");
    const open = () => { overlay.hidden = false; };
    const close = () => { overlay.hidden = true; };
    $("aboutBtn").addEventListener("click", open);
    $("aboutCloseBtn").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) close();
    });
  }

  async function init() {
    bootCatalogSync();

    setupEditor();
    setupLinePreview();
    setupTools();
    setupToggles();
    setupTabs();
    setupLanguage();
    buildCharPicker();
    buildResolutionSelect();
    buildEditorResolutionSelect();
    $("pixelZoomVal").textContent = $("pixelZoom").value + "%";

    $("newBlankFontBtn").addEventListener("click", createBlankFont);
    setupAbout();
    setupRotatePrompt();
    $("saveFontBtn").addEventListener("click", saveCurrentFont);
    $("backToMenuBtn").addEventListener("click", showHome);
    $("fontUpload").addEventListener("change", (e) => {
      handleUpload(e.target.files[0]);
      e.target.value = "";
    });

    $("typeArea").addEventListener("input", () => {
      updatePreview();
    });
    $("layoutTypeArea").addEventListener("input", updateLinePreview);
    $("sizeSlider").addEventListener("input", updatePreview);
    $("sizeNum").addEventListener("change", updateSizeFromNumber);
    $("linePreviewSize").addEventListener("input", updateLinePreview);
    $("linePreviewSize").addEventListener("change", updateLinePreview);
    $("letterSpacing").addEventListener("input", updateSpacingFromUI);
    $("wordSpacing").addEventListener("input", updateSpacingFromUI);
    $("letterSpacingNum").addEventListener("change", () => updateSpacingFromNumber("letter"));
    $("wordSpacingNum").addEventListener("change", () => updateSpacingFromNumber("word"));
    $("weightSlider").addEventListener("input", updateWeightFromUI);
    $("weightNum").addEventListener("change", updateWeightFromNumber);
    $("resolutionSelect").addEventListener("change", updateResolutionFromUI);
    $("editorResolutionSelect").addEventListener("change", updateEditorResolutionFromUI);
    ["glyphScale", "offsetX", "offsetY", "advanceAdjust"].forEach((id) => {
      $(id).addEventListener("input", updateGlyphMetricsFromUI);
    });
    ["offsetXNum", "offsetYNum", "advanceAdjustNum"].forEach((id) => {
      $(id).addEventListener("change", () => {
        $(id.replace("Num", "")).value = $(id).value;
        updateGlyphMetricsFromUI();
      });
    });
    ["lineShiftX", "lineShiftY"].forEach((id) => {
      $(id).addEventListener("input", updateLayoutFromUI);
    });
    $("resetGlyphMetrics").addEventListener("click", () => {
      if (!fontData) return;
      FontEngine.setGlyphMetrics(fontData, selectedChar, FontEngine.defaultGlyphMetrics());
      syncGlyphMetricsUI();
      refreshAllViews();
      syncVariantUI();
    });
    $("copyGlyphMetrics").addEventListener("click", () => {
      if (!fontData) return;
      const src = FontEngine.getGlyphMetrics(fontData, selectedChar);
      for (const ch of FontEngine.CHARS) {
        FontEngine.setGlyphMetrics(fontData, ch, { ...src });
      }
      refreshAllViews();
      syncVariantUI();
    });
    $("resetLayout").addEventListener("click", () => {
      if (!fontData) return;
      fontData.layout = FontEngine.defaultLayout();
      for (const ch of FontEngine.CHARS) {
        FontEngine.setGlyphMetrics(fontData, ch, FontEngine.defaultGlyphMetrics());
      }
      syncLayoutUI();
      refreshAllViews();
      syncVariantUI();
    });
    $("nudgeLeft").addEventListener("click", () => nudgeGlyph(-1, 0));
    $("nudgeRight").addEventListener("click", () => nudgeGlyph(1, 0));
    $("nudgeUp").addEventListener("click", () => nudgeGlyph(0, -1));
    $("nudgeDown").addEventListener("click", () => nudgeGlyph(0, 1));
    $("exportBtn").addEventListener("click", exportFont);

    $("sampleChips").innerHTML = SAMPLES.map((t) => {
      const safe = t.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      const label = t.length > 22 ? t.slice(0, 20) + "…" : t;
      return `<button type="button" class="chip" data-text="${safe}">${label}</button>`;
    }).join("");
    $("sampleChips").querySelectorAll(".chip").forEach((c) => {
      c.addEventListener("click", () => { $("typeArea").value = c.dataset.text; refreshAllViews(); });
    });

    if (!catalogReady) {
      try {
        const data = await loadFontCatalog();
        bootCatalogFromData(data);
      } catch (err) {
        console.error("Font catalog load failed:", err);
        showHomeCatalogError("Could not load fonts.");
      }
    }
  }

  function nudgeGlyph(dx, dy) {
    if (!fontData) return;
    const m = FontEngine.getGlyphMetrics(fontData, selectedChar);
    FontEngine.setGlyphMetrics(fontData, selectedChar, {
      offsetX: Math.max(-16, Math.min(16, m.offsetX + dx)),
      offsetY: Math.max(-16, Math.min(16, m.offsetY + dy)),
    });
    syncGlyphMetricsUI();
    refreshAllViews();
  }

  init();
})();
