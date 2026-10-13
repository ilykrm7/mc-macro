"""
MC-Macro - Human-like Mouse Click Engine
- Sol Tık (LMB): Per-click burst (1 physical tap = N extra clicks, no repeat)
- Sağ Tık (RMB): Per-click burst (1 physical tap = N extra clicks, no repeat)
- Oto-Yol (Bridge): Independent continuous auto-right-click loop until disarmed.
"""

import threading
import time
import random
import ctypes
import json
import os
import sys
from ctypes import wintypes
from pynput.mouse import Button, Controller as MouseController

# Enforce 1ms timer resolution on Windows to eliminate sleep drift and stutter
try:
    ctypes.windll.winmm.timeBeginPeriod(1)
except Exception:
    pass

GetAsyncKeyState = ctypes.windll.user32.GetAsyncKeyState
GetCursorPos = ctypes.windll.user32.GetCursorPos
VK_LBUTTON = 0x01
VK_RBUTTON = 0x02

mouse = MouseController()

# #region agent log
_DBG_LOCK = threading.Lock()
_DBG_SEND_COUNT = 0

def _cursor_xy():
    pt = wintypes.POINT()
    if GetCursorPos(ctypes.byref(pt)):
        return pt.x, pt.y
    return None, None

def _dbg(hypothesis_id, location, message, data=None):
    """Debug logging disabled in release builds (was writing debug-4994ab.log)."""
    return

def _logged_press(button):
    global _DBG_SEND_COUNT
    x0, y0 = _cursor_xy()
    mouse.press(button)
    x1, y1 = _cursor_xy()
    _DBG_SEND_COUNT += 1
    _dbg("A", "macro_engine.py:_logged_press", "synthetic press", {
        "button": str(button), "before": [x0, y0], "after": [x1, y1],
        "dx": None if x0 is None else x1 - x0, "dy": None if y0 is None else y1 - y0,
        "sendCount": _DBG_SEND_COUNT,
    })

def _logged_release(button):
    global _DBG_SEND_COUNT
    x0, y0 = _cursor_xy()
    mouse.release(button)
    x1, y1 = _cursor_xy()
    _DBG_SEND_COUNT += 1
    _dbg("A", "macro_engine.py:_logged_release", "synthetic release", {
        "button": str(button), "before": [x0, y0], "after": [x1, y1],
        "dx": None if x0 is None else x1 - x0, "dy": None if y0 is None else y1 - y0,
        "sendCount": _DBG_SEND_COUNT,
    })
# #endregion


def _jitter_delay(base_ms: float, jitter_level: int) -> float:
    """Return a jittered delay in seconds with Gaussian distribution."""
    factors = [0.0, 0.08, 0.15, 0.25]
    f = factors[min(max(0, jitter_level), 3)]
    base = max(0.004, base_ms / 1000.0)
    if f == 0:
        return base
    d = random.gauss(base, base * f)
    d = max(base * 0.4, min(base * 1.8, d))
    d += random.uniform(-0.002, 0.002)
    return max(0.005, d)


class ClickWorker:
    """
    Handles burst clicking for one mouse button upon physical press.
    Uses a single persistent worker thread waiting on an event to avoid
    thread creation overhead during fast clicking.
    """

    def __init__(self, button: Button):
        self.button = button
        self.extra_clicks = 1   # extra clicks per physical tap (1 = double click)
        self.cps = 14.0         # speed of the clicks (CPS equivalent)
        self.jitter_level = 2   # 0: Off, 1: Low, 2: Mid, 3: High
        self.hold_ms = 28       # ms mouse button is held down per synthetic click

        self._licensed = False
        self._armed = False
        self._firing = threading.Event()
        self._trigger_evt = threading.Event()
        self._shutdown_evt = threading.Event()

        # Dedicated persistent thread - zero thread creation during gameplay
        self._thread = threading.Thread(target=self._burst_loop, daemon=True)
        self._thread.start()

    def set_licensed(self, licensed: bool):
        self._licensed = licensed
        if not licensed:
            self.disarm()

    def arm(self):
        if not self._licensed or self._armed:
            return
        self._armed = True

    def disarm(self):
        self._armed = False
        self._firing.clear()
        self._trigger_evt.clear()

    @property
    def armed(self) -> bool:
        return self._armed

    @property
    def clicking(self) -> bool:
        return self._armed and self._firing.is_set()

    def trigger_burst(self):
        """Called upon physical button press in burst mode."""
        if not self._licensed or not self._armed or self._firing.is_set():
            return
        self._trigger_evt.set()

    def _burst_loop(self):
        while not self._shutdown_evt.is_set():
            # Block efficiently until a click arrives (0% CPU while idle)
            self._trigger_evt.wait()
            self._trigger_evt.clear()

            if self._shutdown_evt.is_set() or not self._licensed or not self._armed:
                continue

            self._firing.set()
            try:
                n = max(1, min(5, int(self.extra_clicks)))
                cycle_ms = 1000.0 / max(5.0, min(40.0, float(self.cps)))
                half_ms = cycle_ms * 0.5
                hold_ms = min(self.hold_ms, half_ms)

                for _ in range(n):
                    if not self._licensed or not self._armed or self._shutdown_evt.is_set():
                        break

                    gap_s = _jitter_delay(half_ms, self.jitter_level)
                    time.sleep(gap_s)

                    if not self._licensed or not self._armed or self._shutdown_evt.is_set():
                        break

                    hold_s = _jitter_delay(hold_ms, self.jitter_level)
                    _logged_press(self.button)
                    time.sleep(hold_s)
                    _logged_release(self.button)

                time.sleep(0.010)
            finally:
                self._firing.clear()


class BridgeWorker:
    """
    Dedicated continuous auto-clicker for bridging / placing blocks.
    When armed, automatically clicks Right Mouse Button until disarmed.
    Uses native Event.wait to eliminate busy-polling CPU consumption.
    """

    def __init__(self, button: Button = Button.right):
        self.button = button
        self.cps = 14.0
        self.jitter_level = 2
        self.hold_ms = 28

        self._licensed = False
        self._armed = False
        self._firing = threading.Event()
        self._stop_evt = threading.Event()
        self._thread: threading.Thread | None = None

    def set_licensed(self, licensed: bool):
        self._licensed = licensed
        if not licensed:
            self.disarm()

    def arm(self):
        if not self._licensed or self._armed:
            return
        self._armed = True
        self._stop_evt.clear()
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._thread.start()

    def disarm(self):
        self._armed = False
        self._stop_evt.set()
        self._firing.clear()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=0.1)
        self._thread = None

    @property
    def armed(self) -> bool:
        return self._armed

    @property
    def clicking(self) -> bool:
        return self._armed and self._firing.is_set()

    def _worker(self):
        self._firing.set()
        try:
            while self._licensed and self._armed and not self._stop_evt.is_set():
                cycle_ms = 1000.0 / max(5.0, min(40.0, float(self.cps)))
                half_ms = cycle_ms * 0.5
                hold_ms = min(self.hold_ms, half_ms)

                hold_s = _jitter_delay(hold_ms, self.jitter_level)
                _logged_press(self.button)
                if self._stop_evt.wait(timeout=hold_s):
                    _logged_release(self.button)
                    break
                _logged_release(self.button)

                gap_s = _jitter_delay(half_ms, self.jitter_level)
                # Native wait instead of time.sleep(0.003) busy polling loop
                if self._stop_evt.wait(timeout=gap_s):
                    break
        finally:
            self._firing.clear()


class MacroEngine:
    def __init__(self, licensed: bool = False):
        self._licensed = licensed
        self.lmb = ClickWorker(Button.left)
        self.rmb = ClickWorker(Button.right)
        self.bridge = BridgeWorker(Button.right)
        self.set_licensed(licensed)
        self._poller_stop = threading.Event()
        self._poller_thread = threading.Thread(target=self._mouse_poller_loop, daemon=True)
        self._poller_thread.start()
        # #region agent log
        _dbg("E", "macro_engine.py:MacroEngine.__init__", "engine started", {
            "licensed": licensed,
            "frozen": getattr(sys, "frozen", False),
            "winVer": sys.getwindowsversion()[:3] if hasattr(sys, "getwindowsversion") else None,
        })
        # #endregion

    def set_licensed(self, licensed: bool):
        self._licensed = licensed
        self.lmb.set_licensed(licensed)
        self.rmb.set_licensed(licensed)
        self.bridge.set_licensed(licensed)
        if not licensed:
            self.stop_all()

    def _mouse_poller_loop(self):
        """
        Zero-hook native physical mouse button detector using GetAsyncKeyState.
        100% eliminates WH_MOUSE_LL so the cursor/camera of the foreground app never spins or jumps.
        """
        was_l_down = bool(GetAsyncKeyState(VK_LBUTTON) & 0x8000)
        was_r_down = bool(GetAsyncKeyState(VK_RBUTTON) & 0x8000)
        # #region agent log
        last_xy = _cursor_xy()
        tick = 0
        # #endregion

        while not self._poller_stop.is_set():
            time.sleep(0.002)

            # #region agent log
            tick += 1
            if tick % 100 == 0:  # ~200ms
                xy = _cursor_xy()
                dx = dy = None
                if last_xy[0] is not None and xy[0] is not None:
                    dx = xy[0] - last_xy[0]
                    dy = xy[1] - last_xy[1]
                if dx is not None and (abs(dx) >= 2 or abs(dy) >= 2):
                    _dbg("B", "macro_engine.py:_mouse_poller_loop", "cursor delta while app open", {
                        "xy": list(xy), "dx": dx, "dy": dy,
                        "licensed": self._licensed,
                        "lmb_armed": self.lmb.armed, "rmb_armed": self.rmb.armed,
                        "bridge_armed": self.bridge.armed,
                        "lmb_firing": self.lmb._firing.is_set(),
                        "rmb_firing": self.rmb._firing.is_set(),
                        "bridge_firing": self.bridge._firing.is_set(),
                        "sendCount": _DBG_SEND_COUNT,
                        "l_down": bool(GetAsyncKeyState(VK_LBUTTON) & 0x8000),
                        "r_down": bool(GetAsyncKeyState(VK_RBUTTON) & 0x8000),
                    })
                last_xy = xy
            # #endregion

            if not self._licensed:
                was_l_down = bool(GetAsyncKeyState(VK_LBUTTON) & 0x8000)
                was_r_down = bool(GetAsyncKeyState(VK_RBUTTON) & 0x8000)
                continue

            l_down = bool(GetAsyncKeyState(VK_LBUTTON) & 0x8000)
            r_down = bool(GetAsyncKeyState(VK_RBUTTON) & 0x8000)

            # Left Click Edge Detection (physical press)
            if l_down and not was_l_down:
                if self.lmb.armed and not self.lmb._firing.is_set():
                    # #region agent log
                    _dbg("D", "macro_engine.py:_mouse_poller_loop", "LMB edge -> burst", {
                        "armed": True, "cursor": list(_cursor_xy()),
                    })
                    # #endregion
                    self.lmb.trigger_burst()

            # Right Click Edge Detection (physical press)
            if r_down and not was_r_down:
                if self.rmb.armed and not self.rmb._firing.is_set():
                    # #region agent log
                    _dbg("D", "macro_engine.py:_mouse_poller_loop", "RMB edge -> burst", {
                        "armed": True, "cursor": list(_cursor_xy()),
                    })
                    # #endregion
                    self.rmb.trigger_burst()

            was_l_down = l_down
            was_r_down = r_down

    def apply_settings(self, s: dict):
        for worker, key in [(self.lmb, "lmb"), (self.rmb, "rmb")]:
            cfg = s.get(key, {})
            worker.extra_clicks = max(1, min(5, int(cfg.get("extra_clicks", 1))))
            worker.cps          = max(5.0, min(40.0, float(cfg.get("cps", 14))))
            worker.jitter_level = int(cfg.get("jitter", 2))
            worker.hold_ms      = int(cfg.get("hold_ms", 28))

        b_cfg = s.get("bridge", {})
        self.bridge.cps          = max(5.0, min(40.0, float(b_cfg.get("cps", 14))))
        self.bridge.jitter_level = int(b_cfg.get("jitter", 2))
        self.bridge.hold_ms      = int(b_cfg.get("hold_ms", 28))

    def arm_lmb(self, armed: bool):
        if not self._licensed:
            return
        # #region agent log
        _dbg("D", "macro_engine.py:arm_lmb", "arm toggle", {"armed": armed})
        # #endregion
        self.lmb.arm() if armed else self.lmb.disarm()

    def arm_rmb(self, armed: bool):
        if not self._licensed:
            return
        # #region agent log
        _dbg("D", "macro_engine.py:arm_rmb", "arm toggle", {"armed": armed})
        # #endregion
        self.rmb.arm() if armed else self.rmb.disarm()

    def arm_bridge(self, armed: bool):
        if not self._licensed:
            return
        # #region agent log
        _dbg("D", "macro_engine.py:arm_bridge", "arm toggle", {"armed": armed})
        # #endregion
        self.bridge.arm() if armed else self.bridge.disarm()

    def stop_all(self):
        self.lmb.disarm()
        self.rmb.disarm()
        self.bridge.disarm()

    def get_status(self) -> dict:
        return {
            "lmb_armed":       self.lmb.armed,
            "lmb_clicking":    self.lmb.clicking,
            "rmb_armed":       self.rmb.armed,
            "rmb_clicking":    self.rmb.clicking,
            "bridge_armed":    self.bridge.armed,
            "bridge_clicking": self.bridge.clicking,
        }
