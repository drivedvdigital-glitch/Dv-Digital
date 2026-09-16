# Instala o D&VFly numa VM Windows nua, do zero, e deixa ele de pe sozinho.
#
# Roda quantas vezes quiser: o que ja existe e reaproveitado, nada e apagado.
#
# O que faz, em ordem:
#   1. instala o que falta (Git, Node LTS, Caddy) pelo winget
#   2. baixa o codigo em C:\dvfly
#   3. pergunta o dominio e as credenciais da Shopify (so na primeira vez)
#   4. compila e prepara o banco
#   5. registra duas tarefas do Windows (app e HTTPS) que sobem no boot e
#      se reerguem sozinhas se cairem
#   6. abre as portas 80 e 443 e confere que o app respondeu
#
# Escrito para o Windows PowerShell 5.1, que e o que vem na maquina - nada de
# sintaxe nova, senao quebra justamente na VM onde ninguem vai depurar.

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$Raiz = 'C:\dvfly'
$Repositorio = 'https://github.com/drivedvdigital-glitch/Dv-Digital.git'
$Branch = 'claude/dvfly-pagefly-research-skqx9r'
$Porta = 3000

function Passo($texto) {
    Write-Host ''
    Write-Host "== $texto" -ForegroundColor Green
}

function Aviso($texto) {
    Write-Host "   $texto" -ForegroundColor Yellow
}

function Existe($comando) {
    $antigo = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    $achou = Get-Command $comando -ErrorAction SilentlyContinue
    $ErrorActionPreference = $antigo
    return [bool]$achou
}

# O winget instala coisas que mexem no PATH; sem reler, o proprio script nao
# enxerga o que acabou de instalar.
function AtualizarPath() {
    $maquina = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $usuario = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$maquina;$usuario"
}

function Instalar($id, $comando, $nome) {
    if (Existe $comando) {
        Write-Host "   $nome ja esta instalado."
        return
    }
    Write-Host "   instalando $nome..."
    winget install --id $id --silent --accept-package-agreements --accept-source-agreements | Out-Null
    AtualizarPath
    if (-not (Existe $comando)) {
        throw "Instalei $nome mas o comando '$comando' nao apareceu. Feche esta janela, abra o PowerShell como administrador de novo e rode o instalador outra vez."
    }
}

Write-Host ''
Write-Host '  D&VFly - instalacao na VM' -ForegroundColor Cyan
Write-Host '  Esta janela vai fazer tudo. Leva uns 10 minutos na primeira vez.'

# ---- 1. o que falta na maquina ---------------------------------------------
Passo 'Conferindo o que falta instalar'
if (-not (Existe 'winget')) {
    throw 'Esta VM nao tem o winget (Instalador de Aplicativos). Instale-o pela Microsoft Store e rode o instalador de novo.'
}
Instalar 'Git.Git' 'git' 'Git'
Instalar 'OpenJS.NodeJS.LTS' 'node' 'Node.js'
Instalar 'CaddyServer.Caddy' 'caddy' 'Caddy (o HTTPS)'

# ---- 2. o codigo ------------------------------------------------------------
Passo "Baixando o codigo em $Raiz"
if (Test-Path (Join-Path $Raiz '.git')) {
    Push-Location $Raiz
    git fetch origin $Branch --quiet
    git checkout $Branch --quiet
    git reset --hard "origin/$Branch" --quiet
    Pop-Location
    Write-Host '   codigo atualizado.'
} else {
    git clone --branch $Branch $Repositorio $Raiz
    Write-Host '   codigo baixado.'
}

$ArquivoEnv = Join-Path $Raiz 'app\.env'

# ---- 3. as respostas que so voce sabe --------------------------------------
Passo 'Configuracao'

function ValorDoEnv($chave) {
    if (-not (Test-Path $ArquivoEnv)) { return '' }
    foreach ($linha in Get-Content $ArquivoEnv) {
        if ($linha -match "^\s*$chave\s*=\s*`"?([^`"]*)`"?\s*$") { return $Matches[1].Trim() }
    }
    return ''
}

function Perguntar($rotulo, $atual, $exemplo) {
    if ($atual -ne '') {
        Write-Host "   $rotulo ja configurado. Enter mantem o que esta la."
    }
    $resposta = Read-Host "   $rotulo $exemplo"
    if ($resposta.Trim() -eq '') { return $atual }
    return $resposta.Trim()
}

$Dominio = ValorDoEnv 'DVFLY_DOMAIN'
$ClientId = ValorDoEnv 'SHOPIFY_CLIENT_ID'
$ClientSecret = ValorDoEnv 'SHOPIFY_CLIENT_SECRET'
$Chave = ValorDoEnv 'DVFLY_TOKEN_KEY'

Write-Host ''
Write-Host '   O dominio e o endereco publico do app. Precisa ja estar apontando'
Write-Host '   para o IP desta VM (registro A no seu provedor de dominio).'
$Dominio = Perguntar 'Dominio' $Dominio '(ex.: app.seudominio.com):'
if ($Dominio -eq '') { throw 'Sem dominio nao da para ter HTTPS, e a Shopify so abre o app por HTTPS.' }

$ClientId = Perguntar 'Client ID da Shopify' $ClientId ':'
$ClientSecret = Perguntar 'Client secret da Shopify' $ClientSecret ':'
if ($ClientId -eq '' -or $ClientSecret -eq '') {
    throw 'Sem as credenciais do app, o D&VFly nao consegue falar com a Shopify. Elas estao no Dev Dashboard, em Client credentials.'
}

if ($Chave -eq '') {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $Chave = [Convert]::ToBase64String($bytes)
    Write-Host '   Gerei a chave que criptografa o acesso as lojas no banco.' -ForegroundColor Green
    Aviso 'Guarde uma copia dela (esta em app\.env). Trocar essa chave obriga cada loja a abrir o app de novo.'
}

# ---- 4. dependencias, banco e compilacao ------------------------------------
Passo 'Preparando o app (dependencias, banco e compilacao)'
Push-Location $Raiz

# O .env e escrito ANTES do setup: o banco e a compilacao leem dele.
$conteudo = @"
# Escrito pelo instalador da VM em $(Get-Date -Format 'dd/MM/yyyy HH:mm').
# Este arquivo nunca vai para o GitHub.
DATABASE_URL="file:./dvfly.db"
DVFLY_TOKEN_KEY="$Chave"
SHOPIFY_CLIENT_ID="$ClientId"
SHOPIFY_CLIENT_SECRET="$ClientSecret"
SHOPIFY_API_VERSION=""
DVFLY_DEV_ORIGINS=""
DVFLY_AUTH=""
DVFLY_ALLOWED_SHOPS=""
# Guardado aqui so para o instalador lembrar do dominio numa proxima rodada.
DVFLY_DOMAIN="$Dominio"
"@
Set-Content -Path $ArquivoEnv -Value $conteudo -Encoding ASCII

Write-Host '   instalando dependencias (a primeira vez demora)...'
cmd /c 'npm run setup' | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'npm run setup falhou.' }
cmd /c 'npm run build' | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'A compilacao falhou.' }
Pop-Location
Write-Host '   app compilado.'

# ---- 5. o HTTPS -------------------------------------------------------------
Passo 'Configurando o HTTPS (Caddy)'
$PastaCaddy = Join-Path $Raiz 'deploy\windows'
$Caddyfile = Join-Path $PastaCaddy 'Caddyfile.gerado'
$modelo = Get-Content (Join-Path $PastaCaddy 'Caddyfile.template') -Raw
$modelo = $modelo.Replace('{{DOMINIO}}', $Dominio).Replace('{{PORTA}}', "$Porta")
Set-Content -Path $Caddyfile -Value $modelo -Encoding ASCII
Write-Host "   Caddyfile escrito para $Dominio."

Passo 'Abrindo as portas 80 e 443 no firewall'
foreach ($porta in 80, 443) {
    $nome = "DVFly HTTPS $porta"
    netsh advfirewall firewall delete rule name="$nome" | Out-Null
    netsh advfirewall firewall add rule name="$nome" dir=in action=allow protocol=TCP localport=$porta | Out-Null
}
Write-Host '   portas liberadas.'

# ---- 6. as tarefas que mantem tudo de pe ------------------------------------
Passo 'Registrando as tarefas do Windows (sobem no boot, se reerguem sozinhas)'

function RegistrarTarefa($nome, $programa, $argumentos, $pasta) {
    $acao = New-ScheduledTaskAction -Execute $programa -Argument $argumentos -WorkingDirectory $pasta
    $gatilho = New-ScheduledTaskTrigger -AtStartup
    $conta = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    # Se o processo cair, o Windows reergue em 1 minuto, sem limite de vezes.
    $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
    if (Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $nome -Confirm:$false
    }
    Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Principal $conta -Settings $ajustes | Out-Null
    Start-ScheduledTask -TaskName $nome
    Write-Host "   $nome registrada e iniciada."
}

$caddy = (Get-Command caddy).Source
$pastaApp = Join-Path $Raiz 'app'

# As variaveis do app vivem no processo do app, nunca na maquina inteira: esta
# VM tem outros programas (AdsPower, flow-worker) e um NODE_ENV=production
# global mudaria o comportamento deles sem ninguem entender por que.
#
# O app escuta so em 127.0.0.1 - quem fala com o mundo e o Caddy, com TLS.
# Sem isso, daria para chegar nele pela porta $Porta sem passar pelo HTTPS.
$Runner = Join-Path $PastaCaddy 'rodar-app.gerado.cmd'
$runnerConteudo = @"
@echo off
rem Escrito pelo instalador. Nao edite: e reescrito a cada instalacao.
set NODE_ENV=production
set HOST=127.0.0.1
set PORT=$Porta
cd /d "$pastaApp"
node server.mjs
"@
Set-Content -Path $Runner -Value $runnerConteudo -Encoding ASCII

RegistrarTarefa 'DVFly App' "$env:SystemRoot\system32\cmd.exe" "/c `"$Runner`"" $pastaApp
RegistrarTarefa 'DVFly HTTPS' $caddy "run --config `"$Caddyfile`"" $PastaCaddy

# ---- 7. o atalho de atualizar ----------------------------------------------
Passo 'Criando o atalho ATUALIZAR na area de trabalho'
$atalho = Join-Path ([System.Environment]::GetFolderPath('CommonDesktopDirectory')) 'ATUALIZAR DVFly.lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($atalho)
$link.TargetPath = Join-Path $Raiz 'ATUALIZAR-NA-VM.cmd'
$link.WorkingDirectory = $Raiz
$link.Description = 'Puxa a versao nova do D&VFly e reinicia'
$link.Save()
Write-Host '   atalho criado.'

# ---- 8. a prova -------------------------------------------------------------
Passo 'Conferindo se o app respondeu'
$ok = $false
foreach ($tentativa in 1..20) {
    Start-Sleep -Seconds 3
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Porta/healthz" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) {
            Write-Host ''
            Write-Host ('   ' + $r.Content)
            $ok = $true
            break
        }
    } catch {
        Write-Host '   ainda subindo...'
    }
}

Write-Host ''
if ($ok) {
    Write-Host '  PRONTO. O D&VFly esta no ar nesta VM.' -ForegroundColor Green
    Write-Host ''
    Write-Host "  1. Confira de fora:  https://$Dominio/healthz"
    Write-Host '     (se nao abrir, o dominio ainda nao aponta para esta VM ou as'
    Write-Host '      portas 80/443 estao fechadas no painel do provedor)'
    Write-Host ''
    Write-Host '  2. Na SUA maquina, no shopify.app.toml, troque os dois enderecos por'
    Write-Host "     https://$Dominio  e rode:  npx shopify app deploy"
    Write-Host ''
    Write-Host '  3. Abra o app dentro do admin da loja. Ele se instala sozinho.'
    Write-Host ''
    Write-Host '  Para publicar uma versao nova: clique em ATUALIZAR DVFly, na area de trabalho.'
} else {
    Write-Host '  O app nao respondeu.' -ForegroundColor Red
    Write-Host '  Veja o que ele disse:'
    Write-Host '    Get-ScheduledTask "DVFly App" | Get-ScheduledTaskInfo'
    Write-Host "    cd $Raiz\app ; node server.mjs"
    Write-Host '  A segunda linha roda o app na sua frente e mostra o erro.'
}
Write-Host ''
