# Puxa a versao nova do D&VFly e reinicia - o que o atalho ATUALIZAR faz.
#
# Nada aqui toca no banco nem no .env: o que muda e o codigo. Se a versao nova
# nao compilar, o app ANTIGO continua no ar (a reinicializacao so acontece
# depois de compilar).

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'
$Raiz = 'C:\dvfly'
$Branch = 'claude/dvfly-pagefly-research-skqx9r'

function Passo($texto) {
    Write-Host ''
    Write-Host "== $texto" -ForegroundColor Green
}

if (-not (Test-Path (Join-Path $Raiz '.git'))) {
    throw "Nao achei o D&VFly em $Raiz. Rode o instalador primeiro (docs\HOSPEDAGEM.md)."
}

Push-Location $Raiz

Passo 'Baixando a versao nova'
git fetch origin $Branch --quiet
$antes = (git rev-parse HEAD)
git checkout $Branch --quiet
git reset --hard "origin/$Branch" --quiet
$depois = (git rev-parse HEAD)

if ($antes -eq $depois) {
    Write-Host '   Ja estava na versao mais nova. Nada a fazer.'
    Pop-Location
    return
}

Passo 'Instalando dependencias e compilando'
cmd /c 'npm install --no-audit --no-fund' | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'npm install falhou. O app antigo continua no ar.' }
cmd /c 'npm run build' | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'A compilacao falhou. O app antigo continua no ar.' }

Passo 'Atualizando o banco'
cmd /c 'npm run db:deploy --workspace @dvfly/app' | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'A atualizacao do banco falhou. O app antigo continua no ar.' }

Passo 'Reiniciando o app'
# O runner tambem e reescrito aqui: o caminho do node pode ter mudado (uma
# atualizacao do Node.js troca a pasta), e uma instalacao antiga pode ter
# deixado um runner que chama "node" pelo nome.
. (Join-Path $Raiz 'deploy\windows\comum.ps1')
EscreverRunner $Raiz (PortaDoRunner $Raiz '3000') | Out-Null
Stop-ScheduledTask -TaskName 'DVFly App' -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName 'DVFly App'

$porta = PortaDoRunner $Raiz '3000'

$ok = $false
foreach ($tentativa in 1..15) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$porta/healthz" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {
        # ainda subindo
    }
}

Pop-Location
Write-Host ''
if ($ok) {
    Write-Host '  PRONTO. A versao nova esta no ar.' -ForegroundColor Green
    Write-Host "  De $($antes.Substring(0,7)) para $($depois.Substring(0,7))."
} else {
    Write-Host '  A versao nova nao respondeu.' -ForegroundColor Red
    Write-Host '  Para ver o erro na sua frente:'
    Write-Host "    cd $Raiz\app ; node server.mjs"
}
Write-Host ''
