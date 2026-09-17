# Acrescenta um app da Shopify a esta instalacao do D&VFly.
#
# Existe porque a distribuicao custom da Shopify amarra um app a UMA loja: uma
# segunda loja sua, em outra organizacao, so consegue instalar um SEGUNDO app,
# com outro Client ID e outro secret. Este script poe esse par no .env e
# reinicia o app - as duas lojas passam a viver no mesmo D&VFly, com as mesmas
# paginas, marcaveis juntas em "Publicar em".

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'
$Raiz = 'C:\dvfly'
$ArquivoEnv = Join-Path $Raiz 'app\.env'

function Passo($texto) {
    Write-Host ''
    Write-Host "== $texto" -ForegroundColor Green
}

if (-not (Test-Path $ArquivoEnv)) {
    throw "Nao achei $ArquivoEnv. Rode o instalador primeiro (docs\HOSPEDAGEM.md)."
}
. (Join-Path $Raiz 'deploy\windows\comum.ps1')

<# O primeiro numero de app ainda livre no .env (SHOPIFY_CLIENT_ID_2, _3, ...). #>
function ProximoNumero($linhas) {
    for ($n = 2; $n -le 9; $n++) {
        $usado = $false
        foreach ($linha in $linhas) {
            if ($linha -match "^\s*SHOPIFY_CLIENT_ID_$n\s*=\s*`"?[^`"\s]") { $usado = $true }
        }
        if (-not $usado) { return $n }
    }
    throw 'Nove apps ja e demais. Se voce precisa disso, o caminho e a App Store, nao mais um app custom.'
}

Write-Host ''
Write-Host '  D&VFly - acrescentar um app da Shopify' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Use isto quando uma loja SUA nao puder instalar o app atual (a Shopify'
Write-Host '  amarra um app custom a uma loja so). No Dev Dashboard, crie um app novo'
Write-Host '  para essa loja e traga as credenciais dele para ca.'
Write-Host ''
Write-Host '  ATENCAO: no app novo, o App URL tem que ser o MESMO endereco deste'
Write-Host '  servidor, e o redirect URL o mesmo com /app no fim.'
Write-Host ''

$linhas = @(Get-Content $ArquivoEnv)
$numero = ProximoNumero $linhas

Write-Host "   Client ID do app novo  (Dev Dashboard - Client credentials)" -ForegroundColor Cyan
$clientId = (Read-Host '   digite e pressione Enter').Trim()
Write-Host ''
Write-Host "   Client secret do app novo  (comeca com shpss_)" -ForegroundColor Cyan
$clientSecret = (Read-Host '   digite e pressione Enter').Trim()

if ($clientId -eq '' -or $clientSecret -eq '') { throw 'Sem o par completo nao da para atender o app novo.' }
if ($clientId.Contains('"') -or $clientSecret.Contains('"')) {
    throw 'Credencial com aspas duplas (") nao cabe no .env. Confira se voce copiou o valor certo.'
}
foreach ($linha in $linhas) {
    if ($linha -match "^\s*SHOPIFY_CLIENT_ID(_\d)?\s*=\s*`"?$([regex]::Escape($clientId))`"?\s*$") {
        throw "Este Client ID ja esta configurado aqui ($($linha.Trim())). Nada a fazer."
    }
}

Passo "Escrevendo o app numero $numero no app\.env"
$linhas += "SHOPIFY_CLIENT_ID_$numero=`"$clientId`""
$linhas += "SHOPIFY_CLIENT_SECRET_$numero=`"$clientSecret`""
Set-Content -Path $ArquivoEnv -Value $linhas -Encoding ASCII
Write-Host '   escrito.'

# O .env e lido quando o app sobe: sem reiniciar, o par novo fica no arquivo e
# o processo continua atendendo so o app antigo.
Passo 'Reiniciando o app'
$porta = PortaDoRunner $Raiz '3000'
PararApp $porta
IniciarApp
$ok = EsperarApp $porta 15

Write-Host ''
if (-not $ok) {
    Write-Host '  O app nao respondeu depois de reiniciar.' -ForegroundColor Red
    MostrarLog $Raiz 25
    Write-Host ''
    Write-Host '  Se o erro falar de SHOPIFY_CLIENT_ID, confira o par que voce acabou de colar.'
    return
}

# A prova vem do proprio app.
$saude = (Invoke-WebRequest -Uri "http://127.0.0.1:$porta/healthz" -UseBasicParsing -TimeoutSec 8).Content
$quantos = if ($saude -match '"appsDaShopify":(\d+)') { [int]$Matches[1] } else { 0 }
if ($quantos -ge $numero) {
    Write-Host "  PRONTO. Este servidor atende $quantos apps da Shopify." -ForegroundColor Green
    Write-Host ''
    Write-Host '  Agora, na loja nova:'
    Write-Host '    1. gere o link de instalacao do app NOVO (Dev Dashboard - Instalar app)'
    Write-Host '    2. abra o link logado no admin dela'
    Write-Host '    3. digite a senha de acesso quando ela pedir (uma vez so)'
    Write-Host ''
    Write-Host '  Depois disso a loja aparece em "Publicar em", junto da outra.'
} else {
    Write-Host '  O app subiu, mas nao esta contando o app novo:' -ForegroundColor Red
    Write-Host "  $saude"
}
Write-Host ''
