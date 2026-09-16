@echo off
rem ============================================================
rem  D&VFly - manda a versao nova para a VM.
rem
rem  Sao dois passos, e este arquivo faz o primeiro:
rem    1. AQUI: envia o codigo desta pasta para o GitHub.
rem    2. NA VM: clique no atalho "ATUALIZAR DVFly" (area de
rem       trabalho). Ele puxa, compila e reinicia - o banco e o
rem       .env da VM nao sao tocados.
rem
rem  Enquanto o passo 2 nao acontecer, o que esta no ar continua
rem  exatamente como esta. Fechar este computador nao derruba nada.
rem
rem  Primeira instalacao da VM: docs\HOSPEDAGEM.md
rem ============================================================
setlocal
cd /d "%~dp0"

echo.
echo  == DVFly: enviando o codigo para o GitHub...
echo.

where git >nul 2>nul
if errorlevel 1 goto falta_git

git push origin claude/dvfly-pagefly-research-skqx9r
if errorlevel 1 goto falha_push

echo.
echo  == Codigo enviado.
echo.
echo  AGORA, NA VM (Conexao de Area de Trabalho Remota):
echo    duplo clique em "ATUALIZAR DVFly", na area de trabalho.
echo.
echo  Ele mostra o que esta fazendo e avisa quando a versao nova
echo  estiver no ar. Leva menos de um minuto.
echo.
pause
exit /b 0

:falta_git
echo  O Git nao esta instalado. Instale de https://git-scm.com
pause
exit /b 1

:falha_push
echo.
echo  Nao consegui enviar o codigo para o GitHub. O texto acima diz
echo  o motivo - manda um print desta janela.
echo.
echo  Se falou em "rejected" ou "non-fast-forward", rode antes:
echo     git pull --rebase origin claude/dvfly-pagefly-research-skqx9r
pause
exit /b 1
