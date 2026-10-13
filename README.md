# MC-Macro

Windows için ücretsiz ve açık kaynaklı fare makro uygulaması. Python + pywebview ile yazılmıştır; arayüz HTML/CSS/JS'dir.

## ⚡ Özellikler

- **Sol Tık (LMB) Burst:** 1 fiziksel tıklamaya karşılık N adet ekstra tıklama üretir (basılı tutunca sonsuz tıklamaz).
- **Sağ Tık (RMB) Burst:** Sağ tık için bağımsız CPS, jitter ve burst ayarı.
- **Oto-Yol Modu:** Kapatılana kadar sürekli sağ tıklayan bağımsız mod.
- **Ortak / bağımsız kısayol tuşları:** Varsayılanlar: `F6` sol tık, `F7` sağ tık, `R` oto-yol, `F12` panik.
- **Yayıncı Gizleme:** OBS / Discord ekran paylaşımında pencere görünmez (Windows 10 2004+).
- **Panik Kilidi (F12):** Tek tuşla tüm makroları durdurur.
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

[MIT](LICENSE) © 2026 İlyas Kerim Ekşi
