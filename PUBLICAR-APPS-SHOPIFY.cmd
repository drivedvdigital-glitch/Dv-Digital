@echo off
rem ============================================================
rem  D&VFly - manda a configuracao dos 3 apps para a Shopify.
rem
rem  Roda, em sequencia:
rem    shopify app deploy --config shopify.app.toml
rem    shopify app deploy --config shopify.app.colombia.toml
rem    shopify app deploy --config shopify.app.snevy.toml
rem
rem  Um app que falhar nao impede os outros; no fim aparece o
rem  resumo de cada um. A Shopify pode abrir o navegador para
rem  login e perguntar "Release a new version?": responda sim.
rem  Cada app mora numa organizacao da Shopify; se a conta logada
rem  nao for dela, o script sai da conta e pede o login de novo.
rem
rem  Sem blocos entre parenteses de proposito (ver INICIAR-DVFLY):
rem  um ")" num caminho ou num echo fecha o bloco antes da hora.
rem  ASCII puro, fim de linha CRLF.
rem ============================================================
setlocal
cd /d "%~dp0"

rem O Shopify CLI nao acha o TOML quando o caminho tem parentese
rem (ex.: C:\Users\Miguel (DV)\...). Nesse caso o script trabalha
rem por um atalho de pasta sem parentese: C:\DvDigital.
echo "%CD%" | findstr /C:"(" /C:")" >nul
if errorlevel 1 goto caminho_ok
if exist "C:\DvDigital\shopify.app.toml" goto usar_atalho
if exist "C:\DvDigital" goto atalho_ocupado
mklink /J "C:\DvDigital" "%CD%" >nul
if errorlevel 1 goto falha_atalho
:usar_atalho
cd /d "C:\DvDigital"
echo  == Usando C:\DvDigital, sem parentese no caminho.
:caminho_ok

where git >nul 2>nul
if errorlevel 1 goto falta_git
where npx >nul 2>nul
if errorlevel 1 goto falta_node

echo.
echo  == Pegando a versao mais nova do codigo...
git pull --rebase origin claude/dvfly-pagefly-research-skqx9r
if errorlevel 1 echo  AVISO: nao consegui atualizar o codigo. Sigo com o que esta nesta pasta.

findstr /C:"read_orders" shopify.app.toml >nul
if errorlevel 1 goto toml_velho

call :deploy shopify.app.toml principal R1
call :deploy shopify.app.colombia.toml colombia R2
call :deploy shopify.app.snevy.toml snevy R3

echo.
echo  ============================================================
echo   RESUMO
echo  ============================================================
echo    %R1%
echo    %R2%
echo    %R3%
echo.
echo  Falta so voce, uma vez por loja, no navegador:
echo    Abrir o DVFly no admin de cada loja e clicar em Aprovar
echo    quando a Shopify mostrar a permissao nova de pedidos.
echo    Ou: dev.shopify.com - o app - Instalar app - confirmar.
echo.
pause
exit /b 0

:deploy
echo.
echo  ============================================================
echo   App %2  -  %1
echo  ============================================================
if not exist "%1" goto deploy_sem_arquivo
call npx --yes @shopify/cli@latest app deploy --config %1
if errorlevel 1 goto deploy_trocar_conta
set "%3=OK      %2"
exit /b 0
:deploy_trocar_conta
rem Each app lives in its own Shopify organization, often under another
rem login. The usual failure is "You are not a member of the requested
rem organization": log out and try once more, so the browser asks which
rem account to use.
echo.
echo  ------------------------------------------------------------
echo   O app %2 nao abriu com a conta que esta logada agora.
echo   Vou sair dessa conta e tentar de novo: o navegador vai abrir.
echo   ENTRE COM A CONTA DA ORGANIZACAO DO APP %2.
echo  ------------------------------------------------------------
pause
call npx --yes @shopify/cli@latest auth logout
call npx --yes @shopify/cli@latest app deploy --config %1
if errorlevel 1 goto deploy_falhou
set "%3=OK      %2 - depois de trocar de conta"
exit /b 0
:deploy_falhou
set "%3=FALHOU  %2 - o motivo esta na tela acima"
exit /b 0
:deploy_sem_arquivo
set "%3=PULADO  %2 - o arquivo %1 nao existe"
exit /b 0

:toml_velho
echo.
echo  O shopify.app.toml desta pasta ainda nao tem a permissao de
echo  pedidos - o codigo esta desatualizado. Rode git pull e tente
echo  de novo, ou mande um print desta janela.
pause
exit /b 1

:atalho_ocupado
echo.
echo  O caminho desta pasta tem parentese, e o Shopify CLI nao
echo  funciona assim. Tentei criar o atalho C:\DvDigital, mas ja
echo  existe outra coisa com esse nome. Mande um print desta janela.
pause
exit /b 1

:falha_atalho
echo.
echo  Nao consegui criar o atalho C:\DvDigital. Mande um print.
pause
exit /b 1

:falta_git
echo  O Git nao esta instalado. Instale de https://git-scm.com
pause
exit /b 1

:falta_node
echo  O Node.js nao esta instalado. Instale de https://nodejs.org
pause
exit /b 1
