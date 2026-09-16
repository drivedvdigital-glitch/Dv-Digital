@echo off
rem ============================================================
rem  D&VFly - puxa a versao nova e reinicia. RODA NA VM.
rem  E isto que o atalho "ATUALIZAR DVFly" da area de trabalho
rem  chama. Precisa de administrador: pede sozinho.
rem ============================================================
cd /d "%~dp0"
net session >nul 2>nul
if errorlevel 1 goto pedir_admin

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\atualizar.ps1"
pause
exit /b 0

:pedir_admin
powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
exit /b 0
