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

. (Join-Path $Raiz 'deploy\windows\comum.ps1')
$porta = PortaDoRunner $Raiz '3000'

# "Mesmo commit" NAO quer dizer "nada a fazer".
#
# O `git reset` acima acontece ANTES de compilar. Se a compilacao morrer no
# meio - uma janela fechada, outro script parando o app, falta de disco -, o
# disco fica com o codigo novo e o build do codigo velho. A versao antiga
# dizia "ja esta na versao mais nova" e ia embora, para sempre: o app nunca
# mais compilava, e nada na tela explicava por que o conserto nao chegava.
#
# Entao quem responde e o BUILD: depois de compilar com sucesso, o commit
# construido fica gravado ao lado dele. Compilar de novo so e dispensavel
# quando esse registro bate com o HEAD de agora.
$marca = Join-Path $Raiz 'app\build\.commit-construido'
$construido = if (Test-Path $marca) { (Get-Content $marca -Raw).Trim() } else { '' }
if ($antes -eq $depois -and $construido -eq $depois) {
    Write-Host '   Ja estava na versao mais nova, e o build e desta versao.'
    Pop-Location
    # Mesmo sem nada a fazer, o app tem que estar de pe - e uma parada por
    # qualquer motivo nao pode sobreviver a um ATUALIZAR.
    if (-not (EsperarApp $porta 2)) {
        Write-Host '   O app nao estava respondendo. Subindo.' -ForegroundColor Yellow
        IniciarApp
        if (EsperarApp $porta 15) { Write-Host '   de pe.' -ForegroundColor Green }
        else { MostrarLog $Raiz 25 }
    }
    return
}
if ($antes -eq $depois) {
    Write-Host '   O codigo ja estava novo, mas o build e de outra versao. Compilando.' -ForegroundColor Yellow
}

# O app PARA antes de compilar. No Windows nao ha escolha: o `prisma generate`
# troca um .dll que o app mantem aberto, e a compilacao morre com EPERM. Custa
# o minuto da compilacao fora do ar, e o `finally` garante que ele volte mesmo
# se algo falhar no meio - inclusive na versao antiga, que e melhor que nada.
Passo 'Parando o app para compilar (ele volta em seguida)'
PararApp $porta

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

    # So AQUI, com tudo tendo dado certo: e este arquivo que responde "o que
    # esta compilado" na proxima vez.
    Set-Content -Path $marca -Value $depois -Encoding ASCII
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
