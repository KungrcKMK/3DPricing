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
const DEFAULT_SERVICE_RATE = 30; // ฿/hr — all-in overhead: depreciation + setup prep + maintenance
const DEFAULT_RISK_PCT = 0;      // % markup for difficult prints
const STORAGE_KEY_PRICES = '3dpricing:customPrices';

const COMPANY_STORAGE_KEY = '3dpricing.company';
const TELEGRAM_STORAGE_KEY = '3dpricing.telegram';

// ============= TELEGRAM DEFAULTS (hardcoded) =============
// NOTE: Token is visible to anyone with access to this public repo.
// If the bot gets abused, revoke via @BotFather → /revoke and update here.
const DEFAULT_TELEGRAM = {
  token: '8658376583:AAE6vzsrdzy-Tjib8UQ7EAitqvFxDa6Nf0M',
  chatId: '1153496371',
  enabled: true,
};

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
  serviceRate: DEFAULT_SERVICE_RATE,
  riskPct: DEFAULT_RISK_PCT,
  file: null,
  bbox: null,
  customer: { name: '', phone: '', email: '', address: '' },
  company: { name: '', addr1: '', addr2: '', phone: '', email: '', taxId: '' },
  telegram: { ...DEFAULT_TELEGRAM },
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
  loadCompany();
  setupCompanyForm();
  loadTelegram();
  setupTelegramForm();
  recalc();
});

function loadCompany() {
  try {
    const raw = localStorage.getItem(COMPANY_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.assign(state.company, saved);
    const map = { name: 'coName', addr1: 'coAddr1', addr2: 'coAddr2',
                  phone: 'coPhone', email: 'coEmail', taxId: 'coTaxId' };
    Object.entries(map).forEach(([k, id]) => {
      const el = $(id);
      if (el && state.company[k]) el.value = state.company[k];
    });
  } catch (err) { /* corrupted storage — ignore */ }
}

function setupCompanyForm() {
  const map = { coName: 'name', coAddr1: 'addr1', coAddr2: 'addr2',
                coPhone: 'phone', coEmail: 'email', coTaxId: 'taxId' };
  Object.entries(map).forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', (e) => {
      state.company[key] = e.target.value.trim();
      try { localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(state.company)); }
      catch (err) { /* storage full — ignore */ }
    });
  });
}

// ============= TELEGRAM =============
function loadTelegram() {
  // Start from hardcoded defaults, then allow localStorage override
  Object.assign(state.telegram, DEFAULT_TELEGRAM);
  try {
    const raw = localStorage.getItem(TELEGRAM_STORAGE_KEY);
    if (raw) Object.assign(state.telegram, JSON.parse(raw));
  } catch (err) { /* corrupted — ignore */ }
  if ($('tgBotToken')) $('tgBotToken').value = state.telegram.token || '';
  if ($('tgChatId')) $('tgChatId').value = state.telegram.chatId || '';
  if ($('tgEnabled')) $('tgEnabled').checked = !!state.telegram.enabled;
}

function saveTelegram() {
  try { localStorage.setItem(TELEGRAM_STORAGE_KEY, JSON.stringify(state.telegram)); }
  catch (err) { /* storage full — ignore */ }
}

function setupTelegramForm() {
  $('tgBotToken')?.addEventListener('input', (e) => {
    state.telegram.token = e.target.value.trim();
    saveTelegram();
  });
  $('tgChatId')?.addEventListener('input', (e) => {
    state.telegram.chatId = e.target.value.trim();
    saveTelegram();
  });
  $('tgEnabled')?.addEventListener('change', (e) => {
    state.telegram.enabled = e.target.checked;
    saveTelegram();
    toast(state.telegram.enabled ? '✅ เปิดใช้งาน Telegram แล้ว' : '⏸ ปิดการส่ง Telegram', 'info');
  });
  $('tgHelpBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    alert(
      '📘 วิธีตั้งค่า Telegram Bot\n\n' +
      '1️⃣ สร้างบอท\n' +
      '   • เปิด Telegram → ค้นหา @BotFather\n' +
      '   • พิมพ์คำสั่ง /newbot\n' +
      '   • ตั้งชื่อ (เช่น "3DPrint Quote")\n' +
      '   • ตั้ง username ลงท้ายด้วย "bot"\n' +
      '   • BotFather จะให้ Token หน้าตาแบบ\n     1234567890:ABCdefGHIJ...\n\n' +
      '2️⃣ หา Chat ID\n' +
      '   • ส่งข้อความใดๆ หาบอทที่เพิ่งสร้าง (ต้องกด Start ก่อน)\n' +
      '   • เปิดลิงก์ในเบราว์เซอร์:\n' +
      '     https://api.telegram.org/bot<TOKEN>/getUpdates\n' +
      '     (แทน <TOKEN> ด้วย Token ข้างบน)\n' +
      '   • มองหา "chat":{"id": 123456789 ...}\n' +
      '   • เลขนั้นคือ Chat ID\n\n' +
      '3️⃣ เอามากรอก + ติ๊ก "เปิดใช้งาน" + กด 🧪 ทดสอบส่ง\n\n' +
      '🔒 Token เก็บใน browser ของคุณเท่านั้น ไม่ส่งไปที่อื่น'
    );
  });
  $('tgTestBtn')?.addEventListener('click', async () => {
    if (!state.telegram.token || !state.telegram.chatId) {
      toast('❌ ยังไม่ได้กรอก Token หรือ Chat ID', 'error');
      return;
    }
    const btn = $('tgTestBtn');
    btn.disabled = true;
    btn.textContent = '⏳ กำลังส่ง...';
    try {
      await sendTelegramMessage(
        '🧪 <b>ทดสอบจาก 3D Print Pricing Calculator</b>\n' +
        'เชื่อมต่อ Telegram Bot สำเร็จแล้ว ✅\n' +
        `เวลา: ${new Date().toLocaleString('th-TH')}`
      );
      toast('✅ ส่งทดสอบสำเร็จ! ตรวจใน Telegram', 'success');
    } catch (err) {
      toast('❌ ส่งไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🧪 ทดสอบส่ง';
    }
  });
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${state.telegram.token}/sendMessage`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: state.telegram.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    throw new Error(data.description || `HTTP ${resp.status}`);
  }
  return data;
}

async function sendTelegramPhoto(dataUrl, caption) {
  if (!dataUrl) return null;
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append('chat_id', state.telegram.chatId);
  if (caption) form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('photo', blob, 'quote-thumb.png');
  const url = `https://api.telegram.org/bot${state.telegram.token}/sendPhoto`;
  const resp = await fetch(url, { method: 'POST', body: form });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    throw new Error(data.description || `HTTP ${resp.status}`);
  }
  return data;
}

function buildTelegramQuoteText(ctx) {
  // HTML parse mode — escape <>& if user data
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const c = state.customer;
  const co = state.company;
  const mat = getMaterial();
  const lines = [
    `📋 <b>ใบเสนอราคาใหม่</b>`,
    `🔖 <code>${esc(ctx.quoteNo)}</code>`,
    `📅 ${esc(ctx.dateStr)}`,
    '',
    // ---------- ผู้เสนอ (sender / company) ----------
    `🏢 <b>ผู้เสนอ</b>: ${esc(co.name || '—')}`,
  ];
  if (co.addr1) lines.push(`   📍 ${esc(co.addr1)}${co.addr2 ? ' ' + esc(co.addr2) : ''}`);
  else if (co.addr2) lines.push(`   📍 ${esc(co.addr2)}`);
  if (co.phone) lines.push(`   📞 ${esc(co.phone)}`);
  if (co.email) lines.push(`   📧 ${esc(co.email)}`);
  if (co.taxId) lines.push(`   🆔 ${esc(co.taxId)}`);
  lines.push('');
  // ---------- ผู้รับใบเสนอราคา (customer) ----------
  lines.push(`👤 <b>ผู้รับใบเสนอราคา</b>: ${esc(c.name || '—')}`);
  if (c.phone)   lines.push(`   📞 ${esc(c.phone)}`);
  if (c.email)   lines.push(`   📧 ${esc(c.email)}`);
  if (c.address) lines.push(`   📍 ${esc(c.address)}`);
  lines.push('');
  lines.push(
    `📦 <b>งาน</b>: ${esc(state.file ? state.file.name : 'manual input')}`,
    `🔧 ${esc(state.process)} · ${esc(mat.name)} · สี${esc($('color').value)}`,
    `⚙️ Infill ${state.infill}% · Layer ${state.layer}mm`
  );
  if (state.bbox) {
    lines.push(`📏 ขนาด ${state.bbox.x.toFixed(1)}×${state.bbox.y.toFixed(1)}×${state.bbox.z.toFixed(1)} mm`);
  }
  lines.push(
    `⚖️ น้ำหนัก ${ctx.weight.toFixed(1)} g · ⏱ ${ctx.time.toFixed(2)} ชม.`,
    `📊 จำนวน <b>${state.qty}</b> ชิ้น`,
    '',
    '💰 <b>ต้นทุน</b> (รวม qty):',
    `   • ค่าวัสดุ: ${fmt(ctx.filamentCost * state.qty)}`,
    `   • ค่าไฟ: ${fmt(ctx.electricityCost * state.qty)}`,
    `   • ค่าบริการเครื่อง: ${fmt(ctx.serviceCost * state.qty)}`,
    `   ─────────`,
    `   ยอดรวม: ${fmt(ctx.subtotal)}`,
  );
  if (state.riskPct > 0) {
    lines.push(`   • ค่าความเสี่ยง (${state.riskPct}%): ${fmt(ctx.riskAmount)}`);
  }
  lines.push('', `💵 <b>รวมทั้งสิ้น: ${fmt(ctx.total)}</b>`);
  return lines.join('\n');
}

async function sendQuoteToTelegram(ctx) {
  const text = buildTelegramQuoteText(ctx);
  await sendTelegramMessage(text);
  // Photo is optional — don't fail the whole flow if thumbnail missing
  const thumb = getThumbnailDataUrl();
  if (thumb) {
    try { await sendTelegramPhoto(thumb, `🖼 ชิ้นงาน ${ctx.quoteNo}`); }
    catch (err) { console.warn('Telegram photo failed:', err); }
  }
}

// ============= TOAST =============
function toast(message, type = 'info', duration = 3000) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

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
    opt.textContent = m.name;
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
// setPriceUI: write pricePerGram across all 4 fields (฿/g, ฿/kg, buyPrice, buyWeight stays)
// skipFields: array of ids to NOT overwrite (typically the field the user is typing in)
function setPriceUI(pricePerG, skipFields) {
  state.pricePerGram = pricePerG;
  const skip = new Set(skipFields || []);
  const ppg = $('pricePerGram');
  const ppk = $('pricePerKg');
  const bp  = $('buyPrice');
  const bw  = $('buyWeight');

  if (ppg && !skip.has('pricePerGram') && document.activeElement !== ppg) {
    ppg.value = pricePerG.toFixed(2);
  }
  if (ppk && !skip.has('pricePerKg') && document.activeElement !== ppk) {
    ppk.value = (pricePerG * 1000).toFixed(0);
  }
  // Back-fill buyPrice only if it already has a value (user already engaged that workflow).
  // If empty (placeholder shown), keep it empty — buyPrice stays user-driven.
  if (bp && bw && !skip.has('buyPrice') && document.activeElement !== bp
      && bp.value.trim() !== '') {
    const w = parseFloat(bw.value);
    if (isFinite(w) && w > 0) bp.value = (pricePerG * w).toFixed(2);
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

function drawThumbnail(opts) {
  opts = opts || {};
  const canvas = opts.canvas || $('thumbnail');
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
  const MAX_TRIS = (dragging && !opts.forceFullQuality) ? 25000 : 250000;
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

  // Hint overlay (only when idle, and not for offscreen renders like print)
  if (!dragging && !opts.hideHint) {
    ctx.fillStyle = 'rgba(107, 122, 143, 0.75)';
    ctx.font = '11px "Segoe UI", "Sarabun", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ลากเพื่อหมุน · ดับเบิลคลิก = รีเซ็ต', W - 8, H - 6);
  }
}

// Render a hi-res thumbnail to a data URL (for print/PDF)
function getThumbnailDataUrl() {
  if (!thumbnailState.verts || !thumbnailState.bbox) return '';
  const hires = document.createElement('canvas');
  hires.width = 640;
  hires.height = 480;
  try {
    drawThumbnail({ canvas: hires, forceFullQuality: true, hideHint: true });
    return hires.toDataURL('image/png');
  } catch (e) {
    console.warn('thumbnail capture failed:', e);
    return '';
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
  // ฿/g → sync ฿/kg + back-fill buyPrice
  $('pricePerGram').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isFinite(v) || v < 0) return;
    setPriceUI(v, ['pricePerGram']);
    saveCustomPrice(state.material, v);
    recalc();
  });
  // ฿/kg → sync ฿/g + back-fill buyPrice
  $('pricePerKg').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isFinite(v) || v < 0) return;
    const perG = v / 1000;
    setPriceUI(perG, ['pricePerKg']);
    saveCustomPrice(state.material, perG);
    recalc();
  });
  // buyPrice / buyWeight → compute ฿/g, sync ฿/kg
  function syncFromPurchase(skipId) {
    const price = parseFloat($('buyPrice').value);
    const weight = parseFloat($('buyWeight').value);
    if (!isFinite(price) || !isFinite(weight) || price <= 0 || weight <= 0) return;
    const perG = price / weight;
    setPriceUI(perG, [skipId]);
    saveCustomPrice(state.material, perG);
    recalc();
  }
  $('buyPrice').addEventListener('input', () => syncFromPurchase('buyPrice'));
  $('buyWeight').addEventListener('input', () => syncFromPurchase('buyWeight'));

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
    state.powerWatt = Math.max(0, parseFloat(e.target.value) || 0);
    recalc();
  });
  $('elecRate').addEventListener('input', (e) => {
    state.elecRate = Math.max(0, parseFloat(e.target.value) || 0);
    recalc();
  });
  $('serviceRate').addEventListener('input', (e) => {
    state.serviceRate = Math.max(0, parseFloat(e.target.value) || 0);
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
    const check = validateForQuote();
    if (check.errors.length > 0) {
      alert('⚠️ ยังสั่งซื้อไม่ได้:\n\n• ' + check.errors.join('\n• '));
      return;
    }
    const mat = getMaterial();
    const weight = calcWeight();
    const time = calcPrintTime();
    const summary = [
      '📋 ตรวจสอบก่อนยืนยันออเดอร์',
      '',
      `ไฟล์:     ${state.file ? state.file.name : '(manual input)'}`,
      `วัสดุ:     ${mat.name} (${state.process})`,
      `ปริมาตร:  ${state.volume.toFixed(2)} cm³`,
      `น้ำหนัก:  ${weight.toFixed(1)} g`,
      `เวลา:     ${time.toFixed(2)} ชม.`,
      `จำนวน:   ${state.qty} ชิ้น`,
      '',
      `ยอดรวม:  ${$('total').textContent}`,
    ];
    if (check.warnings.length > 0) {
      summary.push('', '⚠️  ข้อสังเกต:');
      check.warnings.forEach(w => summary.push('   • ' + w));
    }
    summary.push('', 'ต้องการยืนยันการสั่งซื้อใช่หรือไม่?');
    if (confirm(summary.join('\n'))) {
      alert('✅ ขอบคุณสำหรับออเดอร์!\n(ยังไม่ได้เชื่อมต่อระบบ payment)');
    }
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
  const serviceCost = time * state.serviceRate;

  const perPieceBase = filamentCost + electricityCost + serviceCost;
  const subtotal = perPieceBase * state.qty;
  const riskAmount = subtotal * (state.riskPct / 100);
  const total = subtotal + riskAmount;

  // Update UI
  $('outWeight').textContent = `${weight.toFixed(1)} g`;
  $('outTime').textContent = `${time.toFixed(2)} ชม.`;
  $('outQty').textContent = `${state.qty} ชิ้น`;

  $('costFilament').textContent = fmt(filamentCost * state.qty);
  $('costElectricity').textContent = fmt(electricityCost * state.qty);
  $('costService').textContent = fmt(serviceCost * state.qty);
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
    `ค่าบริการเครื่อง: ฿${state.serviceRate}/ชม.${state.riskPct > 0 ? ' · Risk: ' + state.riskPct + '%' : ''}`,
    `จำนวน: ${state.qty} ชิ้น`,
    '',
    `ค่าวัสดุ: ${$('costFilament').textContent}`,
    `ค่าไฟฟ้า: ${$('costElectricity').textContent}`,
    `ค่าบริการเครื่อง: ${$('costService').textContent}`,
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

function validateForQuote() {
  const errors = [];
  const warnings = [];

  if (state.volume <= 0) errors.push('ยังไม่ได้กรอก/อัปโหลดปริมาตรชิ้นงาน');
  const weight = calcWeight();
  const time = calcPrintTime();
  if (weight <= 0) errors.push('น้ำหนัก = 0 (เช็ค volume / density / infill)');
  if (time <= 0) errors.push('เวลาพิมพ์ = 0');
  if (state.qty < 1) errors.push('จำนวนต้องอย่างน้อย 1 ชิ้น');

  if (state.pricePerGram <= 0) warnings.push('ราคาวัสดุ ฿0/g → ค่าวัสดุเป็น 0');
  if (state.powerWatt <= 0 || state.elecRate <= 0) warnings.push('กำลังไฟ/ค่าไฟ = 0 → ค่าไฟเป็น 0');
  if (state.serviceRate <= 0) warnings.push('ค่าบริการเครื่อง ฿0/ชม. → ไม่มีการคืนทุนเครื่อง');
  if (state.riskPct > 30) warnings.push(`ค่าความเสี่ยง ${state.riskPct}% สูงผิดปกติ`);

  return { errors, warnings };
}

function printQuote() {
  const check = validateForQuote();
  if (check.errors.length > 0) {
    alert('⚠️ ยังสร้างใบเสนอราคาไม่ได้:\n\n• ' + check.errors.join('\n• '));
    return;
  }
  if (check.warnings.length > 0) {
    const proceed = confirm(
      '⚠️ พบข้อสังเกต:\n\n• ' + check.warnings.join('\n• ') +
      '\n\nต้องการสร้างใบเสนอราคาต่อไปหรือไม่?'
    );
    if (!proceed) return;
  }

  const mat = getMaterial();
  const weight = calcWeight();
  const time = calcPrintTime();
  const filamentCost = weight * state.pricePerGram;
  const electricityCost = (state.powerWatt * time / 1000) * state.elecRate;
  const serviceCost = time * state.serviceRate;
  const perPieceBase = filamentCost + electricityCost + serviceCost;
  const subtotal = perPieceBase * state.qty;
  const riskAmount = subtotal * (state.riskPct / 100);
  const total = subtotal + riskAmount;
  const perPieceDisplay = state.qty > 0 ? total / state.qty : 0;

  const now = new Date();
  const validUntil = new Date(now);
  validUntil.setDate(validUntil.getDate() + 30);
  const quoteNo = genQuoteNumber();

  const c = state.customer;
  const hasCustomer = c.name || c.phone || c.email || c.address;
  const thumbDataUrl = getThumbnailDataUrl();

  // Fire-and-forget background send to admin's Telegram — silent to end user.
  // Admin can inspect success/error via DevTools console.
  if (state.telegram.enabled && state.telegram.token && state.telegram.chatId) {
    sendQuoteToTelegram({
      quoteNo, dateStr: formatThaiDate(now),
      weight, time, filamentCost, electricityCost, serviceCost,
      subtotal, riskAmount, total,
    })
      .then(() => console.log('[tg] quote sent:', quoteNo))
      .catch(err => console.warn('[tg] send failed:', err.message));
  }

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบเสนอราคา ${quoteNo}</title>
<style>
  @page { margin: 1.2cm 1.4cm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: auto; }
  body { font-family: 'Sarabun','Segoe UI','Prompt',sans-serif; color: #2c3e50; font-size: 12px; line-height: 1.4; padding: 0; max-width: 820px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #ea5b0c; padding-bottom: 10px; margin-bottom: 12px; }
  .brand { display: flex; gap: 10px; align-items: center; }
  .logo { background: linear-gradient(135deg,#ea5b0c,#c74900); color: white; font-weight: 800; font-size: 16px; width: 42px; height: 42px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
  .brand-text h1 { font-size: 16px; color: #1a2332; }
  .brand-text p { font-size: 10.5px; color: #6b7a8f; }
  .company { text-align: right; font-size: 10.5px; color: #555; line-height: 1.45; }
  .company strong { font-size: 12px; color: #1a2332; display: block; margin-bottom: 2px; }
  .title { text-align: center; font-size: 20px; font-weight: 700; letter-spacing: 4px; color: #1a2332; margin: 10px 0 2px; }
  .title-en { text-align: center; font-size: 10.5px; color: #6b7a8f; letter-spacing: 3px; margin-bottom: 12px; }
  .meta { display: flex; justify-content: space-between; background: #fff3eb; border: 1px solid #ffd9bf; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 11.5px; }
  .meta strong { color: #c74900; margin-right: 6px; }
  .cust-box { border: 1px solid #e4e8ef; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
  .cust-box h3 { font-size: 10px; color: #6b7a8f; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .cust-box .cust-name { font-size: 13px; font-weight: 700; color: #1a2332; margin-bottom: 2px; }
  .cust-box .cust-detail { font-size: 11.5px; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; border: 1px solid #e4e8ef; }
  thead th { background: #ea5b0c; color: white; padding: 7px 10px; text-align: left; font-size: 11.5px; font-weight: 600; }
  thead th.num { text-align: right; }
  tbody td { padding: 9px 10px; border-bottom: 1px solid #e4e8ef; font-size: 11.5px; vertical-align: top; }
  tbody td.num { text-align: right; }
  tbody td .spec { font-size: 10.5px; color: #6b7a8f; margin-top: 3px; }
  .summary-grid { display: flex; gap: 12px; margin-bottom: 10px; align-items: stretch; }
  .cost-breakdown { flex: 1; background: #f8fafc; border: 1px solid #e4e8ef; padding: 10px 12px; border-radius: 6px; }
  .cost-breakdown h4 { font-size: 10.5px; color: #6b7a8f; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .cost-breakdown .cb-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; gap: 8px; }
  .grand { width: 260px; background: linear-gradient(135deg,#ea5b0c,#c74900); color: white; padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
  .grand span { font-size: 12px; opacity: 0.9; }
  .grand strong { font-size: 18px; }
  .notes { border-top: 1px dashed #ccc; padding-top: 8px; margin-top: 10px; font-size: 10.5px; color: #555; }
  .notes h4 { color: #1a2332; margin-bottom: 4px; font-size: 11.5px; }
  .notes ul { padding-left: 16px; }
  .notes li { padding: 1px 0; }
  .sign-row { display: flex; justify-content: space-around; margin-top: 24px; gap: 30px; page-break-inside: avoid; }
  .sign-box { flex: 1; text-align: center; }
  .sign-line { border-top: 1px solid #333; margin-bottom: 4px; padding-top: 24px; }
  .sign-label { font-size: 11px; color: #555; }
  .print-bar { position: fixed; top: 10px; right: 10px; background: #ea5b0c; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  .print-bar:hover { background: #c74900; }
  @media print {
    .print-bar { display: none; }
    body { padding: 0; }
    .summary-grid, .cost-breakdown, .grand, .notes, .sign-row, table { page-break-inside: avoid; }
  }
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
    <strong>${state.company.name || '[ชื่อร้าน/บริษัท]'}</strong>
    ${state.company.addr1 || '[ที่อยู่บรรทัด 1]'}<br>
    ${state.company.addr2 || '[ที่อยู่บรรทัด 2]'}<br>
    ${(state.company.phone || state.company.email) ? `
      ${state.company.phone ? 'โทร: ' + state.company.phone : ''}${state.company.phone && state.company.email ? ' · ' : ''}${state.company.email ? 'อีเมล: ' + state.company.email : ''}<br>
    ` : 'โทร: [0x-xxxx-xxxx] · อีเมล: [email]<br>'}
    เลขผู้เสียภาษี: ${state.company.taxId || '[x-xxxx-xxxxx-xx-x]'}
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
        ${thumbDataUrl ? `<img src="${thumbDataUrl}" alt="ชิ้นงาน" style="width:110px; height:82px; object-fit:contain; border:1px solid #e4e8ef; border-radius:5px; background:#fafbfd; display:block; margin-bottom:5px;">` : ''}
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
    <div class="cb-row"><span>3. ค่าบริการเครื่อง (${time.toFixed(2)}ชม. × ฿${state.serviceRate}/ชม. × ${state.qty})</span><span>${fmt(serviceCost * state.qty)}</span></div>
    <div class="cb-row" style="border-top:1px dashed #ccc; padding-top:6px; margin-top:4px; font-weight:600;"><span>ยอดรวม</span><span>${fmt(subtotal)}</span></div>
    ${state.riskPct > 0 ? `<div class="cb-row"><span>4. ค่าความเสี่ยง (${state.riskPct}%)</span><span>${fmt(riskAmount)}</span></div>` : ''}
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
