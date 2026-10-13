# MC-Macro

> **English:** Free, open-source mouse macro for Windows (MIT). The interface is available in **English (default) and Turkish** — switch it under *General Settings → Language*. Install: `pip install -r requirements.txt`, run: `python main.py`, build: `build.bat`.

Windows için ücretsiz ve açık kaynaklı fare makro uygulaması. Python + pywebview ile yazılmıştır; arayüz HTML/CSS/JS'dir.

## ⚡ Özellikler

- **Sol Tık (LMB) Burst:** 1 fiziksel tıklamaya karşılık N adet ekstra tıklama üretir (basılı tutunca sonsuz tıklamaz).
- **Sağ Tık (RMB) Burst:** Sağ tık için bağımsız CPS, jitter ve burst ayarı.
- **Oto-Yol Modu:** Kapatılana kadar sürekli sağ tıklayan bağımsız mod.
- **Ortak / bağımsız kısayol tuşları:** Varsayılanlar: `F6` sol tık, `F7` sağ tık, `R` oto-yol, `F12` panik.
- **Yayıncı Gizleme:** OBS / Discord ekran paylaşımında pencere görünmez (Windows 10 2004+).
- **Panik Kilidi (F12):** Tek tuşla tüm makroları durdurur.
- **İki dil (EN / TR):** Arayüz varsayılan olarak İngilizce; *General Settings → Language* bölümünden Türkçe seçilebilir, yeniden başlatmadan anında değişir ve seçim kaydedilir.
- Ayarlar otomatik olarak `%APPDATA%\MC-Macro\settings.json` dosyasına kaydedilir.

## 📋 Gereksinimler

- Windows 10/11
- Python 3.10+
- Microsoft Edge WebView2 Runtime (Windows 11'de hazır gelir)

## 🚀 Kurulum ve Çalıştırma

```bat
git clone https://github.com/<kullanici-adi>/MC-Macro.git
cd MC-Macro
pip install -r requirements.txt
python main.py
```

## 🛠️ EXE Derleme

```bat
build.bat
```

Çıktı: `dist\MC-Macro.exe` (PyInstaller, tek dosya). Alternatif olarak: `pyinstaller MC-Macro.spec`.

## ⚠️ Sorumluluk Reddi

Bu yazılım "olduğu gibi" sunulur. Makro/otomatik tıklama kullanımı bazı oyunların veya platformların kurallarına aykırı olabilir; kullanım sorumluluğu kullanıcıya aittir.

## 📄 Lisans

[MIT](LICENSE) © 2026 Kerim Ekşi — [kerimeksi.com](https://kerimeksi.com)
