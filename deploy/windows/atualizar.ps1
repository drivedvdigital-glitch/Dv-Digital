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

. (Join-Path $Raiz 'deploy\windows\comum.ps1')
$porta = PortaDoRunner $Raiz '3000'

# O app PARA antes de compilar. No Windows nao ha escolha: o `prisma generate`
# troca um .dll que o app mantem aberto, e a compilacao morre com EPERM. Custa
# o minuto da compilacao fora do ar, e o `finally` garante que ele volte mesmo
# se algo falhar no meio - inclusive na versao antiga, que e melhor que nada.
Passo 'Parando o app para compilar (ele volta em seguida)'
PararApp

$ok = $false
try {
    Passo 'Instalando dependencias e compilando'
    cmd /c 'npm install --no-audit --no-fund' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'npm install falhou.' }
    cmd /c 'npm run build' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'A compilacao falhou.' }

    Passo 'Atualizando o banco'
    cmd /c 'npm run db:deploy --workspace @dvfly/app' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'A atualizacao do banco falhou.' }
} finally {
    # O runner tambem e reescrito aqui: o caminho do node pode ter mudado (uma
    # atualizacao do Node.js troca a pasta), e uma instalacao antiga pode ter
    # deixado um runner que chama "node" pelo nome.
    EscreverRunner $Raiz $porta | Out-Null
    Passo 'Subindo o app'
    IniciarApp
    $ok = EsperarApp $porta 15
    Pop-Location
}
Write-Host ''
if ($ok) {
    Write-Host '  PRONTO. A versao nova esta no ar.' -ForegroundColor Green
    Write-Host "  De $($antes.Substring(0,7)) para $($depois.Substring(0,7))."
} else {
    Write-Host '  A versao nova nao respondeu.' -ForegroundColor Red
    MostrarLog $Raiz 25
    Write-Host ''
    Write-Host '  Para ver o erro na sua frente:'
    Write-Host "    cd $Raiz\app ; node server.mjs"
}
Write-Host ''
