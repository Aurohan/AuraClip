@echo off
set "PATH=C:\Users\65638\.cargo\bin;%PATH%"
cd /d "D:\!PROJECT\tiez-clipboard"
pnpm exec tauri build --no-bundle --ignore-version-mismatches
