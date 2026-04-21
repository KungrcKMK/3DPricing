// ============= MATERIAL DATABASE =============
const MATERIALS = {
  FDM: [
    { id: 'PLA',   name: 'PLA',           density: 1.24, pricePerGram: 5,  desc: 'ใช้งานทั่วไป พิมพ์ง่าย เป็นมิตรสิ่งแวดล้อม' },
    { id: 'ABS',   name: 'ABS',           density: 1.04, pricePerGram: 6,  desc: 'ทนความร้อน เหนียว ดัดได้' },
    { id: 'PETG',  name: 'PETG',          density: 1.27, pricePerGram: 7,  desc: 'ทนทาน ใส กันน้ำดี' },
    { id: 'TPU',   name: 'TPU (ยาง)',     density: 1.21, pricePerGram: 12, desc: 'ยืดหยุ่น เหมือนยาง' },
    { id: 'NYLON', name: 'Nylon',         density: 1.14, pricePerGram: 15, desc: 'แข็งแรงสูง ทนเคมี' },
    { id: 'PCCF',  name: 'PC Carbon Fiber',density: 1.20, pricePerGram: 25, desc: 'เสริมคาร์บอนไฟเบอร์ แข็งแรงมาก' },
  ],
  SLA: [
    { id: 'STD',   name: 'Standard Resin',density: 1.10, pricePerGram: 10, desc: 'พิมพ์ผิวเรียบละเอียดสูง' },
    { id: 'TOUGH', name: 'Tough Resin',   density: 1.12, pricePerGram: 14, desc: 'ทนแรงกระแทก' },
    { id: 'CLEAR', name: 'Clear Resin',   density: 1.10, pricePerGram: 12, desc: 'โปร่งใส' },
  ],
  SLS: [
    { id: 'PA12',  name: 'Nylon PA12',    density: 1.01, pricePerGram: 18, desc: 'แข็งแรง ไม่ต้องซัพพอร์ต' },
    { id: 'PA12GF',name: 'Nylon PA12 GF', density: 1.22, pricePerGram: 22, desc: 'เสริมใยแก้ว' },
  ],
};

// ============= PRICING PARAMS =============
const SHELL_VOLUME_RATIO = 0.15; // outer shell is always printed ~100%, about 15% of total
const DEFAULT_POWER = { FDM: 150, SLA: 80, SLS: 2000 }; // watt
const DEFAULT_ELEC_RATE = 4.5;   // ฿/kWh
const DEFAULT_MACHINE_RATE = 15; // ฿/hr — depreciation + maintenance (คืนทุนเครื่อง)
const DEFAULT_SETUP_FEE = 50;    // ฿/order — one-time setup & file prep
const DEFAULT_RISK_PCT = 0;      // % markup for difficult prints
const STORAGE_KEY_PRICES = '3dpricing:customPrices';

// ============= STATE =============
let state = {
  volume: 0,            // cm^3 — effective (after scale) used for pricing
  originalVolume: 0,    // cm^3 — from STL before scale
  originalBbox: null,   // {x, y, z} mm — from STL before scale
  scale: 100,           // percent (100 = 1:1)
  process: 'FDM',
  material: 'PLA',
  pricePerGram: 5,      // ฿/g — editable, auto-filled from material DB
  layer: 0.20,
  infill: 20,
  qty: 1,
  powerWatt: DEFAULT_POWER.FDM,
  elecRate: DEFAULT_ELEC_RATE,
  machineRate: DEFAULT_MACHINE_RATE,
  setupFee: DEFAULT_SETUP_FEE,
  riskPct: DEFAULT_RISK_PCT,
  file: null,
  bbox: null,
  customer: { name: '', phone: '', email: '', address: '' },
};

// ============= DOM =============
const $ = (id) => document.getElementById(id);

// ============= INIT =============
document.addEventListener('DOMContentLoaded', () => {
  renderMaterialSelect();
  setupDropZone();
  setupForm();
  setupHardReload();
  setupThumbnailControls();
  recalc();
});

function setupHardReload() {
  const btn = $('hardReload');
  if (!btn) return;
  btn.addEventListener('click', () => {
    // Unregister service workers if any (belt-and-suspenders)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
    }
    // Force full reload with cache-busting query
    const url = new URL(window.location.href);
    url.searchParams.set('_cb', Date.now());
    url.hash = ''; // drop hash to avoid scroll restore
    window.location.replace(url.toString());
  });
}

function renderMaterialSelect() {
  const sel = $('material');
  sel.innerHTML = '';
  MATERIALS[state.process].forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name} (฿${m.pricePerGram}/g)`;
    sel.appendChild(opt);
  });
  state.material = MATERIALS[state.process][0].id;
  applyPriceForMaterial();
}

// ============= CUSTOM PRICE STORAGE =============
function getCustomPrices() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_PRICES) || '{}'); }
  catch { return {}; }
}
function saveCustomPrice(materialId, price) {
  const prices = getCustomPrices();
  prices[materialId] = price;
  try { localStorage.setItem(STORAGE_KEY_PRICES, JSON.stringify(prices)); } catch {}
}
function removeCustomPrice(materialId) {
  const prices = getCustomPrices();
  delete prices[materialId];
  try { localStorage.setItem(STORAGE_KEY_PRICES, JSON.stringify(prices)); } catch {}
}
function applyPriceForMaterial() {
  const mat = getMaterial();
  const custom = getCustomPrices();
  const price = (custom[state.material] != null) ? custom[state.material] : mat.pricePerGram;
  setPriceUI(price);
}
function setPriceUI(pricePerG) {
  state.pricePerGram = pricePerG;
  const ppg = $('pricePerGram');
  const ppk = $('pricePerKg');
  if (ppg && document.activeElement !== ppg) ppg.value = pricePerG.toFixed(2);
  if (ppk && document.activeElement !== ppk) ppk.value = (pricePerG * 1000).toFixed(0);
}

// ============= PURCHASE PRICE CALCULATOR =============
function computeBuyPerGram() {
  const price = parseFloat($('buyPrice').value);
  const weight = parseFloat($('buyWeight').value);
  if (!isFinite(price) || !isFinite(weight) || price <= 0 || weight <= 0) return null;
  return price / weight;
}
function updateBuyCalc() {
  const perG = computeBuyPerGram();
  const resultEl = $('buyPerGram');
  const applyBtn = $('applyBuyPrice');
  if (!resultEl || !applyBtn) return;
  if (perG == null) {
    resultEl.textContent = '—';
    resultEl.classList.remove('valid');
    applyBtn.disabled = true;
  } else {
    resultEl.textContent = `${perG.toFixed(2)} ฿/g`;
    resultEl.classList.add('valid');
    applyBtn.disabled = false;
  }
}

// ============= DROP ZONE =============
function setupDropZone() {
  const dz = $('dropZone');
  const input = $('fileInput');

  $('browseBtn').addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
  dz.addEventListener('click', () => input.click());

  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => {
    e.preventDefault(); dz.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => {
    e.preventDefault(); dz.classList.remove('dragover');
  }));
  dz.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  input.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) handleFile(f);
  });

  $('clearFile').addEventListener('click', () => {
    state.file = null;
    state.volume = 0;
    state.originalVolume = 0;
    state.originalBbox = null;
    state.scale = 100;
    state.bbox = null;
    $('fileInfo').classList.add('hidden');
    $('volumeInput').value = '';
    input.value = '';
    setScaleInputsEnabled(false);
    clearThumbnail();
    recalc();
  });
}

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.stl')) {
    alert('กรุณาเลือกไฟล์ .stl เท่านั้น');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const result = STLParser.parse(e.target.result);
      state.file = file;
      state.originalVolume = result.volume;
      state.originalBbox = result.bbox;
      state.scale = 100;
      state.volume = result.volume;
      state.bbox = result.bbox;
      $('fileName').textContent = file.name;
      $('fileSize').textContent = formatBytes(file.size);
      $('fileTris').textContent = result.triangles.toLocaleString();
      $('fileInfo').classList.remove('hidden');
      $('volumeInput').value = result.volume.toFixed(2);
      setScaleInputsEnabled(true);
      updateScaledDisplay();
      if (result.verts && result.verts.length > 0) {
        renderThumbnail(result.verts, result.bbox);
      }
      recalc();
    } catch (err) {
      alert('ไม่สามารถอ่านไฟล์ได้: ' + err.message);
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

function updateScaledDisplay() {
  const s = state.scale / 100;
  const b = state.originalBbox;
  if (b) {
    const sx = b.x * s, sy = b.y * s, sz = b.z * s;
    const origText = `${b.x.toFixed(1)} × ${b.y.toFixed(1)} × ${b.z.toFixed(1)} mm`;
    const scaledText = `${sx.toFixed(1)} × ${sy.toFixed(1)} × ${sz.toFixed(1)} mm`;
    const isUnit = Math.abs(state.scale - 100) < 0.01;
    $('fileDims').textContent = isUnit ? origText : `${origText}  →  ${scaledText} (${state.scale.toFixed(0)}%)`;
    state.bbox = { x: sx, y: sy, z: sz };
    // Update target inputs without retriggering (set only if not focused)
    const active = document.activeElement;
    if (active !== $('targetX')) $('targetX').value = sx.toFixed(2);
    if (active !== $('targetY')) $('targetY').value = sy.toFixed(2);
    if (active !== $('targetZ')) $('targetZ').value = sz.toFixed(2);
  }
  if (state.originalVolume > 0) {
    const scaledVol = state.originalVolume * s * s * s;
    state.volume = scaledVol;
    const origVol = `${state.originalVolume.toFixed(2)} cm³`;
    const scaledVolText = `${scaledVol.toFixed(2)} cm³`;
    const isUnit = Math.abs(state.scale - 100) < 0.01;
    $('fileVolume').textContent = isUnit ? origVol : `${origVol}  →  ${scaledVolText} (×${(s*s*s).toFixed(2)})`;
    $('volumeInput').value = scaledVol.toFixed(2);
  }
}

function setScaleInputsEnabled(on) {
  ['targetX', 'targetY', 'targetZ', 'resetScale'].forEach(id => {
    $(id).disabled = !on;
    if (!on) $(id).value = '';
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ============= THUMBNAIL RENDER (interactive orbit) =============
let thumbnailState = {
  verts: null,
  bbox: null,
  yaw: 0,
  pitch: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

function renderThumbnail(verts, bbox) {
  thumbnailState.verts = verts;
  thumbnailState.bbox = bbox;
  resetThumbnailView();
  drawThumbnail();
}

function resetThumbnailView() {
  const b = thumbnailState.bbox;
  if (!b) return;
  const dx = b.x, dy = b.y, dz = b.z;
  const minAxis = Math.min(dx, dy, dz);
  const maxAxis = Math.max(dx, dy, dz);
  const isFlat = minAxis / maxAxis < 0.35;

  if (isFlat) {
    // Relief / coin / plate — look down the thin axis with slight tilt
    if (dz === minAxis) {
      // Z thin → look straight down +Z, tilt slightly
      thumbnailState.yaw = 0;
      thumbnailState.pitch = -0.35;
    } else if (dy === minAxis) {
      // Y thin → rotate so Y becomes view direction
      thumbnailState.yaw = 0;
      thumbnailState.pitch = Math.PI / 2 - 0.35;
    } else {
      // X thin
      thumbnailState.yaw = Math.PI / 2;
      thumbnailState.pitch = -0.35;
    }
  } else {
    // 3D object — isometric-ish
    thumbnailState.yaw = Math.PI / 6;
    thumbnailState.pitch = -Math.PI / 6;
  }
}

function drawThumbnail() {
  const canvas = $('thumbnail');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#fafbfd');
  grad.addColorStop(1, '#e4e8ef');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const { verts, bbox, yaw, pitch, dragging } = thumbnailState;
  if (!verts || !bbox) return;

  const triCount = verts.length / 9;
  if (triCount === 0) return;

  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const cz = (bbox.minZ + bbox.maxZ) / 2;

  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

  // Rotate into view space. Camera at +Z looking toward -Z (orthographic).
  // Yaw around world Z, then pitch around world X. Returns [x, y, z].
  function transform(x, y, z) {
    x -= cx; y -= cy; z -= cz;
    const x1 = x * cosY - y * sinY;
    const y1 = x * sinY + y * cosY;
    const z1 = z;
    const y2 = y1 * cosP - z1 * sinP;
    const z2 = y1 * sinP + z1 * cosP;
    return [x1, y2, z2];
  }

  // Downsample heavily during drag for smooth 60fps interaction
  const MAX_TRIS = dragging ? 25000 : 250000;
  const step = Math.max(1, Math.floor(triCount / MAX_TRIS));

  // Light in view space — upper-front
  const LX = 0.3, LY = -0.25, LZ = 0.92;
  const nL = Math.hypot(LX, LY, LZ);

  const tris = [];
  let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;

  for (let i = 0; i < triCount; i += step) {
    const o = i * 9;
    const A = transform(verts[o],   verts[o+1], verts[o+2]);
    const B = transform(verts[o+3], verts[o+4], verts[o+5]);
    const C = transform(verts[o+6], verts[o+7], verts[o+8]);

    // Normal in view space
    const ex1 = B[0] - A[0], ey1 = B[1] - A[1], ez1 = B[2] - A[2];
    const ex2 = C[0] - A[0], ey2 = C[1] - A[1], ez2 = C[2] - A[2];
    const nx = ey1 * ez2 - ez1 * ey2;
    const ny = ez1 * ex2 - ex1 * ez2;
    const nz = ex1 * ey2 - ey1 * ex2;

    // Backface cull: camera at +Z, visible iff normal has +Z component
    if (nz <= 0) continue;

    const nmag = Math.hypot(nx, ny, nz) || 1;
    const intensity = Math.max(0.28, (nx * LX + ny * LY + nz * LZ) / (nmag * nL));

    // Centroid depth — larger Z = closer to camera
    const depth = (A[2] + B[2] + C[2]) / 3;

    tris.push({ A, B, C, intensity, depth });

    if (A[0] < sMinX) sMinX = A[0]; if (A[0] > sMaxX) sMaxX = A[0];
    if (B[0] < sMinX) sMinX = B[0]; if (B[0] > sMaxX) sMaxX = B[0];
    if (C[0] < sMinX) sMinX = C[0]; if (C[0] > sMaxX) sMaxX = C[0];
    if (A[1] < sMinY) sMinY = A[1]; if (A[1] > sMaxY) sMaxY = A[1];
    if (B[1] < sMinY) sMinY = B[1]; if (B[1] > sMaxY) sMaxY = B[1];
    if (C[1] < sMinY) sMinY = C[1]; if (C[1] > sMaxY) sMaxY = C[1];
  }

  if (tris.length === 0) return;

  const bw = sMaxX - sMinX, bh = sMaxY - sMinY;
  const scale = Math.min(W / bw, H / bh) * 0.88;
  const offX = W/2 - (sMinX + sMaxX)/2 * scale;
  const offY = H/2 + (sMinY + sMaxY)/2 * scale; // +: canvas Y is inverted

  // Painter's: far first (smaller Z) → near drawn on top
  tris.sort((p, q) => p.depth - q.depth);

  for (const t of tris) {
    const lightness = Math.floor(28 + 50 * t.intensity);
    const color = `hsl(22, 70%, ${lightness}%)`;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(t.A[0]*scale + offX, -t.A[1]*scale + offY);
    ctx.lineTo(t.B[0]*scale + offX, -t.B[1]*scale + offY);
    ctx.lineTo(t.C[0]*scale + offX, -t.C[1]*scale + offY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Hint overlay (only when idle)
  if (!dragging) {
    ctx.fillStyle = 'rgba(107, 122, 143, 0.75)';
    ctx.font = '11px "Segoe UI", "Sarabun", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ลากเพื่อหมุน · ดับเบิลคลิก = รีเซ็ต', W - 8, H - 6);
  }
}

function setupThumbnailControls() {
  const canvas = $('thumbnail');
  if (!canvas) return;
  canvas.style.cursor = 'grab';

  function beginDrag(clientX, clientY) {
    if (!thumbnailState.verts) return false;
    thumbnailState.dragging = true;
    thumbnailState.lastX = clientX;
    thumbnailState.lastY = clientY;
    canvas.style.cursor = 'grabbing';
    return true;
  }
  function moveDrag(clientX, clientY) {
    if (!thumbnailState.dragging) return;
    const dx = clientX - thumbnailState.lastX;
    const dy = clientY - thumbnailState.lastY;
    thumbnailState.lastX = clientX;
    thumbnailState.lastY = clientY;
    thumbnailState.yaw += dx * 0.01;
    const LIM = Math.PI / 2 - 0.05;
    thumbnailState.pitch = Math.max(-LIM, Math.min(LIM, thumbnailState.pitch + dy * 0.01));
    drawThumbnail();
  }
  function endDrag() {
    if (!thumbnailState.dragging) return;
    thumbnailState.dragging = false;
    canvas.style.cursor = 'grab';
    drawThumbnail(); // redraw at full quality
  }

  canvas.addEventListener('mousedown', (e) => {
    if (beginDrag(e.clientX, e.clientY)) e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
  window.addEventListener('mouseup', endDrag);

  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (beginDrag(t.clientX, t.clientY)) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    e.preventDefault();
    moveDrag(t.clientX, t.clientY);
  }, { passive: false });
  canvas.addEventListener('touchend', endDrag);
  canvas.addEventListener('touchcancel', endDrag);

  canvas.addEventListener('dblclick', () => {
    if (!thumbnailState.verts) return;
    resetThumbnailView();
    drawThumbnail();
  });
}

function clearThumbnail() {
  thumbnailState.verts = null;
  thumbnailState.bbox = null;
  const canvas = $('thumbnail');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ============= FORM =============
function setupForm() {
  $('process').addEventListener('change', (e) => {
    state.process = e.target.value;
    state.powerWatt = DEFAULT_POWER[state.process];
    $('powerWatt').value = state.powerWatt;
    renderMaterialSelect();
    recalc();
  });
  $('material').addEventListener('change', (e) => {
    state.material = e.target.value;
    applyPriceForMaterial();
    recalc();
  });
  $('pricePerGram').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (isNaN(v) || v < 0) return;
    state.pricePerGram = v;
    $('pricePerKg').value = (v * 1000).toFixed(0);
    saveCustomPrice(state.material, v);
    recalc();
  });
  $('pricePerKg').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (isNaN(v) || v < 0) return;
    const perG = v / 1000;
    state.pricePerGram = perG;
    $('pricePerGram').value = perG.toFixed(2);
    saveCustomPrice(state.material, perG);
    recalc();
  });
  $('resetPrice').addEventListener('click', () => {
    const mat = getMaterial();
    removeCustomPrice(state.material);
    setPriceUI(mat.pricePerGram);
    recalc();
  });

  // Purchase-price calculator: ราคาที่ซื้อ ÷ น้ำหนักทั้งหมด = ฿/g
  $('buyPrice').addEventListener('input', updateBuyCalc);
  $('buyWeight').addEventListener('input', updateBuyCalc);
  $('applyBuyPrice').addEventListener('click', () => {
    const perG = computeBuyPerGram();
    if (perG == null) return;
    setPriceUI(perG);
    saveCustomPrice(state.material, perG);
    recalc();
  });
  updateBuyCalc(); // initial state
  $('layer').addEventListener('change', (e) => {
    state.layer = parseFloat(e.target.value);
    recalc();
  });
  $('infill').addEventListener('input', (e) => {
    state.infill = parseInt(e.target.value);
    $('infillVal').textContent = state.infill;
    recalc();
  });
  $('volumeInput').addEventListener('input', (e) => {
    // Manual edit resets STL/scale linkage
    state.volume = parseFloat(e.target.value) || 0;
    state.originalVolume = 0;
    state.originalBbox = null;
    state.scale = 100;
    setScaleInputsEnabled(false);
    recalc();
  });

  ['targetX', 'targetY', 'targetZ'].forEach((id, idx) => {
    const axis = ['x', 'y', 'z'][idx];
    $(id).addEventListener('input', (e) => {
      if (!state.originalBbox) return;
      const v = parseFloat(e.target.value);
      if (isNaN(v) || v <= 0) return;
      state.scale = (v / state.originalBbox[axis]) * 100;
      updateScaledDisplay();
      recalc();
    });
  });

  $('resetScale').addEventListener('click', () => {
    if (!state.originalBbox) return;
    state.scale = 100;
    updateScaledDisplay();
    recalc();
  });
  $('qty').addEventListener('input', (e) => {
    state.qty = Math.max(1, parseInt(e.target.value) || 1);
    recalc();
  });
  $('powerWatt').addEventListener('input', (e) => {
    state.powerWatt = parseFloat(e.target.value) || 0;
    recalc();
  });
  $('elecRate').addEventListener('input', (e) => {
    state.elecRate = parseFloat(e.target.value) || 0;
    recalc();
  });
  $('machineRate').addEventListener('input', (e) => {
    state.machineRate = parseFloat(e.target.value) || 0;
    recalc();
  });
  $('setupFee').addEventListener('input', (e) => {
    state.setupFee = parseFloat(e.target.value) || 0;
    recalc();
  });
  $('riskPct').addEventListener('input', (e) => {
    state.riskPct = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
    $('riskVal').textContent = state.riskPct;
    recalc();
  });

  ['custName', 'custPhone', 'custEmail', 'custAddress'].forEach(id => {
    $(id).addEventListener('input', (e) => {
      const key = id.replace('cust', '').toLowerCase();
      state.customer[key] = e.target.value;
    });
  });

  $('orderBtn').addEventListener('click', () => {
    if (state.volume <= 0) {
      alert('กรุณาอัปโหลดไฟล์หรือกรอกปริมาตรก่อน');
      return;
    }
    alert('ขอบคุณสำหรับออเดอร์! (ยังไม่ได้เชื่อมต่อระบบ payment)');
  });

  $('copyBtn').addEventListener('click', copyQuote);
  $('printQuoteBtn').addEventListener('click', printQuote);
}

// ============= PRICING =============
function getMaterial() {
  return MATERIALS[state.process].find(m => m.id === state.material) || MATERIALS[state.process][0];
}

function calcWeight() {
  if (state.volume <= 0) return 0;
  const mat = getMaterial();
  // Effective volume = shell + infill-filled interior
  const effectiveVolume = state.volume * (SHELL_VOLUME_RATIO + (1 - SHELL_VOLUME_RATIO) * (state.infill / 100));
  return effectiveVolume * mat.density;
}

function calcPrintTime() {
  // very rough estimate (hours)
  // FDM: ~12 g/hour at 0.2mm layer, scales inversely with layer height
  if (state.volume <= 0) return 0;
  const weight = calcWeight();
  const baseRate = { FDM: 12, SLA: 20, SLS: 30 }[state.process];
  const layerFactor = 0.20 / state.layer;
  return weight / baseRate * layerFactor;
}

function recalc() {
  const weight = calcWeight();
  const time = calcPrintTime();

  // Per-piece base costs
  const filamentCost = weight * state.pricePerGram;
  const electricityCost = (state.powerWatt * time / 1000) * state.elecRate;
  const machineCost = time * state.machineRate;

  const perPieceBase = filamentCost + electricityCost + machineCost;
  const allPieces = perPieceBase * state.qty;
  const subtotal = allPieces + state.setupFee;            // setup added once per order
  const riskAmount = subtotal * (state.riskPct / 100);
  const total = subtotal + riskAmount;

  // Update UI
  $('outWeight').textContent = `${weight.toFixed(1)} g`;
  $('outTime').textContent = `${time.toFixed(2)} ชม.`;
  $('outQty').textContent = `${state.qty} ชิ้น`;

  $('costFilament').textContent = fmt(filamentCost * state.qty);
  $('costElectricity').textContent = fmt(electricityCost * state.qty);
  $('costMachine').textContent = fmt(machineCost * state.qty);
  $('costSetup').textContent = fmt(state.setupFee);
  $('subtotal').textContent = fmt(subtotal);
  $('costRisk').textContent = fmt(riskAmount);
  $('riskLabel').textContent = state.riskPct;
  $('riskVal').textContent = state.riskPct;
  $('total').textContent = fmt(total);
}

function fmt(n) {
  return '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function copyQuote() {
  const mat = getMaterial();
  const weight = calcWeight();
  const time = calcPrintTime();
  const riskLine = state.riskPct > 0
    ? `ค่าความเสี่ยง (${state.riskPct}%): ${$('costRisk').textContent}\n`
    : '';
  const lines = [
    '=== ใบเสนอราคา 3D Printing ===',
    `ไฟล์: ${state.file ? state.file.name : '(manual input)'}`,
    `เทคโนโลยี: ${state.process}`,
    `วัสดุ: ${mat.name}`,
    `ปริมาตร: ${state.volume.toFixed(2)} cm³${state.scale !== 100 ? ' (สเกล ' + state.scale + '%)' : ''}`,
    `น้ำหนัก: ${weight.toFixed(1)} g`,
    `เวลาพิมพ์: ${time.toFixed(2)} ชม.`,
    `Infill: ${state.infill}% · Layer: ${state.layer}mm`,
    `กำลังไฟ: ${state.powerWatt} W · ค่าไฟ: ฿${state.elecRate}/kWh`,
    `ค่าเครื่อง: ฿${state.machineRate}/ชม. · Setup: ฿${state.setupFee}${state.riskPct > 0 ? ' · Risk: ' + state.riskPct + '%' : ''}`,
    `จำนวน: ${state.qty} ชิ้น`,
    '',
    `ค่าวัสดุ: ${$('costFilament').textContent}`,
    `ค่าไฟฟ้า: ${$('costElectricity').textContent}`,
    `ค่าเครื่อง: ${$('costMachine').textContent}`,
    `ค่า Setup: ${$('costSetup').textContent}`,
    `ยอดรวม: ${$('subtotal').textContent}`,
    (state.riskPct > 0 ? `ค่าความเสี่ยง (${state.riskPct}%): ${$('costRisk').textContent}` : null),
    `รวมทั้งสิ้น: ${$('total').textContent}`,
  ].filter(Boolean).join('\n');
  navigator.clipboard.writeText(lines)
    .then(() => alert('คัดลอกใบเสนอราคาแล้ว'))
    .catch(() => alert('ไม่สามารถคัดลอกได้'));
}

// ============= PRINT QUOTE =============
function genQuoteNumber() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rnd = String(Math.floor(Math.random() * 9000) + 1000);
  return `QT-${yyyy}${mm}${dd}-${rnd}`;
}

function formatThaiDate(d) {
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function printQuote() {
  if (state.volume <= 0) {
    alert('กรุณาอัปโหลดไฟล์หรือกรอกปริมาตรก่อน');
    return;
  }

  const mat = getMaterial();
  const weight = calcWeight();
  const time = calcPrintTime();
  const filamentCost = weight * state.pricePerGram;
  const electricityCost = (state.powerWatt * time / 1000) * state.elecRate;
  const machineCost = time * state.machineRate;
  const perPieceBase = filamentCost + electricityCost + machineCost;
  const allPieces = perPieceBase * state.qty;
  const subtotal = allPieces + state.setupFee;
  const riskAmount = subtotal * (state.riskPct / 100);
  const total = subtotal + riskAmount;
  const perPieceDisplay = state.qty > 0 ? total / state.qty : 0;

  const now = new Date();
  const validUntil = new Date(now);
  validUntil.setDate(validUntil.getDate() + 30);
  const quoteNo = genQuoteNumber();

  const c = state.customer;
  const hasCustomer = c.name || c.phone || c.email || c.address;

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบเสนอราคา ${quoteNo}</title>
<style>
  @page { margin: 1.5cm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun','Segoe UI','Prompt',sans-serif; color: #2c3e50; font-size: 14px; line-height: 1.5; padding: 20px; max-width: 820px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #ea5b0c; padding-bottom: 16px; margin-bottom: 20px; }
  .brand { display: flex; gap: 14px; align-items: center; }
  .logo { background: linear-gradient(135deg,#ea5b0c,#c74900); color: white; font-weight: 800; font-size: 22px; width: 54px; height: 54px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .brand-text h1 { font-size: 20px; color: #1a2332; }
  .brand-text p { font-size: 12px; color: #6b7a8f; }
  .company { text-align: right; font-size: 12px; color: #555; line-height: 1.6; }
  .company strong { font-size: 14px; color: #1a2332; display: block; margin-bottom: 4px; }
  .title { text-align: center; font-size: 26px; font-weight: 700; letter-spacing: 4px; color: #1a2332; margin: 20px 0 8px; }
  .title-en { text-align: center; font-size: 13px; color: #6b7a8f; letter-spacing: 3px; margin-bottom: 20px; }
  .meta { display: flex; justify-content: space-between; background: #fff3eb; border: 1px solid #ffd9bf; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; }
  .meta strong { color: #c74900; margin-right: 6px; }
  .cust-box { border: 1px solid #e4e8ef; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
  .cust-box h3 { font-size: 12px; color: #6b7a8f; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .cust-box .cust-name { font-size: 16px; font-weight: 700; color: #1a2332; margin-bottom: 4px; }
  .cust-box .cust-detail { font-size: 13px; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #e4e8ef; }
  thead th { background: #ea5b0c; color: white; padding: 10px 12px; text-align: left; font-size: 13px; font-weight: 600; }
  thead th.num { text-align: right; }
  tbody td { padding: 12px; border-bottom: 1px solid #e4e8ef; font-size: 13px; vertical-align: top; }
  tbody td.num { text-align: right; }
  tbody td .spec { font-size: 12px; color: #6b7a8f; margin-top: 4px; }
  .summary-grid { display: flex; gap: 16px; margin-bottom: 20px; }
  .cost-breakdown { flex: 1; background: #f8fafc; border: 1px solid #e4e8ef; padding: 14px; border-radius: 8px; }
  .cost-breakdown h4 { font-size: 12px; color: #6b7a8f; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
  .cost-breakdown .cb-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
  .grand { width: 320px; background: linear-gradient(135deg,#ea5b0c,#c74900); color: white; padding: 18px 20px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }
  .grand span { font-size: 14px; opacity: 0.9; }
  .grand strong { font-size: 22px; }
  .notes { border-top: 1px dashed #ccc; padding-top: 14px; margin-top: 20px; font-size: 12px; color: #555; }
  .notes h4 { color: #1a2332; margin-bottom: 6px; font-size: 13px; }
  .notes ul { padding-left: 18px; }
  .notes li { padding: 2px 0; }
  .sign-row { display: flex; justify-content: space-around; margin-top: 60px; gap: 40px; }
  .sign-box { flex: 1; text-align: center; }
  .sign-line { border-top: 1px solid #333; margin-bottom: 6px; padding-top: 40px; }
  .sign-label { font-size: 13px; color: #555; }
  .print-bar { position: fixed; top: 10px; right: 10px; background: #ea5b0c; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  .print-bar:hover { background: #c74900; }
  @media print { .print-bar { display: none; } body { padding: 0; } }
</style>
</head>
<body>
<button class="print-bar" onclick="window.print()">🖨 พิมพ์ / Save PDF</button>

<div class="header">
  <div class="brand">
    <div class="logo">3D</div>
    <div class="brand-text">
      <h1>3D Print Service</h1>
      <p>บริการพิมพ์ 3 มิติคุณภาพสูง</p>
    </div>
  </div>
  <div class="company">
    <strong>[ชื่อร้าน/บริษัท]</strong>
    [ที่อยู่บรรทัด 1]<br>
    [ที่อยู่บรรทัด 2]<br>
    โทร: [0x-xxxx-xxxx] · อีเมล: [email]<br>
    เลขผู้เสียภาษี: [x-xxxx-xxxxx-xx-x]
  </div>
</div>

<div class="title">ใบเสนอราคา</div>
<div class="title-en">QUOTATION</div>

<div class="meta">
  <div><strong>เลขที่:</strong>${quoteNo}</div>
  <div><strong>วันที่:</strong>${formatThaiDate(now)}</div>
  <div><strong>ยืนราคาถึง:</strong>${formatThaiDate(validUntil)}</div>
</div>

${hasCustomer ? `
<div class="cust-box">
  <h3>เรียน / ลูกค้า</h3>
  <div class="cust-name">${c.name || '-'}</div>
  <div class="cust-detail">
    ${c.address ? c.address + '<br>' : ''}
    ${c.phone ? 'โทร: ' + c.phone : ''}${c.phone && c.email ? ' · ' : ''}${c.email ? 'อีเมล: ' + c.email : ''}
  </div>
</div>` : ''}

<table>
  <thead>
    <tr>
      <th style="width:35%">รายการ</th>
      <th>รายละเอียด</th>
      <th class="num" style="width:60px">จำนวน</th>
      <th class="num" style="width:110px">ราคา/ชิ้น</th>
      <th class="num" style="width:110px">รวม</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <strong>งานพิมพ์ 3 มิติ</strong>
        <div class="spec">${state.file ? state.file.name : 'ตามปริมาตรที่ระบุ'}</div>
      </td>
      <td>
        เทคโนโลยี: <strong>${state.process}</strong> · วัสดุ: <strong>${mat.name}</strong><br>
        ปริมาตร ${state.volume.toFixed(2)} cm³${state.scale !== 100 ? ` (สเกล ${state.scale}%)` : ''} · น้ำหนัก ${weight.toFixed(1)} g<br>
        ${state.bbox ? `ขนาด ${state.bbox.x.toFixed(1)}×${state.bbox.y.toFixed(1)}×${state.bbox.z.toFixed(1)} mm · ` : ''}เวลาพิมพ์ ${time.toFixed(2)} ชม.<br>
        Layer ${state.layer} mm · Infill ${state.infill}%
      </td>
      <td class="num">${state.qty}</td>
      <td class="num">${fmt(perPieceDisplay)}</td>
      <td class="num"><strong>${fmt(total)}</strong></td>
    </tr>
  </tbody>
</table>

<div class="summary-grid">
  <div class="cost-breakdown">
    <h4>รายละเอียดต้นทุน</h4>
    <div class="cb-row"><span>1. ค่าวัสดุ (${weight.toFixed(1)}g × ฿${state.pricePerGram}/g × ${state.qty})</span><span>${fmt(filamentCost * state.qty)}</span></div>
    <div class="cb-row"><span>2. ค่าไฟฟ้า (${state.powerWatt}W × ${time.toFixed(2)}ชม. × ฿${state.elecRate}/kWh × ${state.qty})</span><span>${fmt(electricityCost * state.qty)}</span></div>
    <div class="cb-row"><span>3. ค่าเครื่อง Fixed (${time.toFixed(2)}ชม. × ฿${state.machineRate}/ชม. × ${state.qty})</span><span>${fmt(machineCost * state.qty)}</span></div>
    <div class="cb-row"><span>4. ค่า Setup (ครั้งเดียว/ออเดอร์)</span><span>${fmt(state.setupFee)}</span></div>
    <div class="cb-row" style="border-top:1px dashed #ccc; padding-top:6px; margin-top:4px; font-weight:600;"><span>ยอดรวม</span><span>${fmt(subtotal)}</span></div>
    ${state.riskPct > 0 ? `<div class="cb-row"><span>5. ค่าความเสี่ยง (${state.riskPct}%)</span><span>${fmt(riskAmount)}</span></div>` : ''}
  </div>
  <div class="grand">
    <span>รวมทั้งสิ้น</span>
    <strong>${fmt(total)}</strong>
  </div>
</div>

<div class="notes">
  <h4>หมายเหตุ / Terms &amp; Conditions</h4>
  <ul>
    <li>ราคานี้ยืนราคา 30 วัน นับจากวันที่ออกใบเสนอราคา</li>
    <li>ระยะเวลาผลิต 3-7 วันทำการ หลังยืนยันการสั่งซื้อ</li>
    <li>ชำระเงินมัดจำ 50% ก่อนเริ่มงาน ส่วนที่เหลือชำระก่อนส่งมอบ</li>
    <li>ราคานี้เป็นการประมาณการ อาจเปลี่ยนแปลงตามความซับซ้อนของชิ้นงาน</li>
  </ul>
</div>

<div class="sign-row">
  <div class="sign-box">
    <div class="sign-line"></div>
    <div class="sign-label">ผู้เสนอราคา<br>วันที่ ____ / ____ / ________</div>
  </div>
  <div class="sign-box">
    <div class="sign-line"></div>
    <div class="sign-label">ผู้อนุมัติ / ลูกค้า<br>วันที่ ____ / ____ / ________</div>
  </div>
</div>

</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) {
    alert('กรุณาอนุญาต popup เพื่อเปิดใบเสนอราคา');
    return;
  }
  w.document.write(html);
  w.document.close();
}
