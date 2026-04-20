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
const WASTE_FACTOR = 1.05;
const SHELL_VOLUME_RATIO = 0.15; // outer shell is always printed ~100%, about 15% of total
const DEFAULT_POWER = { FDM: 150, SLA: 80, SLS: 2000 }; // watt
const DEFAULT_ELEC_RATE = 4.5;  // ฿/kWh
const DEFAULT_LABOR_RATE = 200; // ฿/hr
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
  laborRate: DEFAULT_LABOR_RATE,
  file: null,
  bbox: null,
  customer: { name: '', phone: '', email: '', address: '' },
};

// ============= DOM =============
const $ = (id) => document.getElementById(id);

// ============= INIT =============
document.addEventListener('DOMContentLoaded', () => {
  renderMaterialSelect();
  renderMaterialCards();
  setupDropZone();
  setupForm();
  recalc();
});

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

function renderMaterialCards() {
  const container = $('materialCards');
  container.innerHTML = '';
  const all = [
    ...MATERIALS.FDM.map(m => ({...m, tech: 'FDM'})),
    ...MATERIALS.SLA.map(m => ({...m, tech: 'SLA'})),
    ...MATERIALS.SLS.map(m => ({...m, tech: 'SLS'})),
  ];
  all.forEach(m => {
    const card = document.createElement('div');
    card.className = 'mat-card';
    card.innerHTML = `
      <h4>${m.name}</h4>
      <div class="mat-desc">${m.tech} · ${m.density} g/cm³</div>
      <div class="mat-price">฿${m.pricePerGram}/g</div>
      <div class="mat-desc">${m.desc}</div>
    `;
    container.appendChild(card);
  });
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
        renderThumbnail(result.verts, result.bbox, $('thumbnail'));
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

// ============= THUMBNAIL RENDER =============
function renderThumbnail(verts, bbox, canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#fafbfd');
  grad.addColorStop(1, '#e4e8ef');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const triCount = verts.length / 9;
  if (triCount === 0) return;

  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const cz = (bbox.minZ + bbox.maxZ) / 2;

  // Isometric-ish rotation: 30° around Z, then 30° tilt around X
  const aZ = 30 * Math.PI / 180;
  const aX = 30 * Math.PI / 180;
  const cZ = Math.cos(aZ), sZ = Math.sin(aZ);
  const cX = Math.cos(aX), sX = Math.sin(aX);

  function project(x, y, z) {
    x -= cx; y -= cy; z -= cz;
    const x1 = x * cZ - y * sZ;
    const y1 = x * sZ + y * cZ;
    const y2 = y1 * cX - z * sX;
    const z2 = y1 * sX + z * cX;
    return [x1, -z2, y2]; // sx, sy (flip Y), depth
  }

  // Downsample big meshes
  const MAX_TRIS = 40000;
  const step = Math.max(1, Math.floor(triCount / MAX_TRIS));

  const tris = [];
  let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;

  for (let i = 0; i < triCount; i += step) {
    const o = i * 9;
    const ax = verts[o],   ay = verts[o+1], az = verts[o+2];
    const bx = verts[o+3], by = verts[o+4], bz = verts[o+5];
    const cxv = verts[o+6], cyv = verts[o+7], czv = verts[o+8];

    const A = project(ax, ay, az);
    const B = project(bx, by, bz);
    const C = project(cxv, cyv, czv);

    // Normal in model space
    const ex1 = bx - ax, ey1 = by - ay, ez1 = bz - az;
    const ex2 = cxv - ax, ey2 = cyv - ay, ez2 = czv - az;
    const nx = ey1 * ez2 - ez1 * ey2;
    const ny = ez1 * ex2 - ex1 * ez2;
    const nz = ex1 * ey2 - ey1 * ex2;
    const nL = Math.hypot(nx, ny, nz) || 1;
    // Rotate normal same as projection to get camera-space z
    const nx1 = nx * cZ - ny * sZ;
    const ny1 = nx * sZ + ny * cZ;
    const nz2 = ny1 * sX + nz * cX; // camera-space z after X rotation
    const intensity = Math.max(0.25, Math.abs(nz2 / nL));

    tris.push({ A, B, C, intensity, depth: (A[2]+B[2]+C[2])/3 });

    if (A[0] < sMinX) sMinX = A[0]; if (A[0] > sMaxX) sMaxX = A[0];
    if (B[0] < sMinX) sMinX = B[0]; if (B[0] > sMaxX) sMaxX = B[0];
    if (C[0] < sMinX) sMinX = C[0]; if (C[0] > sMaxX) sMaxX = C[0];
    if (A[1] < sMinY) sMinY = A[1]; if (A[1] > sMaxY) sMaxY = A[1];
    if (B[1] < sMinY) sMinY = B[1]; if (B[1] > sMaxY) sMaxY = B[1];
    if (C[1] < sMinY) sMinY = C[1]; if (C[1] > sMaxY) sMaxY = C[1];
  }

  // Fit to canvas
  const bw = sMaxX - sMinX, bh = sMaxY - sMinY;
  const scale = Math.min(W / bw, H / bh) * 0.85;
  const offX = W/2 - (sMinX + sMaxX)/2 * scale;
  const offY = H/2 - (sMinY + sMaxY)/2 * scale;

  // Painter's: back to front
  tris.sort((p, q) => p.depth - q.depth);

  // Draw
  for (const t of tris) {
    const lightness = Math.floor(25 + 50 * t.intensity);
    ctx.fillStyle = `hsl(22, 70%, ${lightness}%)`;
    ctx.beginPath();
    ctx.moveTo(t.A[0]*scale + offX, t.A[1]*scale + offY);
    ctx.lineTo(t.B[0]*scale + offX, t.B[1]*scale + offY);
    ctx.lineTo(t.C[0]*scale + offX, t.C[1]*scale + offY);
    ctx.closePath();
    ctx.fill();
  }
}

function clearThumbnail() {
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
  $('laborRate').addEventListener('input', (e) => {
    state.laborRate = parseFloat(e.target.value) || 0;
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

  const filamentCost = weight * state.pricePerGram * WASTE_FACTOR;
  const electricityCost = (state.powerWatt * time / 1000) * state.elecRate;
  const laborCost = time * state.laborRate;

  const perPiece = filamentCost + electricityCost + laborCost;
  const total = perPiece * state.qty;

  // Update UI
  $('outWeight').textContent = `${weight.toFixed(1)} g`;
  $('outTime').textContent = `${time.toFixed(2)} ชม.`;
  $('outQty').textContent = `${state.qty} ชิ้น`;

  $('costFilament').textContent = fmt(filamentCost * state.qty);
  $('costElectricity').textContent = fmt(electricityCost * state.qty);
  $('costLabor').textContent = fmt(laborCost * state.qty);
  $('total').textContent = fmt(total);
}

function fmt(n) {
  return '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function copyQuote() {
  const mat = getMaterial();
  const weight = calcWeight();
  const time = calcPrintTime();
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
    `ค่าแรง: ฿${state.laborRate}/ชม.`,
    `จำนวน: ${state.qty} ชิ้น`,
    '',
    `ค่าเส้นพลาสติก: ${$('costFilament').textContent}`,
    `ค่าไฟฟ้า: ${$('costElectricity').textContent}`,
    `ค่าแรงงาน: ${$('costLabor').textContent}`,
    `รวมทั้งสิ้น: ${$('total').textContent}`,
  ].join('\n');
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
  const filamentCost = weight * state.pricePerGram * WASTE_FACTOR;
  const electricityCost = (state.powerWatt * time / 1000) * state.elecRate;
  const laborCost = time * state.laborRate;
  const perPiece = filamentCost + electricityCost + laborCost;
  const total = perPiece * state.qty;

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
      <td class="num">${fmt(perPiece)}</td>
      <td class="num"><strong>${fmt(total)}</strong></td>
    </tr>
  </tbody>
</table>

<div class="summary-grid">
  <div class="cost-breakdown">
    <h4>รายละเอียดต้นทุน (ต่อชิ้น)</h4>
    <div class="cb-row"><span>ค่าเส้นพลาสติก (${weight.toFixed(1)}g × ฿${state.pricePerGram}/g + 5% waste)</span><span>${fmt(filamentCost)}</span></div>
    <div class="cb-row"><span>ค่าไฟฟ้า (${state.powerWatt}W × ${time.toFixed(2)}ชม. × ฿${state.elecRate}/kWh)</span><span>${fmt(electricityCost)}</span></div>
    <div class="cb-row"><span>ค่าแรงงาน (${time.toFixed(2)}ชม. × ฿${state.laborRate}/ชม.)</span><span>${fmt(laborCost)}</span></div>
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
