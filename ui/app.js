"use strict";
/*
 * MC-Macro — UI Logic
 * 1. Left Click (LMB) — Burst
 * 2. Right Click (RMB) — Burst
 * 3. Auto-Bridge — Continuous Right Click
 * Multi-target shared hotkeys, EN/TR UI
 */

let lmbState        = "off"; // "off" | "armed" | "clicking"
let rmbState        = "off";
let bridgeState     = "off";
let panicLocked     = false;
let lang            = "en";
let listenKey       = null;
let applyTimer      = null;
let startTime       = Date.now();
let backendInitDone = false;

// ── FAST BACKEND INIT ───────────────────────────────────────────────────
window.onBackendLoaded = function(lic, s) {
  if (s)   loadSettingsIntoUI(typeof s === "string" ? JSON.parse(s) : s);
  backendInitDone = true;
};

// ── ASYNC API CHECKER & INITIALIZATION ───────────────────────────────────
async function tryInitFromApi() {
  if (backendInitDone) return true;
  if (!window.pywebview || !window.pywebview.api) return false;
  try {
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
  bindLanguage();
  applyLang();
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

// ── I18N (EN default / TR) ───────────────────────────────────────────────
const I18N = {
  en: {
    lockMsg: "Locked — hotkeys disabled", unlock: "UNLOCK",
    lmbTitle: "Left Click (LMB)", rmbTitle: "Right Click (RMB)", bridgeTitle: "Auto-Bridge",
    extraPerPress: "Extra Clicks / Press", speed: "Speed (CPS)", bridgeSpeed: "Bridge Speed (CPS Limit)",
    jitter: "Jitter (Human-like Clicking)", jOff: "Off (0%)", jLow: "Low (8%)", jMid: "Medium (15%) — Recommended", jHigh: "High (25%)",
    hotkey: "Activation Key", change: "Change", contRight: "Continuous Right Click",
    bridgeHint: "Press the key once: it right-clicks automatically until you press it again",
    general: "General Settings", panicKey: "Panic / Stop Key", streamHidden: "Stream Hidden Mode",
    streamHint: "When enabled, the window is hidden from Discord/OBS screen sharing",
    language: "Language", saved: "Settings saved", stop: "STOP", stopShort: "Stop",
    oneExtra: "1 extra click", nExtra: (n) => n + " extra clicks", double: "Double Click",
    safe: "✓ Safe", caution: "⚠ Caution", risk: "🔴 Risk",
    lmb: "Left Click", rmb: "Right Click", bridge: "Auto-Bridge",
    clicking: "CLICKING...", ready: "READY", off: "OFF", bridgeOn: "PLACING (ON)",
    stLocked: "Locked", stBridging: "Bridging", stClicking: "Clicking", stReady: "Ready", stIdle: "Idle",
    pressKey: "Press a key...",
  },
  tr: {
    lockMsg: "Kilitlendi — Kısayollar devre dışı", unlock: "KİLİDİ AÇ",
    lmbTitle: "Sol Tık (LMB)", rmbTitle: "Sağ Tık (RMB)", bridgeTitle: "Oto-Yol (Auto-Bridge)",
    extraPerPress: "Ek Tık / Basış", speed: "Hız (CPS)", bridgeSpeed: "Yol Hızı (CPS Sınırı)",
    jitter: "Jitter (İnsan Benzeri Tıklama)", jOff: "Kapalı (%0)", jLow: "Düşük (%8)", jMid: "Orta (%15) — Önerilen", jHigh: "Yüksek (%25)",
    hotkey: "Aktivasyon Tuşu", change: "Değiştir", contRight: "Sürekli Sağ Tık",
    bridgeHint: "Tuşa 1 kez bas: sen tekrar basana kadar otomatik sağ tıklar",
    general: "Genel Ayarlar", panicKey: "Panik / Durdur Tuşu", streamHidden: "Yayında Gizli Mod",
    streamHint: "Etkinleştirilirse Discord/OBS ekran paylaşımında pencere görünmez",
    language: "Dil", saved: "Ayarlar kaydedildi", stop: "DURDUR", stopShort: "Durdur",
    oneExtra: "1 ek tık", nExtra: (n) => n + " ek tık", double: "Çift Tıklama",
    safe: "✓ Güvenli", caution: "⚠ Dikkat", risk: "🔴 Risk",
    lmb: "Sol Tık", rmb: "Sağ Tık", bridge: "Oto-Yol",
    clicking: "TIKLIYOR...", ready: "HAZIR", off: "KAPALI", bridgeOn: "KOYUYOR (AÇIK)",
    stLocked: "Kilitlendi", stBridging: "Yol Yapılıyor", stClicking: "Tıklanıyor", stReady: "Hazır", stIdle: "Bekleniyor",
    pressKey: "Tuşa bas...",
  },
};

function t(key, arg) {
  const v = (I18N[lang] && I18N[lang][key]) ?? I18N.en[key] ?? key;
  return typeof v === "function" ? v(arg) : v;
}

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  refreshExtra("lmb"); refreshExtra("rmb");
  refreshCps("lmb"); refreshCps("rmb"); refreshBridgeCps();
  setLmbVisual(lmbState); setRmbVisual(rmbState); setBridgeVisual(bridgeState);
  updateHkSummary();
}

function bindLanguage() {
  const sel = document.getElementById("langSel");
  sel.value = lang;
  sel.addEventListener("change", () => {
    lang = sel.value === "tr" ? "tr" : "en";
    applyLang();
    debouncedApply();
  });
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

  // Language
  if (s.language === "en" || s.language === "tr") {
    lang = s.language;
    document.getElementById("langSel").value = lang;
    applyLang();
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
    valEl.textContent = t("oneExtra");
    if (badgeEl) badgeEl.textContent = t("double");
  } else {
    valEl.textContent = t("nExtra", n);
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
    risk.textContent = t("safe");
  } else if (v <= 26) {
    risk.classList.add("r-warn");
    risk.textContent = t("caution");
    sl.className = "warn";
  } else {
    risk.classList.add("r-bad");
    risk.textContent = t("risk");
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
    risk.textContent = t("safe");
  } else if (v <= 26) {
    risk.classList.add("r-warn");
    risk.textContent = t("caution");
    sl.className = "warn";
  } else {
    risk.classList.add("r-bad");
    risk.textContent = t("risk");
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
    language:      lang,
  };
}

function debouncedApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(async () => {
    if (!window.pywebview) return;
    try {
      await pywebview.api.apply_settings(JSON.stringify(collectSettings()));
      flashSaved();
    } catch(e) {}
  }, 350);
}

function flashSaved() {
  const el = document.getElementById("savedLbl");
  if (!el) return;
  el.classList.remove("hide");
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => el.classList.add("hide"), 1800);
}

// ── TOGGLE STATE ─────────────────────────────────────────────────────────
async function toggleLMB() {
  if (panicLocked) return;
  const next = lmbState === "off";
  if (window.pywebview) {
    await pywebview.api.arm_lmb(next);
  } else {
    setLmbVisual(next ? "armed" : "off");
  }
}

async function toggleRMB() {
  if (panicLocked) return;
  const next = rmbState === "off";
  if (window.pywebview) {
    await pywebview.api.arm_rmb(next);
  } else {
    setRmbVisual(next ? "armed" : "off");
  }
}

async function toggleBridge() {
  if (panicLocked) return;
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
    btn.textContent = "🟢 " + t("lmb") + " — " + t("clicking");
    card.classList.add("s-clicking");
  } else if (st === "armed") {
    btn.classList.add("s-armed");
    btn.textContent = "🟡 " + t("lmb") + " — " + t("ready");
    card.classList.add("s-armed");
  } else {
    btn.textContent = "▶ " + t("lmb") + " — " + t("off");
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
    btn.textContent = "🟢 " + t("rmb") + " — " + t("clicking");
    card.classList.add("s-clicking");
  } else if (st === "armed") {
    btn.classList.add("s-armed");
    btn.textContent = "🟡 " + t("rmb") + " — " + t("ready");
    card.classList.add("s-armed");
  } else {
    btn.textContent = "▶ " + t("rmb") + " — " + t("off");
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
    btn.textContent = "🟢 " + t("bridge") + " — " + t("bridgeOn");
    card.classList.add("s-clicking");
  } else {
    btn.textContent = "▶ " + t("bridge") + " — " + t("off");
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
    txt.textContent = t("stLocked");
  } else if (bridgeState === "armed" || bridgeState === "clicking") {
    pill.classList.add("active");
    sdot.classList.add("active");
    txt.textContent = t("stBridging");
  } else if (lmbState === "clicking" || rmbState === "clicking") {
    pill.classList.add("active");
    sdot.classList.add("active");
    txt.textContent = t("stClicking");
  } else if (lmbState === "armed" || rmbState === "armed") {
    pill.classList.add("armed");
    sdot.classList.add("armed");
    txt.textContent = t("stReady");
  } else {
    txt.textContent = t("stIdle");
  }
}

// ── STATUS UPDATE FROM PYTHON ────────────────────────────────────────────
window.onStatusUpdate = function(s) {
  if (!s) return;
  panicLocked = !!s.panic_locked;
  document.getElementById("lockBar").classList.toggle("show", panicLocked);

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
  input.value = t("pressKey");
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
    <span class="hk-item"><kbd class="hk-key">${lmb}</kbd>${t("lmb")}</span>
    <span class="hk-item"><kbd class="hk-key">${rmb}</kbd>${t("rmb")}</span>
    <span class="hk-item"><kbd class="hk-key">${bridge}</kbd>${t("bridge")}</span>
    <span class="hk-item"><kbd class="hk-key">${panic}</kbd>${t("stopShort")}</span>
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

// Copyright year: automatic from system date
(function(){var e=document.getElementById("copyYear");if(e)e.textContent=new Date().getFullYear();})();

// kerimeksi.com link opens in the default browser
(function(){var a=document.getElementById("siteLink");if(!a)return;a.addEventListener("click",function(ev){ev.preventDefault();if(window.pywebview&&window.pywebview.api&&window.pywebview.api.open_website){window.pywebview.api.open_website();}else{window.open("https://kerimeksi.com","_blank");}});})();
