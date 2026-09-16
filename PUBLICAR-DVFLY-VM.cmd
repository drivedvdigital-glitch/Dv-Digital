@echo off
rem ============================================================
rem  D&VFly - publica uma versao nova na SUA VM.
rem
rem  O que acontece: o codigo desta pasta vai para o GitHub e a
rem  VM e mandada puxar essa versao e reconstruir os containers.
rem  O banco fica intacto (vive num volume, nao na imagem).
rem
rem  Antes da primeira vez: docs/HOSPEDAGEM.md, secao "Minha VM".
rem  O endereco da VM fica em publicar-vm.txt (ao lado deste
rem  arquivo), numa linha so, assim:  usuario@ip-ou-dominio
rem ============================================================
setlocal
cd /d "%~dp0"

if not exist "publicar-vm.txt" goto falta_config
set /p DVFLY_VM=<publicar-vm.txt

echo.
echo  == DVFly: publicando em %DVFLY_VM% ...
echo.

where git >nul 2>nul
if errorlevel 1 goto falta_git
where ssh >nul 2>nul
if errorlevel 1 goto falta_ssh

echo  1/2 - enviando o codigo para o GitHub...
git push origin claude/dvfly-pagefly-research-skqx9r
if errorlevel 1 goto falha_push

echo.
echo  2/2 - mandando a VM puxar e reconstruir...
ssh %DVFLY_VM% "cd ~/dvfly && git pull --ff-only && docker compose up -d --build && docker compose ps"
if errorlevel 1 goto falha_ssh_run

echo.
echo  == Pronto. A versao nova esta no ar.
echo  Confira a saude em: https://SEU-DOMINIO/healthz
echo.
pause
exit /b 0

:falta_config
echo  Falta o arquivo publicar-vm.txt com o endereco da VM.
echo  Crie um bloco de notas com UMA linha, por exemplo:
echo.
echo     root@203.0.113.10
echo.
echo  e salve como publicar-vm.txt nesta pasta.
pause
exit /b 1

:falta_git
echo  O Git nao esta instalado. Instale de https://git-scm.com
pause
exit /b 1

:falta_ssh
echo  O comando ssh nao existe nesta maquina. No Windows 10/11 ele
echo  se instala em Configuracoes - Aplicativos - Recursos
echo  opcionais - Cliente OpenSSH.
pause
exit /b 1

:falha_push
echo.
echo  Nao consegui enviar o codigo para o GitHub. Manda um print.
pause
exit /b 1

:falha_ssh_run
echo.
echo  A VM recusou ou a reconstrucao falhou. O texto acima diz o
echo  motivo - manda um print desta janela inteira.
pause
exit /b 1
