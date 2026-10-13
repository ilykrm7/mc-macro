"use strict";
/*
 * MC-Macro — UI Logic
 * 1. Sol Tık (LMB) — Burst
 * 2. Sağ Tık (RMB) — Burst
 * 3. Oto-Yol (Bridge) — Continuous Right Click
 * Multi-target shared hotkeys and offline HWID licensing
 */

let lmbState        = "off"; // "off" | "armed" | "clicking"
let rmbState        = "off";
let bridgeState     = "off";
let panicLocked     = false;
let isLicensed      = false;
let listenKey       = null;
let applyTimer      = null;
let startTime       = Date.now();
let backendInitDone = false;

// ── FAST BACKEND INIT ───────────────────────────────────────────────────
window.onBackendLoaded = function(lic, s) {
  if (lic) handleLicenseStatus(typeof lic === "string" ? JSON.parse(lic) : lic);
  if (s)   loadSettingsIntoUI(typeof s === "string" ? JSON.parse(s) : s);
  backendInitDone = true;
};

// ── ASYNC API CHECKER & INITIALIZATION ───────────────────────────────────
async function tryInitFromApi() {
  if (backendInitDone) return true;
  if (!window.pywebview || !window.pywebview.api) return false;
  try {
    const rawLic = await pywebview.api.get_license_info();
    const lic    = typeof rawLic === "string" ? JSON.parse(rawLic) : rawLic;
    handleLicenseStatus(lic);

    const raw = await pywebview.api.get_initial_settings();
    const s   = typeof raw === "string" ? JSON.parse(raw) : raw;
    loadSettingsIntoUI(s);

    backendInitDone = true;
    return true;
  } catch(e) {
    return false;
  }
}

// Rapid polling check until pywebview is ready
let initTries = 0;
const initTimer = setInterval(async () => {
  initTries++;
  const ok = await tryInitFromApi();
  if (ok || initTries > 80) clearInterval(initTimer);
}, 40);

window.addEventListener("pywebviewready", tryInitFromApi);

window.addEventListener("DOMContentLoaded", () => {
  bindSliders();
  bindHotkeys();
  bindLicenseEvents();
  tryInitFromApi();
  startPoll();
  startUptime();

  window.addEventListener("blur", () => {
    document.body.classList.add("window-blurred");
  });
  window.addEventListener("focus", () => {
    document.body.classList.remove("window-blurred");
  });
});

// ── LICENSE HANDLING ─────────────────────────────────────────────────────
function handleLicenseStatus(lic) {
  if (!lic) return;
  isLicensed = !!lic.licensed;
  const overlay = document.getElementById("licOverlay");
  const badge   = document.getElementById("licBadge");
  const hwidVal = document.getElementById("licHwidVal");

  if (lic.hwid) {
    hwidVal.value = lic.hwid;
  }

  if (isLicensed) {
    overlay.classList.add("hide");
    badge.classList.remove("hide");
  } else {
    overlay.classList.remove("hide");
    badge.classList.add("hide");
  }
}

function bindLicenseEvents() {
  const keyInput = document.getElementById("licKeyInput");
  if (keyInput) {
    keyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitLicense();
      }
    });
  }
}

function copyHwid() {
  const el  = document.getElementById("licHwidVal");
  const btn = document.getElementById("licCopyBtn");
  if (!el.value || el.value.startsWith("Yükleniyor")) return;

  navigator.clipboard.writeText(el.value).then(() => {
    btn.textContent = "✓ Kopyalandı!";
    btn.style.color = "var(--green)";
    setTimeout(() => {
      btn.textContent = "📋 Kopyala";
      btn.style.color = "";
    }, 1800);
  }).catch(() => {
    el.select();
    document.execCommand("copy");
    btn.textContent = "✓ Kopyalandı!";
    setTimeout(() => { btn.textContent = "📋 Kopyala"; }, 1800);
  });
}

async function submitLicense() {
  const input = document.getElementById("licKeyInput");
  const key   = input.value.trim();
  const msgEl = document.getElementById("licMsg");

  if (!key) {
    msgEl.className = "lic-status-msg error";
    msgEl.textContent = "Lütfen lisans anahtarınızı giriniz!";
    msgEl.classList.remove("hide");
    return;
  }

  if (!window.pywebview || !window.pywebview.api) {
    msgEl.className = "lic-status-msg error";
    msgEl.textContent = "Uygulama API bağlantısı bekleniyor...";
    msgEl.classList.remove("hide");
    return;
  }

  try {
    const rawRes = await pywebview.api.activate_license(key);
    const res    = typeof rawRes === "string" ? JSON.parse(rawRes) : rawRes;

    if (res.ok) {
      isLicensed = true;
      msgEl.className = "lic-status-msg success";
      msgEl.textContent = res.message;
      msgEl.classList.remove("hide");
      setTimeout(() => {
        document.getElementById("licOverlay").classList.add("hide");
        document.getElementById("licBadge").classList.remove("hide");
      }, 1200);
    } else {
      msgEl.className = "lic-status-msg error";
      msgEl.textContent = res.message;
      msgEl.classList.remove("hide");
    }
  } catch(e) {
    msgEl.className = "lic-status-msg error";
    msgEl.textContent = "Doğrulama hatası: " + e;
    msgEl.classList.remove("hide");
  }
}

// ── LOAD SETTINGS INTO UI ────────────────────────────────────────────────
function loadSettingsIntoUI(s) {
  if (!s) return;
  const lmb    = s.lmb || {};
  const rmb    = s.rmb || {};
  const bridge = s.bridge || {};
  const hk     = s.hotkeys || {};

  // LMB
  if (lmb.extra_clicks) { document.getElementById("lmbExtra").value = lmb.extra_clicks; }
  if (lmb.cps)          { document.getElementById("lmbCps").value   = lmb.cps; }
  if (lmb.jitter != null) document.getElementById("lmbJitter").value = lmb.jitter;
  refreshExtra("lmb");
  refreshCps("lmb");

  // RMB
  if (rmb.extra_clicks) { document.getElementById("rmbExtra").value = rmb.extra_clicks; }
  if (rmb.cps)          { document.getElementById("rmbCps").value   = rmb.cps; }
  if (rmb.jitter != null) document.getElementById("rmbJitter").value = rmb.jitter;
  refreshExtra("rmb");
  refreshCps("rmb");

  // Bridge
  if (bridge.cps)          { document.getElementById("bridgeCps").value   = bridge.cps; }
  if (bridge.jitter != null) document.getElementById("bridgeJitter").value = bridge.jitter;
  refreshBridgeCps();

  // Hotkeys
  if (hk.lmb)    document.getElementById("lmbHotkey").value    = hk.lmb;
  if (hk.rmb)    document.getElementById("rmbHotkey").value    = hk.rmb;
  if (hk.bridge) document.getElementById("bridgeHotkey").value = hk.bridge;
  if (hk.panic)  document.getElementById("panicHotkey").value  = hk.panic;

  // Stream hidden
  if (s.stream_hidden != null) {
    document.getElementById("streamHidden").checked = s.stream_hidden;
  }

  updateHkSummary();
}

// ── SLIDERS ──────────────────────────────────────────────────────────────
function bindSliders() {
  document.getElementById("lmbExtra").addEventListener("input", () => { refreshExtra("lmb"); debouncedApply(); });
  document.getElementById("rmbExtra").addEventListener("input", () => { refreshExtra("rmb"); debouncedApply(); });
  document.getElementById("lmbCps").addEventListener("input",   () => { refreshCps("lmb");   debouncedApply(); });
  document.getElementById("rmbCps").addEventListener("input",   () => { refreshCps("rmb");   debouncedApply(); });
  document.getElementById("bridgeCps").addEventListener("input",() => { refreshBridgeCps();  debouncedApply(); });

  document.getElementById("lmbJitter").addEventListener("change", debouncedApply);
  document.getElementById("rmbJitter").addEventListener("change", debouncedApply);
  document.getElementById("bridgeJitter").addEventListener("change", debouncedApply);

  refreshExtra("lmb");
  refreshExtra("rmb");
  refreshCps("lmb");
  refreshCps("rmb");
  refreshBridgeCps();
}

function refreshExtra(side) {
  const n = +document.getElementById(side + "Extra").value;
  const valEl   = document.getElementById(side + "ExtraVal");
  const badgeEl = document.getElementById(side + "Badge");

  if (n === 1) {
    valEl.textContent = "1 ek tık";
    if (badgeEl) badgeEl.textContent = "Çift Tıklama";
  } else {
    valEl.textContent = n + " ek tık";
    if (badgeEl) badgeEl.textContent = (n + 1) + "x Burst";
  }
}

function refreshCps(side) {
  const v    = +document.getElementById(side + "Cps").value;
  const el   = document.getElementById(side + "CpsVal");
  const risk = document.getElementById(side + "Risk");
  const sl   = document.getElementById(side + "Cps");

  el.textContent = v + " CPS";
  sl.className = "";
  risk.className = "risk";

  if (v <= 16) {
    risk.classList.add("r-ok");
    risk.textContent = "✓ Güvenli";
  } else if (v <= 26) {
    risk.classList.add("r-warn");
    risk.textContent = "⚠ Dikkat";
    sl.className = "warn";
  } else {
    risk.classList.add("r-bad");
    risk.textContent = "🔴 Risk";
    sl.className = "danger";
  }
}

function refreshBridgeCps() {
  const v    = +document.getElementById("bridgeCps").value;
  const el   = document.getElementById("bridgeCpsVal");
  const risk = document.getElementById("bridgeRisk");
  const sl   = document.getElementById("bridgeCps");

  el.textContent = v + " CPS";
  sl.className = "";
  risk.className = "risk";

  if (v <= 16) {
    risk.classList.add("r-ok");
    risk.textContent = "✓ Güvenli";
  } else if (v <= 26) {
    risk.classList.add("r-warn");
    risk.textContent = "⚠ Dikkat";
    sl.className = "warn";
  } else {
    risk.classList.add("r-bad");
    risk.textContent = "🔴 Risk";
    sl.className = "danger";
  }
}

// ── COLLECT & APPLY SETTINGS ─────────────────────────────────────────────
function collectSettings() {
  return {
    lmb: {
      extra_clicks: +document.getElementById("lmbExtra").value,
      cps:          +document.getElementById("lmbCps").value,
      jitter:       +document.getElementById("lmbJitter").value,
      hold_ms:      28,
    },
    rmb: {
      extra_clicks: +document.getElementById("rmbExtra").value,
      cps:          +document.getElementById("rmbCps").value,
      jitter:       +document.getElementById("rmbJitter").value,
      hold_ms:      28,
    },
    bridge: {
      cps:          +document.getElementById("bridgeCps").value,
      jitter:       +document.getElementById("bridgeJitter").value,
      hold_ms:      28,
    },
    hotkeys: {
      lmb:    document.getElementById("lmbHotkey").value.trim().toLowerCase(),
      rmb:    document.getElementById("rmbHotkey").value.trim().toLowerCase(),
      bridge: document.getElementById("bridgeHotkey").value.trim().toLowerCase(),
      panic:  document.getElementById("panicHotkey").value.trim().toLowerCase(),
    },
    stream_hidden: document.getElementById("streamHidden").checked,
  };
}

function debouncedApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(async () => {
    if (!window.pywebview || !isLicensed) return;
    try {
      await pywebview.api.apply_settings(JSON.stringify(collectSettings()));
      flashSaved();
    } catch(e) {}
  }, 350);
}

function flashSaved() {
  const el = document.getElementById("autoSaveLbl");
  if (!el) return;
  el.textContent = "✓ Kaydedildi";
  el.style.color = "var(--green)";
  setTimeout(() => {
    if (el) el.textContent = "✓ Otomatik kaydediliyor";
  }, 1800);
}

// ── TOGGLE STATE ─────────────────────────────────────────────────────────
async function toggleLMB() {
  if (panicLocked || !isLicensed) return;
  const next = lmbState === "off";
  if (window.pywebview) {
    await pywebview.api.arm_lmb(next);
  } else {
    setLmbVisual(next ? "armed" : "off");
  }
}

async function toggleRMB() {
  if (panicLocked || !isLicensed) return;
  const next = rmbState === "off";
  if (window.pywebview) {
    await pywebview.api.arm_rmb(next);
  } else {
    setRmbVisual(next ? "armed" : "off");
  }
}

async function toggleBridge() {
  if (panicLocked || !isLicensed) return;
  const next = bridgeState === "off";
  if (window.pywebview) {
    await pywebview.api.arm_bridge(next);
  } else {
    setBridgeVisual(next ? "armed" : "off");
  }
}

function setLmbVisual(st) {
  lmbState = st;
  const btn  = document.getElementById("lmbBtn");
  const card = document.getElementById("lmbCard");
  btn.className  = "state-btn";
  card.className = "card";

  if (st === "clicking") {
    btn.classList.add("s-clicking");
    btn.textContent = "🟢 Sol Tık — TIKLIYOR...";
    card.classList.add("s-clicking");
  } else if (st === "armed") {
    btn.classList.add("s-armed");
    btn.textContent = "🟡 Sol Tık — HAZIR";
    card.classList.add("s-armed");
  } else {
    btn.textContent = "▶ Sol Tık — KAPALI";
  }
  updateGlobalPill();
}

function setRmbVisual(st) {
  rmbState = st;
  const btn  = document.getElementById("rmbBtn");
  const card = document.getElementById("rmbCard");
  btn.className  = "state-btn";
  card.className = "card";

  if (st === "clicking") {
    btn.classList.add("s-clicking");
    btn.textContent = "🟢 Sağ Tık — TIKLIYOR...";
    card.classList.add("s-clicking");
  } else if (st === "armed") {
    btn.classList.add("s-armed");
    btn.textContent = "🟡 Sağ Tık — HAZIR";
    card.classList.add("s-armed");
  } else {
    btn.textContent = "▶ Sağ Tık — KAPALI";
  }
  updateGlobalPill();
}

function setBridgeVisual(st) {
  bridgeState = st;
  const btn  = document.getElementById("bridgeBtn");
  const card = document.getElementById("bridgeCard");
  btn.className  = "state-btn";
  card.className = "card";

  if (st === "armed" || st === "clicking") {
    btn.classList.add("s-clicking");
    btn.textContent = "🟢 Oto-Yol — KOYUYOR (AÇIK)";
    card.classList.add("s-clicking");
  } else {
    btn.textContent = "▶ Oto-Yol — KAPALI";
  }
  updateGlobalPill();
}

function updateGlobalPill() {
  const pill = document.getElementById("statusPill");
  const sdot = document.getElementById("sdot");
  const txt  = document.getElementById("statusTxt");

  pill.className = "status-pill";
  sdot.className = "sdot";

  if (panicLocked) {
    pill.classList.add("locked");
    sdot.classList.add("locked");
    txt.textContent = "Kilitlendi";
  } else if (bridgeState === "armed" || bridgeState === "clicking") {
    pill.classList.add("active");
    sdot.classList.add("active");
    txt.textContent = "Yol Yapılıyor";
  } else if (lmbState === "clicking" || rmbState === "clicking") {
    pill.classList.add("active");
    sdot.classList.add("active");
    txt.textContent = "Tıklanıyor";
  } else if (lmbState === "armed" || rmbState === "armed") {
    pill.classList.add("armed");
    sdot.classList.add("armed");
    txt.textContent = "Hazır";
  } else {
    txt.textContent = "Bekleniyor";
  }
}

// ── STATUS UPDATE FROM PYTHON ────────────────────────────────────────────
window.onStatusUpdate = function(s) {
  if (!s) return;
  panicLocked = !!s.panic_locked;
  document.getElementById("lockBar").classList.toggle("show", panicLocked);

  if (s.is_licensed !== undefined) {
    handleLicenseStatus({ licensed: s.is_licensed });
  }

  if (panicLocked) {
    setLmbVisual("off");
    setRmbVisual("off");
    setBridgeVisual("off");
    updateGlobalPill();
    return;
  }

  // LMB
  if (s.lmb_clicking) setLmbVisual("clicking");
  else if (s.lmb_armed) setLmbVisual("armed");
  else setLmbVisual("off");

  // RMB
  if (s.rmb_clicking) setRmbVisual("clicking");
  else if (s.rmb_armed) setRmbVisual("armed");
  else setRmbVisual("off");

  // Bridge
  if (s.bridge_clicking || s.bridge_armed) setBridgeVisual("armed");
  else setBridgeVisual("off");
};

// ── PANIC / UNLOCK ───────────────────────────────────────────────────────
async function doPanic() {
  if (window.pywebview) {
    await pywebview.api.panic();
  } else {
    panicLocked = true;
    document.getElementById("lockBar").classList.add("show");
    setLmbVisual("off");
    setRmbVisual("off");
    setBridgeVisual("off");
    updateGlobalPill();
  }
}

async function doUnlock() {
  if (window.pywebview) {
    await pywebview.api.unlock();
  } else {
    panicLocked = false;
    document.getElementById("lockBar").classList.remove("show");
    updateGlobalPill();
  }
}

async function toggleStreamHidden() {
  const val = document.getElementById("streamHidden").checked;
  if (window.pywebview) {
    await pywebview.api.set_stream_hidden(val);
  }
}

// ── HOTKEY LISTENING ─────────────────────────────────────────────────────
function bindHotkeys() {
  document.getElementById("lmbHkBtn").addEventListener("click",    () => startListenKey("lmb"));
  document.getElementById("rmbHkBtn").addEventListener("click",    () => startListenKey("rmb"));
  document.getElementById("bridgeHkBtn").addEventListener("click", () => startListenKey("bridge"));
  document.getElementById("panicHkBtn").addEventListener("click",  () => startListenKey("panic"));

  window.addEventListener("keydown", (e) => {
    if (!listenKey) return;
    e.preventDefault();
    let k = e.key.toLowerCase();
    if (k === "escape") { stopListenKey(null); return; }
    stopListenKey(k);
  });
}

function startListenKey(target) {
  listenKey = target;
  const idMap = {
    lmb:    "lmbHotkey",
    rmb:    "rmbHotkey",
    bridge: "bridgeHotkey",
    panic:  "panicHotkey",
  };
  const input = document.getElementById(idMap[target]);
  input.classList.add("listening");
  input.value = "Tuşa bas...";
}

function stopListenKey(key) {
  const idMap = {
    lmb:    "lmbHotkey",
    rmb:    "rmbHotkey",
    bridge: "bridgeHotkey",
    panic:  "panicHotkey",
  };
  const input = document.getElementById(idMap[listenKey]);
  input.classList.remove("listening");
  if (key) {
    input.value = key;
    debouncedApply();
    updateHkSummary();
  }
  listenKey = null;
}

function updateHkSummary() {
  const lmb    = (document.getElementById("lmbHotkey").value    || "y").toUpperCase();
  const rmb    = (document.getElementById("rmbHotkey").value    || "y").toUpperCase();
  const bridge = (document.getElementById("bridgeHotkey").value || "r").toUpperCase();
  const panic  = (document.getElementById("panicHotkey").value  || "f12").toUpperCase();

  const el = document.getElementById("hkSummary");
  if (!el) return;
  el.innerHTML = `
    <span class="hk-item"><kbd class="hk-key">${lmb}</kbd>Sol Tık</span>
    <span class="hk-item"><kbd class="hk-key">${rmb}</kbd>Sağ Tık</span>
    <span class="hk-item"><kbd class="hk-key">${bridge}</kbd>Oto-Yol</span>
    <span class="hk-item"><kbd class="hk-key">${panic}</kbd>Durdur</span>
  `;
}

// ── POLL FALLBACK ────────────────────────────────────────────────────────
function startPoll() {
  setInterval(async () => {
    if (!window.pywebview || listenKey) return;
    try {
      const raw = await pywebview.api.get_status();
      const s   = JSON.parse(raw);
      window.onStatusUpdate(s);
    } catch(e) {}
  }, 1000);
}

// ── UPTIME ───────────────────────────────────────────────────────────────
function startUptime() {
  setInterval(() => {
    const sec = Math.floor((Date.now() - startTime) / 1000);
    const m   = String(Math.floor(sec / 60)).padStart(2, "0");
    const s   = String(sec % 60).padStart(2, "0");
    const el  = document.getElementById("uptime");
    if (el) el.textContent = `⏱ ${m}:${s}`;
  }, 1000);
}

// Telif yılı: bilgisayarın tarihinden otomatik
(function(){var e=document.getElementById("copyYear");if(e)e.textContent=new Date().getFullYear();})();
