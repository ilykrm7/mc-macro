"""
MC-Macro - Entry Point
"""
import sys, os
import webview
from api import MacroAPI

class WindowHolder:
    def __init__(self): self._w = None
    def set(self, w):   self._w = w
    def get(self):      return self._w

def resource(rel):
    base = sys._MEIPASS if getattr(sys, "frozen", False) else os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, rel)

if __name__ == "__main__":
    holder = WindowHolder()
    api    = MacroAPI(holder)
    window = webview.create_window(
        title            = "MC-Macro",
        url              = resource("ui/index.html"),
        js_api           = api,
        width            = 860,
        height           = 660,
        resizable        = False,
        on_top           = False,
        background_color = "#080b0f",
    )
    holder.set(window)

    def on_loaded():
        try:
            lic = api.get_license_info()
            s   = api.get_initial_settings()
            window.evaluate_js(f"if (window.onBackendLoaded) window.onBackendLoaded({lic}, {s});")
        except Exception:
            pass

    window.events.loaded += on_loaded
    webview.start(gui="edgechromium", icon=resource("logo.ico"), debug=False)
