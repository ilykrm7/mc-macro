"""
MC-Macro - Python <-> JS API Bridge
Auto-save settings, stream-hidden mode and panic lock.
Independent Sol Tık (LMB), Sağ Tık (RMB), and Oto-Yol (Bridge).
"""

import json, os, time, ctypes
from macro_engine import MacroEngine
from pynput import keyboard

SETTINGS_DIR  = os.path.join(os.environ.get("APPDATA", ""), "MC-Macro")
SETTINGS_FILE = os.path.join(SETTINGS_DIR, "settings.json")

DEFAULT_SETTINGS = {
    "lmb":    {"extra_clicks": 1, "cps": 14, "jitter": 2, "hold_ms": 28},
    "rmb":    {"extra_clicks": 1, "cps": 14, "jitter": 2, "hold_ms": 28},
    "bridge": {"cps": 14, "jitter": 2, "hold_ms": 28},
    "hotkeys": {"lmb": "f6", "rmb": "f7", "bridge": "r", "panic": "f12"},
    "stream_hidden": False,
    "language": "en",
}


def _load_settings() -> dict:
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        merged = json.loads(json.dumps(DEFAULT_SETTINGS))
        for k, v in data.items():
            if isinstance(v, dict) and k in merged:
                merged[k].update(v)
            else:
                merged[k] = v
        return merged
    except Exception:
        return json.loads(json.dumps(DEFAULT_SETTINGS))


def _save_settings(s: dict):
    try:
        os.makedirs(SETTINGS_DIR, exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(s, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


class MacroAPI:
    def __init__(self, window_ref_holder):
        self._wh        = window_ref_holder
        self._locked    = False
        self._is_licensed = True  # free release: no licensing
        self.engine     = MacroEngine(licensed=self._is_licensed)
        self._current_settings = _load_settings()
        self._apply_loaded()
        self._setup_hotkeys()

    # ── init ────────────────────────────────────────────────────────────

    def _apply_loaded(self):
        s = self._current_settings
        self.engine.apply_settings(s)
        hk = s.get("hotkeys", {})
        self._hk_lmb    = hk.get("lmb",    "f6").lower()
        self._hk_rmb    = hk.get("rmb",    "f7").lower()
        self._hk_bridge = hk.get("bridge", "r").lower()
        self._hk_panic  = hk.get("panic",  "f12").lower()
        self._stream_hidden = s.get("stream_hidden", False)

    def _setup_hotkeys(self):
        pressed_keys = set()

        def normalize_key(key) -> str:
            # 1. Special Key enum (e.g. Key.f1, Key.space, etc.)
            if hasattr(key, "name") and key.name:
                return key.name.lower()

            # 2. Virtual Key Code (vk) - Rock solid regardless of modifier keys
            vk = getattr(key, "vk", None)
            if vk is not None:
                # Letters A-Z (VK 65..90)
                if 65 <= vk <= 90:
                    return chr(vk).lower()
                # Digits 0-9 (VK 48..57)
                if 48 <= vk <= 57:
                    return chr(vk)
                # Numpad 0-9 (VK 96..105)
                if 96 <= vk <= 105:
                    return str(vk - 96)
                # Function keys F1-F24 (VK 112..135)
                if 112 <= vk <= 135:
                    return f"f{vk - 111}"
                # Common control/nav keys
                vk_map = {
                    32: "space", 13: "enter", 9: "tab", 27: "esc",
                    16: "shift", 17: "ctrl", 18: "alt", 20: "caps_lock",
                    8: "backspace", 46: "delete"
                }
                if vk in vk_map:
                    return vk_map[vk]

            # 3. Char attribute
            char = getattr(key, "char", None)
            if char:
                code = ord(char)
                # Ctrl+Letter codes: 1..26 -> 'a'..'z'
                if 1 <= code <= 26:
                    return chr(code + 96)
                return char.lower()

            # 4. Fallback string representation (e.g. '<82>')
            s = str(key).replace("Key.", "").lower()
            if s.startswith("<") and s.endswith(">"):
                try:
                    num = int(s[1:-1])
                    if 65 <= num <= 90:
                        return chr(num).lower()
                    if 48 <= num <= 57:
                        return chr(num)
                except Exception:
                    pass
            return s

        def on_press(key):
            try:
                k = normalize_key(key)
            except Exception:
                return

            if not k or k in pressed_keys:
                # Ignore Windows auto-repeat when key is held down
                return
            pressed_keys.add(k)

            if k == self._hk_panic:
                self._do_panic()
                return

            if self._locked or not self._is_licensed:
                return

            # Find all matching actions for this key
            matching = []
            if k == self._hk_lmb:    matching.append("lmb")
            if k == self._hk_rmb:    matching.append("rmb")
            if k == self._hk_bridge: matching.append("bridge")

            if matching:
                states = {
                    "lmb":    self.engine.lmb.armed,
                    "rmb":    self.engine.rmb.armed,
                    "bridge": self.engine.bridge.armed,
                }
                all_armed = all(states[m] for m in matching)
                new_state = not all_armed

                for m in matching:
                    if m == "lmb":       self.engine.arm_lmb(new_state)
                    elif m == "rmb":     self.engine.arm_rmb(new_state)
                    elif m == "bridge":  self.engine.arm_bridge(new_state)

                self._notify()

        def on_release(key):
            try:
                k = normalize_key(key)
                pressed_keys.discard(k)
            except Exception:
                pass

        self._kb = keyboard.Listener(on_press=on_press, on_release=on_release)
        self._kb.daemon = True
        self._kb.start()
        # #region agent log
        try:
            from macro_engine import _dbg
            import platform
            _dbg("C", "api.py:_setup_hotkeys", "keyboard LL hook started", {
                "platform": platform.platform(),
                "python": platform.python_version(),
            })
        except Exception:
            pass
        # #endregion

    def _do_panic(self):
        self.engine.stop_all()
        self._locked = True
        self._notify()

    def _notify(self):
        win = self._wh.get()
        if not win:
            return
        try:
            s = self.engine.get_status()
            s["panic_locked"] = self._locked
            s["is_licensed"]  = self._is_licensed
            win.evaluate_js(f"window.onStatusUpdate({json.dumps(s)})")
        except Exception:
            pass

    # ── STATUS (licensing removed in free release) ─────────────────────

    def open_pro_page(self) -> str:
        import webbrowser
        webbrowser.open("https://kerimeksi.com/mcmacro")
        return "ok"

    def open_website(self) -> str:
        import webbrowser
        webbrowser.open("https://kerimeksi.com")
        return "ok"

    def get_license_info(self) -> str:
        """Kept for UI compatibility; the app is always unlocked."""
        return json.dumps({"licensed": True, "hwid": ""})

    # ── SETTINGS & CONTROLS API ─────────────────────────────────────────

    def get_initial_settings(self) -> str:
        return json.dumps(self._current_settings)

    def apply_settings(self, settings_json: str) -> str:
        try:
            s = json.loads(settings_json)
            self._current_settings.update(s)
            self.engine.apply_settings(s)
            hk = s.get("hotkeys", {})
            if hk.get("lmb"):    self._hk_lmb    = hk["lmb"].lower()
            if hk.get("rmb"):    self._hk_rmb    = hk["rmb"].lower()
            if hk.get("bridge"): self._hk_bridge = hk["bridge"].lower()
            if hk.get("panic"):  self._hk_panic  = hk["panic"].lower()
            if "stream_hidden" in s:
                self._stream_hidden = bool(s["stream_hidden"])
                self._apply_stream_hidden(self._stream_hidden)
            _save_settings(self._current_settings)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def arm_lmb(self, armed: bool) -> str:
        if armed and self._locked:
            self._locked = False
        self.engine.arm_lmb(armed)
        self._notify()
        return json.dumps({"ok": True})

    def arm_rmb(self, armed: bool) -> str:
        if armed and self._locked:
            self._locked = False
        self.engine.arm_rmb(armed)
        self._notify()
        return json.dumps({"ok": True})

    def arm_bridge(self, armed: bool) -> str:
        if armed and self._locked:
            self._locked = False
        self.engine.arm_bridge(armed)
        self._notify()
        return json.dumps({"ok": True})

    def panic(self) -> str:
        self._do_panic()
        return json.dumps({"ok": True})

    def unlock(self) -> str:
        self._locked = False
        self._notify()
        return json.dumps({"ok": True})

    def get_status(self) -> str:
        s = self.engine.get_status()
        s["panic_locked"]  = self._locked
        s["is_licensed"]   = self._is_licensed
        s["stream_hidden"] = self._stream_hidden
        s["uptime"]        = 0
        return json.dumps(s)

    # ── stream hidden ────────────────────────────────────────────────────

    def _apply_stream_hidden(self, hidden: bool):
        """Hide/show window from screen capture (Windows 10 2004+)."""
        try:
            import win32gui
            hwnd = win32gui.FindWindow(None, "MC-Macro")
            if hwnd:
                WDA_EXCLUDEFROMCAPTURE = 0x00000011
                WDA_NONE               = 0x00000000
                affinity = WDA_EXCLUDEFROMCAPTURE if hidden else WDA_NONE
                ctypes.windll.user32.SetWindowDisplayAffinity(hwnd, affinity)
        except Exception:
            pass

    def set_stream_hidden(self, hidden: bool) -> str:
        self._stream_hidden = hidden
        self._current_settings["stream_hidden"] = hidden
        _save_settings(self._current_settings)
        self._apply_stream_hidden(hidden)
        return json.dumps({"ok": True})
