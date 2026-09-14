@echo off
rem ============================================================
rem  D&VFly — sobe tudo com um duplo clique.
rem  Prepara o projeto e abre o DVFly numa janela propria.
rem  Nessa janela NAO existe a pergunta "finalizar arquivo em
rem  lotes (S/N)" — Ctrl+C la dentro e inofensivo: o supervisor
rem  religa o que cair. Para desligar, FECHE a janela do DVFly.
rem ============================================================
setlocal
cd /d "%~dp0"

echo.
echo  == DVFly: atualizando o codigo...
git pull

echo.
echo  == DVFly: preparando dependencias e banco...
call npm run setup
if errorlevel 1 (
  echo.
  echo  Algo falhou no preparo. Manda um print desta janela.
  pause
  exit /b 1
)

echo.
echo  == DVFly: abrindo em janela propria...
start "DVFly (feche esta janela para desligar)" cmd /k node scripts\start.mjs
exit /b 0
