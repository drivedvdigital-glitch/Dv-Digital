@echo off
rem ============================================================
rem  D&VFly — sobe tudo com um duplo clique.
rem  Atualiza o codigo, prepara dependencias e banco, liga o
rem  servidor e o tunel, e mostra (e copia) o endereco publico.
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
node scripts\start.mjs

echo.
pause
