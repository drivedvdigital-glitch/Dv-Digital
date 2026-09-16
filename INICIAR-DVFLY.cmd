@echo off
rem ============================================================
rem  D&VFly - sobe tudo com um duplo clique.
rem  Prepara o projeto e abre o DVFly numa janela propria.
rem  Nessa janela NAO existe a pergunta "finalizar arquivo em
rem  lotes (S/N)" - Ctrl+C la dentro e inofensivo: o supervisor
rem  religa o que cair. Para desligar, FECHE a janela do DVFly.
rem
rem  Este arquivo e ASCII puro, com fim de linha CRLF, e nao usa
rem  blocos entre parenteses: um ")" dentro de um echo fecha o
rem  bloco antes da hora e o cmd aborta o arquivo inteiro - foi
rem  exatamente isso que o fez "fechar na hora" em 16/09.
rem ============================================================
setlocal
cd /d "%~dp0"

echo.
echo  == DVFly: atualizando o codigo...
rem Sempre a branch de trabalho, e com rebase: um merge local silencioso
rem e o que deixa a maquina com um historico que ninguem mais tem.
git checkout -q claude/dvfly-pagefly-research-skqx9r
rem Arquivos do projeto alterados nesta maquina (o npm mexe no package-lock,
rem o Windows troca fim de linha) travariam o rebase. Ficam guardados no
rem "git stash" - nada se perde, "git stash list" mostra - e o codigo entra.
git diff --quiet
if errorlevel 1 goto guardar
:puxar
git pull --rebase origin claude/dvfly-pagefly-research-skqx9r
if errorlevel 1 goto falha_git
goto preparar

:guardar
echo  Achei mudancas locais em arquivos do projeto. Guardando em "git stash"
echo  para o codigo novo entrar. Nada e apagado.
git stash push -m "DVFly: mudanca local guardada automaticamente"
goto puxar

:preparar

echo.
echo  == DVFly: preparando dependencias e banco...
call npm run setup
if errorlevel 1 goto falha_setup

echo.
echo  == DVFly: abrindo em janela propria...
start "DVFly (feche esta janela para desligar)" cmd /k node scripts\start.mjs
exit /b 0

:falha_git
echo.
echo  Nao consegui atualizar o codigo: sem internet, ou mudanca local
echo  nao salva. Manda um print desta janela.
pause
exit /b 1

:falha_setup
echo.
echo  Algo falhou no preparo. Manda um print desta janela.
pause
exit /b 1
