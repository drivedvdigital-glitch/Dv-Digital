@echo off
rem ============================================================
rem  D&VFly - publica uma versao nova no servidor (Vercel).
rem
rem  O servidor so muda quando voce roda ISTO. Enquanto nao rodar,
rem  o que esta no ar continua exatamente como esta - fechar o
rem  computador nao derruba nada.
rem
rem  Primeira vez: leia docs/HOSPEDAGEM.md (uma pagina, 10 min).
rem
rem  ASCII puro, CRLF, sem blocos entre parenteses: um ")" dentro
rem  de um echo fecha o bloco antes da hora e o cmd aborta tudo.
rem ============================================================
setlocal
cd /d "%~dp0"

echo.
echo  == DVFly: publicando no servidor...
echo.

where node >nul 2>nul
if errorlevel 1 goto falta_node

if not exist ".vercel\project.json" goto primeira_vez

echo  Enviando o codigo desta pasta para a Vercel e compilando la...
echo  Pode demorar uns 2 minutos na primeira vez.
echo.
call npx --yes vercel@latest deploy --prod
if errorlevel 1 goto falha_deploy

echo.
echo  == Pronto. A versao nova esta no ar.
echo.
echo  O endereco do app NAO muda entre publicacoes, entao nao e
echo  preciso mexer na Shopify. Abra o app dentro do admin para
echo  conferir; se algo parecer velho, atualize a pagina.
echo.
pause
exit /b 0

:primeira_vez
echo  Esta pasta ainda nao esta ligada a um projeto da Vercel.
echo  Vou fazer a ligacao agora - responda as perguntas na tela
echo  (entrar na conta, escolher o projeto, confirmar a pasta).
echo.
echo  IMPORTANTE: quando perguntar o diretorio do projeto
echo  ("In which directory is your code located?"), responda:  app
echo.
pause
call npx --yes vercel@latest login
if errorlevel 1 goto falha_deploy
call npx --yes vercel@latest link
if errorlevel 1 goto falha_deploy
echo.
echo  Ligado. Rode este arquivo de novo para publicar.
echo.
pause
exit /b 0

:falta_node
echo  O Node nao esta instalado nesta maquina. Instale de
echo  https://nodejs.org (versao LTS) e rode este arquivo de novo.
pause
exit /b 1

:falha_deploy
echo.
echo  A publicacao falhou. O texto acima diz o motivo - manda um
echo  print desta janela inteira.
echo.
echo  Erro comum: faltou alguma variavel no painel da Vercel
echo  (Settings - Environment Variables). A lista esta em
echo  docs/HOSPEDAGEM.md.
pause
exit /b 1
