/* ============================================
   GW2 Guild Emblem Designer - Application Logic
   ============================================ */

const GW2_API = 'https://api.guildwars2.com/v2';
const API_BASE = `${GW2_API}/emblem`;
const FG_PER_PAGE = 16; // 4x4
const BG_PER_PAGE = 12; // 4x3

// Guild emblem dye palette (exact in-game values)
// 5 columns, read left-to-right top-to-bottom
const PALETTE_COLORS = [
  // Row 1
  '#221c1f',
  '#7b8385',
  '#b8b1b0',
  '#9a8969',
  '#4c4545',

  // Row 2
  '#3d0905',
  '#724814',
  '#86050e',
  '#963f1a',
  '#85261d',

  // Row 3
  '#885305',
  '#544505',
  '#2b4175',
  '#3b3570',
  '#0a4b69',

  // Row 4
  '#0a6868',
  '#612061',
  '#491340',
  '#49295f',
  '#bc5d66',

  // Row 5
  '#751b42',
  '#092133',
  '#294e04',
  '#1f2804',
  '#083831',

  // Row 6
  '#23562d',
];

// ---- Application State ----
const state = {
  foregrounds: [],       // Array of { id, layers: [url, url, url] }
  backgrounds: [],       // Array of { id, layers: [url] }
  fgPage: 0,
  bgPage: 0,
  selectedFgId: null,
  selectedBgId: null,
  activeSlot: 'bg',      // 'bg' | 'fg1' | 'fg2'
  colors: {
    bg: PALETTE_COLORS[5],   // dark maroon
    fg1: PALETTE_COLORS[7],  // red
    fg2: PALETTE_COLORS[14], // deep teal
  },
  flip: {
    fgH: false,
    fgV: false,
    bgH: false,
    bgV: false,
  },
  loading: true,
};

// ---- DOM References ----
const dom = {
  fgGrid: document.getElementById('fg-grid'),
  bgGrid: document.getElementById('bg-grid'),
  fgPrev: document.getElementById('fg-prev'),
  fgNext: document.getElementById('fg-next'),
  bgPrev: document.getElementById('bg-prev'),
  bgNext: document.getElementById('bg-next'),
  fgPageIndicator: document.getElementById('fg-page-indicator'),
  bgPageIndicator: document.getElementById('bg-page-indicator'),
  previewBgLayers: document.getElementById('preview-bg-layers'),
  previewFgLayers: document.getElementById('preview-fg-layers'),
  fgFlipH: document.getElementById('fg-flip-h'),
  fgFlipV: document.getElementById('fg-flip-v'),
  bgFlipH: document.getElementById('bg-flip-h'),
  bgFlipV: document.getElementById('bg-flip-v'),
  slotBg: document.getElementById('slot-bg'),
  slotFg1: document.getElementById('slot-fg1'),
  slotFg2: document.getElementById('slot-fg2'),
  slotBgSwatch: document.getElementById('slot-bg-swatch'),
  slotFg1Swatch: document.getElementById('slot-fg1-swatch'),
  slotFg2Swatch: document.getElementById('slot-fg2-swatch'),
  colorPalette: document.getElementById('color-palette'),
  guildSearchInput: document.getElementById('guild-search-input'),
  guildSearchBtn: document.getElementById('guild-search-btn'),
  guildSearchStatus: document.getElementById('guild-search-status'),
  btnRandomDesign: document.getElementById('btn-random-design'),
  btnRandomColors: document.getElementById('btn-random-colors'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  btnLoadCode: document.getElementById('btn-load-code'),
  btnSaveImage: document.getElementById('btn-save-image'),
  codeInput: document.getElementById('code-input'),
  actionsStatus: document.getElementById('actions-status'),
};

// ---- API Fetching ----

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status} for ${url}`);
  return res.json();
}

/**
 * Fetch all emblem data in batches.
 * First fetches the ID lists, then batch-fetches detail objects.
 */
async function fetchEmblemData() {
  // Fetch ID lists in parallel
  const [fgIds, bgIds] = await Promise.all([
    fetchJson(`${API_BASE}/foregrounds`),
    fetchJson(`${API_BASE}/backgrounds`),
  ]);

  // Batch-fetch foregrounds in chunks of 200
  const fgChunks = chunkArray(fgIds, 200);
  const fgResults = await Promise.all(
    fgChunks.map(chunk =>
      fetchJson(`${API_BASE}/foregrounds?ids=${chunk.join(',')}`)
    )
  );
  state.foregrounds = fgResults.flat();

  // Backgrounds are few enough for a single request
  state.backgrounds = await fetchJson(
    `${API_BASE}/backgrounds?ids=${bgIds.join(',')}`
  );

  // Select first items by default
  if (state.foregrounds.length > 0) {
    state.selectedFgId = state.foregrounds[0].id;
  }
  if (state.backgrounds.length > 0) {
    state.selectedBgId = state.backgrounds[0].id;
  }

  state.loading = false;

  // Detect native image dimensions from the first foreground layer
  if (state.foregrounds.length > 0 && state.foregrounds[0].layers[1]) {
    const probe = new Image();
    probe.onload = () => {
      console.log(`[Emblem] Native image size: ${probe.naturalWidth}x${probe.naturalHeight}`);
      state.nativeSize = probe.naturalWidth;
    };
    probe.src = state.foregrounds[0].layers[1];
  }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---- Grid Rendering ----

function renderFgGrid() {
  const { foregrounds, fgPage, selectedFgId } = state;
  const totalPages = Math.ceil(foregrounds.length / FG_PER_PAGE);
  const start = fgPage * FG_PER_PAGE;
  const pageItems = foregrounds.slice(start, start + FG_PER_PAGE);

  dom.fgGrid.innerHTML = '';

  if (state.loading) {
    dom.fgGrid.innerHTML = '<div class="loading-msg">Loading emblems...</div>';
    return;
  }

  pageItems.forEach(fg => {
    // Use layer 1 (primary color shape) for the thumbnail, not layer 0 (outline)
    const thumb = createThumb(fg, selectedFgId, fg.layers[1] || fg.layers[0]);
    thumb.addEventListener('click', () => {
      state.selectedFgId = fg.id;
      renderFgGrid();
      renderPreview();
    });
    dom.fgGrid.appendChild(thumb);
  });

  // Pagination state
  dom.fgPrev.disabled = fgPage <= 0;
  dom.fgNext.disabled = fgPage >= totalPages - 1;
  dom.fgPageIndicator.textContent = `${fgPage + 1} / ${totalPages}`;
}

function renderBgGrid() {
  const { backgrounds, bgPage, selectedBgId } = state;
  const totalPages = Math.ceil(backgrounds.length / BG_PER_PAGE);
  const start = bgPage * BG_PER_PAGE;
  const pageItems = backgrounds.slice(start, start + BG_PER_PAGE);

  dom.bgGrid.innerHTML = '';

  if (state.loading) {
    dom.bgGrid.innerHTML = '<div class="loading-msg">Loading shapes...</div>';
    return;
  }

  pageItems.forEach(bg => {
    const thumb = createThumb(bg, selectedBgId, bg.layers[0]);
    thumb.addEventListener('click', () => {
      state.selectedBgId = bg.id;
      renderBgGrid();
      renderPreview();
    });
    dom.bgGrid.appendChild(thumb);
  });

  dom.bgPrev.disabled = bgPage <= 0;
  dom.bgNext.disabled = bgPage >= totalPages - 1;
  dom.bgPageIndicator.textContent = `${bgPage + 1} / ${totalPages}`;
}

function createThumb(item, selectedId, layerUrl) {
  const el = document.createElement('div');
  el.className = 'grid-thumb' + (item.id === selectedId ? ' selected' : '');

  const layer = document.createElement('div');
  layer.className = 'thumb-layer';
  layer.style.webkitMaskImage = `url('${layerUrl}')`;
  layer.style.maskImage = `url('${layerUrl}')`;
  el.appendChild(layer);

  return el;
}

// ---- Preview Rendering ----

function renderPreview() {
  renderPreviewBg();
  renderPreviewFg();
  updateFlipTransforms();
}

function renderPreviewBg() {
  dom.previewBgLayers.innerHTML = '';

  const bg = state.backgrounds.find(b => b.id === state.selectedBgId);
  if (!bg) return;

  // Background layer 0: single color
  const layer = document.createElement('div');
  layer.className = 'preview-layer colored';
  layer.style.backgroundColor = state.colors.bg;
  layer.style.webkitMaskImage = `url('${bg.layers[0]}')`;
  layer.style.maskImage = `url('${bg.layers[0]}')`;
  dom.previewBgLayers.appendChild(layer);
}

function renderPreviewFg() {
  dom.previewFgLayers.innerHTML = '';

  const fg = state.foregrounds.find(f => f.id === state.selectedFgId);
  if (!fg) return;

  // Layer 0: outline/shadow (rendered as-is, no color tinting)
  if (fg.layers[0]) {
    const layer0 = document.createElement('div');
    layer0.className = 'preview-layer outline';
    const img = document.createElement('img');
    img.src = fg.layers[0];
    img.alt = '';
    img.draggable = false;
    layer0.appendChild(img);
    dom.previewFgLayers.appendChild(layer0);
  }

  // Layer 1: primary foreground color (FG1)
  if (fg.layers[1]) {
    const layer1 = document.createElement('div');
    layer1.className = 'preview-layer colored';
    layer1.style.backgroundColor = state.colors.fg1;
    layer1.style.webkitMaskImage = `url('${fg.layers[1]}')`;
    layer1.style.maskImage = `url('${fg.layers[1]}')`;
    dom.previewFgLayers.appendChild(layer1);
  }

  // Layer 2: secondary foreground color (FG2)
  if (fg.layers[2]) {
    const layer2 = document.createElement('div');
    layer2.className = 'preview-layer colored';
    layer2.style.backgroundColor = state.colors.fg2;
    layer2.style.webkitMaskImage = `url('${fg.layers[2]}')`;
    layer2.style.maskImage = `url('${fg.layers[2]}')`;
    dom.previewFgLayers.appendChild(layer2);
  }
}

function updateFlipTransforms() {
  const fgScaleX = state.flip.fgH ? -1 : 1;
  const fgScaleY = state.flip.fgV ? -1 : 1;
  dom.previewFgLayers.style.transform = `scale(${fgScaleX}, ${fgScaleY})`;

  const bgScaleX = state.flip.bgH ? -1 : 1;
  const bgScaleY = state.flip.bgV ? -1 : 1;
  dom.previewBgLayers.style.transform = `scale(${bgScaleX}, ${bgScaleY})`;
}

// ---- Color Controls ----

function renderColorPalette() {
  dom.colorPalette.innerHTML = '';

  PALETTE_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;

    // Mark if this color matches the active slot's current color
    if (color === state.colors[state.activeSlot]) {
      swatch.classList.add('current');
    }

    swatch.addEventListener('click', () => {
      state.colors[state.activeSlot] = color;
      renderPreview();
      renderColorPalette();
      updateSlotSwatches();
    });

    dom.colorPalette.appendChild(swatch);
  });
}

function updateSlotSwatches() {
  dom.slotBgSwatch.style.backgroundColor = state.colors.bg;
  dom.slotFg1Swatch.style.backgroundColor = state.colors.fg1;
  dom.slotFg2Swatch.style.backgroundColor = state.colors.fg2;
}

function setActiveSlot(slot) {
  state.activeSlot = slot;

  // Update active class on slot buttons
  dom.slotBg.classList.toggle('active', slot === 'bg');
  dom.slotFg1.classList.toggle('active', slot === 'fg1');
  dom.slotFg2.classList.toggle('active', slot === 'fg2');

  renderColorPalette();
}

// ---- Flip Controls ----

function toggleFlip(key) {
  state.flip[key] = !state.flip[key];
  updateFlipTransforms();
  updateFlipButtons();
}

function updateFlipButtons() {
  dom.fgFlipH.classList.toggle('active', state.flip.fgH);
  dom.fgFlipV.classList.toggle('active', state.flip.fgV);
  dom.bgFlipH.classList.toggle('active', state.flip.bgH);
  dom.bgFlipV.classList.toggle('active', state.flip.bgV);
}

// ---- Randomize ----

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomizeDesign() {
  state.selectedFgId = pickRandom(state.foregrounds).id;
  state.selectedBgId = pickRandom(state.backgrounds).id;
  state.flip.fgH = Math.random() < 0.5;
  state.flip.fgV = Math.random() < 0.5;
  state.flip.bgH = Math.random() < 0.5;
  state.flip.bgV = Math.random() < 0.5;

  navigateToSelectedFg();
  navigateToSelectedBg();
  renderFgGrid();
  renderBgGrid();
  renderPreview();
  updateFlipButtons();
}

function randomizeColors() {
  state.colors.bg = pickRandom(PALETTE_COLORS);
  state.colors.fg1 = pickRandom(PALETTE_COLORS);
  state.colors.fg2 = pickRandom(PALETTE_COLORS);

  renderPreview();
  renderColorPalette();
  updateSlotSwatches();
}

// ---- Guild Lookup ----

/**
 * Convert a GW2 color ID to a hex RGB string via /v2/colors.
 * Returns '#RRGGBB'.
 */
async function gw2ColorToHex(colorId) {
  const data = await fetchJson(`${GW2_API}/colors/${colorId}`);
  // The API returns cloth/leather/metal RGB variants.
  // Use the base RGB for the emblem (cloth is closest to flat color).
  const [r, g, b] = data.cloth?.rgb || data.base_rgb || [128, 128, 128];
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function setSearchStatus(msg, type) {
  dom.guildSearchStatus.textContent = msg;
  dom.guildSearchStatus.className = 'guild-search-status' + (type ? ` ${type}` : '');
}

async function lookupGuild(name) {
  if (!name.trim()) return;

  dom.guildSearchBtn.disabled = true;
  setSearchStatus('Searching...', 'loading');

  try {
    // Step 1: Search for guild by name
    const ids = await fetchJson(
      `${GW2_API}/guild/search?name=${encodeURIComponent(name.trim())}`
    );

    if (!ids || ids.length === 0) {
      setSearchStatus(`No guild found with name "${name.trim()}"`, 'error');
      dom.guildSearchBtn.disabled = false;
      return;
    }

    const guildId = ids[0];

    // Step 2: Fetch guild info
    setSearchStatus('Loading guild info...', 'loading');
    const guild = await fetchJson(`${GW2_API}/guild/${guildId}`);

    if (!guild.emblem) {
      setSearchStatus(`Guild "${guild.name}" [${guild.tag}] has no emblem`, 'error');
      dom.guildSearchBtn.disabled = false;
      return;
    }

    // Step 3: Resolve dye color IDs to hex values
    setSearchStatus('Loading colors...', 'loading');
    const emblem = guild.emblem;

    // Background color (1 color)
    const bgColorId = emblem.background.colors[0];
    const bgHex = bgColorId ? await gw2ColorToHex(bgColorId) : state.colors.bg;

    // Foreground colors (2 colors)
    const fg1ColorId = emblem.foreground.colors[0];
    const fg2ColorId = emblem.foreground.colors[1];
    const fg1Hex = fg1ColorId ? await gw2ColorToHex(fg1ColorId) : state.colors.fg1;
    const fg2Hex = fg2ColorId ? await gw2ColorToHex(fg2ColorId) : state.colors.fg2;

    // Step 4: Apply everything to state
    state.selectedFgId = emblem.foreground.id;
    state.selectedBgId = emblem.background.id;
    state.colors.bg = bgHex;
    state.colors.fg1 = fg1Hex;
    state.colors.fg2 = fg2Hex;

    // Parse flip flags
    const flags = emblem.flags || [];
    state.flip.fgH = flags.includes('FlipForegroundHorizontal');
    state.flip.fgV = flags.includes('FlipForegroundVertical');
    state.flip.bgH = flags.includes('FlipBackgroundHorizontal');
    state.flip.bgV = flags.includes('FlipBackgroundVertical');

    // Navigate grids to the page containing the selected items
    navigateToSelectedFg();
    navigateToSelectedBg();

    // Re-render everything
    renderFgGrid();
    renderBgGrid();
    renderPreview();
    renderColorPalette();
    updateSlotSwatches();
    updateFlipButtons();

    setSearchStatus(
      `Loaded: ${guild.name} [${guild.tag}]`,
      'success'
    );
  } catch (err) {
    console.error('Guild lookup failed:', err);
    setSearchStatus('Lookup failed. Check the name and try again.', 'error');
  }

  dom.guildSearchBtn.disabled = false;
}

/** Jump the foreground grid page so the selected emblem is visible. */
function navigateToSelectedFg() {
  const idx = state.foregrounds.findIndex(f => f.id === state.selectedFgId);
  if (idx >= 0) {
    state.fgPage = Math.floor(idx / FG_PER_PAGE);
  }
}

/** Jump the background grid page so the selected shape is visible. */
function navigateToSelectedBg() {
  const idx = state.backgrounds.findIndex(b => b.id === state.selectedBgId);
  if (idx >= 0) {
    state.bgPage = Math.floor(idx / BG_PER_PAGE);
  }
}

// ---- Save / Load / Export ----

function setActionsStatus(msg, type) {
  dom.actionsStatus.textContent = msg;
  dom.actionsStatus.className = 'actions-status' + (type ? ` ${type}` : '');
}

/**
 * Encode the current emblem configuration as a compact URL-safe string.
 * Format: base64 of JSON with fg, bg, colors, and flips.
 */
function generateCode() {
  const payload = {
    f: state.selectedFgId,
    b: state.selectedBgId,
    cb: state.colors.bg,
    c1: state.colors.fg1,
    c2: state.colors.fg2,
    fh: state.flip.fgH ? 1 : 0,
    fv: state.flip.fgV ? 1 : 0,
    bh: state.flip.bgH ? 1 : 0,
    bv: state.flip.bgV ? 1 : 0,
  };
  return btoa(JSON.stringify(payload));
}

/**
 * Decode an emblem code string and apply it to the current state.
 * Returns true on success, false on failure.
 */
function applyCode(code) {
  try {
    const payload = JSON.parse(atob(code.trim()));

    if (payload.f == null || payload.b == null) {
      throw new Error('Missing foreground or background ID');
    }

    state.selectedFgId = payload.f;
    state.selectedBgId = payload.b;
    state.colors.bg = payload.cb || state.colors.bg;
    state.colors.fg1 = payload.c1 || state.colors.fg1;
    state.colors.fg2 = payload.c2 || state.colors.fg2;
    state.flip.fgH = !!payload.fh;
    state.flip.fgV = !!payload.fv;
    state.flip.bgH = !!payload.bh;
    state.flip.bgV = !!payload.bv;

    navigateToSelectedFg();
    navigateToSelectedBg();
    renderFgGrid();
    renderBgGrid();
    renderPreview();
    renderColorPalette();
    updateSlotSwatches();
    updateFlipButtons();

    return true;
  } catch (err) {
    console.error('Failed to load emblem code:', err);
    return false;
  }
}

function handleCopyCode() {
  const code = generateCode();
  dom.codeInput.value = code;

  navigator.clipboard.writeText(code).then(() => {
    setActionsStatus('Code copied to clipboard!', 'success');
  }).catch(() => {
    // Fallback: select the input so the user can manually copy
    dom.codeInput.select();
    setActionsStatus('Code generated -- select and copy manually', 'success');
  });
}

function handleLoadCode() {
  const code = dom.codeInput.value.trim();
  if (!code) {
    setActionsStatus('Paste an emblem code first', 'error');
    return;
  }

  if (applyCode(code)) {
    setActionsStatus('Emblem loaded!', 'success');
  } else {
    setActionsStatus('Invalid emblem code', 'error');
  }
}

/**
 * Render the current emblem to a canvas and trigger a PNG download.
 * Loads all layer images, draws them with proper colors and flips.
 */
async function handleSaveImage() {
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  setActionsStatus('Rendering image...', '');

  try {
    const bg = state.backgrounds.find(b => b.id === state.selectedBgId);
    const fg = state.foregrounds.find(f => f.id === state.selectedFgId);

    // Draw background layer (colored)
    if (bg && bg.layers[0]) {
      const img = await loadImage(bg.layers[0]);
      drawColoredLayer(ctx, img, state.colors.bg, SIZE, state.flip.bgH, state.flip.bgV);
    }

    // Draw foreground layers
    if (fg) {
      // Layer 0: outline (as-is)
      if (fg.layers[0]) {
        const img = await loadImage(fg.layers[0]);
        drawPlainLayer(ctx, img, SIZE, state.flip.fgH, state.flip.fgV);
      }

      // Layer 1: FG1 color
      if (fg.layers[1]) {
        const img = await loadImage(fg.layers[1]);
        drawColoredLayer(ctx, img, state.colors.fg1, SIZE, state.flip.fgH, state.flip.fgV);
      }

      // Layer 2: FG2 color
      if (fg.layers[2]) {
        const img = await loadImage(fg.layers[2]);
        drawColoredLayer(ctx, img, state.colors.fg2, SIZE, state.flip.fgH, state.flip.fgV);
      }
    }

    // Trigger download
    const link = document.createElement('a');
    link.download = `emblem_${state.selectedFgId}_${state.selectedBgId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    setActionsStatus('Image saved!', 'success');
  } catch (err) {
    console.error('Failed to save image:', err);
    setActionsStatus('Failed to render image (CORS issue?)', 'error');
  }
}

/** Load an image with CORS enabled. Returns a promise resolving to the Image element. */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.src = url;
  });
}

/**
 * Draw a white image tinted to the given color.
 * Uses a temporary canvas to composite: fill color, then use source image as mask via 'destination-in'.
 */
function drawColoredLayer(ctx, img, color, size, flipH, flipV) {
  const tmp = document.createElement('canvas');
  tmp.width = size;
  tmp.height = size;
  const tctx = tmp.getContext('2d');

  // Draw the source image (white shape on transparent)
  tctx.drawImage(img, 0, 0, size, size);

  // Tint: fill with color, but only where the image had pixels
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = color;
  tctx.fillRect(0, 0, size, size);

  // Draw the tinted result onto the main canvas, with flipping
  ctx.save();
  if (flipH || flipV) {
    ctx.translate(flipH ? size : 0, flipV ? size : 0);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  }
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

/** Draw a plain (uncolored) image layer onto the canvas with optional flipping. */
function drawPlainLayer(ctx, img, size, flipH, flipV) {
  ctx.save();
  if (flipH || flipV) {
    ctx.translate(flipH ? size : 0, flipV ? size : 0);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  }
  ctx.drawImage(img, 0, 0, size, size);
  ctx.restore();
}

// ---- Event Binding ----

function bindEvents() {
  // Foreground pagination
  dom.fgPrev.addEventListener('click', () => {
    if (state.fgPage > 0) {
      state.fgPage--;
      renderFgGrid();
    }
  });
  dom.fgNext.addEventListener('click', () => {
    const totalPages = Math.ceil(state.foregrounds.length / FG_PER_PAGE);
    if (state.fgPage < totalPages - 1) {
      state.fgPage++;
      renderFgGrid();
    }
  });

  // Background pagination
  dom.bgPrev.addEventListener('click', () => {
    if (state.bgPage > 0) {
      state.bgPage--;
      renderBgGrid();
    }
  });
  dom.bgNext.addEventListener('click', () => {
    const totalPages = Math.ceil(state.backgrounds.length / BG_PER_PAGE);
    if (state.bgPage < totalPages - 1) {
      state.bgPage++;
      renderBgGrid();
    }
  });

  // Flip buttons
  dom.fgFlipH.addEventListener('click', () => toggleFlip('fgH'));
  dom.fgFlipV.addEventListener('click', () => toggleFlip('fgV'));
  dom.bgFlipH.addEventListener('click', () => toggleFlip('bgH'));
  dom.bgFlipV.addEventListener('click', () => toggleFlip('bgV'));

  // Color slot selection
  dom.slotBg.addEventListener('click', () => setActiveSlot('bg'));
  dom.slotFg1.addEventListener('click', () => setActiveSlot('fg1'));
  dom.slotFg2.addEventListener('click', () => setActiveSlot('fg2'));

  // Guild search
  dom.guildSearchBtn.addEventListener('click', () => {
    lookupGuild(dom.guildSearchInput.value);
  });
  dom.guildSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      lookupGuild(dom.guildSearchInput.value);
    }
  });

  // Randomize
  dom.btnRandomDesign.addEventListener('click', randomizeDesign);
  dom.btnRandomColors.addEventListener('click', randomizeColors);

  // Save / Load / Export
  dom.btnCopyCode.addEventListener('click', handleCopyCode);
  dom.btnLoadCode.addEventListener('click', handleLoadCode);
  dom.btnSaveImage.addEventListener('click', handleSaveImage);
}

// ---- Initialization ----

async function init() {
  bindEvents();

  // Show loading state
  renderFgGrid();
  renderBgGrid();
  renderColorPalette();
  updateSlotSwatches();
  updateFlipButtons();

  try {
    await fetchEmblemData();
  } catch (err) {
    console.error('Failed to load emblem data:', err);
    dom.fgGrid.innerHTML = '<div class="loading-msg">Failed to load emblems. Check your connection.</div>';
    dom.bgGrid.innerHTML = '<div class="loading-msg">Failed to load backgrounds.</div>';
    return;
  }

  // Randomize everything on first load
  randomizeDesign();
  randomizeColors();
}

init();
