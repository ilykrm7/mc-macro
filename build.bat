@echo off
echo MC-Macro EXE derleniyor...
taskkill /f /im MC-Macro.exe 2>nul
python -m PyInstaller --onefile --windowed --name MC-Macro --add-data "ui;ui" --add-data "logo.ico;." --icon logo.ico --version-file version.txt --exclude-module PyQt5 --exclude-module PyQt6 --exclude-module PySide2 --exclude-module PySide6 --noconfirm main.py
echo.
echo Tamamlandi! dist\MC-Macro.exe olusturuldu.
pause
