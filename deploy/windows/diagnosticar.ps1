# Mostra, de uma vez, tudo que decide se o D&VFly esta no ar nesta VM.
#
# Existe para acabar com o vai-e-vem de prints: cada pedaco desta tela responde
# uma pergunta diferente, e a ordem e a ordem em que as coisas quebram.

$ErrorActionPreference = 'Continue'
$Raiz = 'C:\dvfly'

if (-not (Test-Path (Join-Path $Raiz 'deploy\windows\comum.ps1'))) {
    Write-Host "Nao achei o D&VFly em $Raiz." -ForegroundColor Red
    exit 1
}
. (Join-Path $Raiz 'deploy\windows\comum.ps1')
$porta = PortaDoRunner $Raiz '3000'

function Titulo($texto) {
    Write-Host ''
    Write-Host "== $texto" -ForegroundColor Green
}

Titulo 'Versao do codigo'
Push-Location $Raiz
git log --oneline -1
Pop-Location

Titulo 'Tarefas do Windows'
foreach ($nome in 'DVFly App', 'DVFly HTTPS') {
    $t = Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
    if (-not $t) {
        Write-Host "   $nome : NAO EXISTE (rode o instalador)" -ForegroundColor Yellow
        continue
    }
    $i = $t | Get-ScheduledTaskInfo
    Write-Host ("   {0} : {1} | ultimo resultado {2} | ultima vez {3}" -f $nome, $t.State, $i.LastTaskResult, $i.LastRunTime)
}

Titulo "O app responde em 127.0.0.1:$porta ?"
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$porta/healthz" -UseBasicParsing -TimeoutSec 8
    Write-Host "   SIM - $($r.Content)" -ForegroundColor Green
} catch {
    Write-Host "   NAO - $($_.Exception.Message)" -ForegroundColor Red
}

Titulo 'Quem esta ouvindo nessa porta'
$conexoes = Get-NetTCPConnection -LocalPort ([int]$porta) -State Listen -ErrorAction SilentlyContinue
if (-not $conexoes) {
    Write-Host '   ninguem. O app nao esta de pe.' -ForegroundColor Red
} else {
    foreach ($c in $conexoes) {
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        Write-Host ("   {0}:{1} <- {2} (pid {3})" -f $c.LocalAddress, $c.LocalPort, $p.ProcessName, $c.OwningProcess)
    }
}

Titulo 'O app e o Caddy combinam de porta?'
# A pergunta existe porque a resposta ja foi NAO uma vez, e nada na tela
# denunciava: o app respondia perfeitamente em 127.0.0.1:443 enquanto o Caddy
# batia na 3000 e devolvia 502 para o mundo.
$caddyfile = Join-Path $Raiz 'deploy\windows\Caddyfile.gerado'
$portaCaddy = PortaDoCaddyfile $caddyfile
Write-Host "   o app usa a porta $porta; o Caddy procura na porta $portaCaddy"
if ("$porta" -ne "$portaCaddy") {
    Write-Host '   NAO COMBINAM. E por isso que de fora da 502.' -ForegroundColor Red
    Write-Host '   Conserto: rode o instalador de novo.' -ForegroundColor Red
} else {
    Write-Host '   combinam.' -ForegroundColor Green
}

Titulo 'Quem ocupa as portas 80 e 443'
foreach ($p in 80, 443) {
    $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if (-not $c) {
        Write-Host "   $p : ninguem" -ForegroundColor Yellow
        continue
    }
    foreach ($um in $c) {
        $dono = Get-Process -Id $um.OwningProcess -ErrorAction SilentlyContinue
        Write-Host ("   {0} : {1}:{2} <- {3} (pid {4})" -f $p, $um.LocalAddress, $um.LocalPort, $dono.ProcessName, $um.OwningProcess)
    }
}

Titulo 'O que o app escreveu'
MostrarLog $Raiz 30

Titulo 'O HTTPS, passando pelo Caddy (sem sair da VM)'
$dominio = ''
$env_ = Join-Path $Raiz 'app\.env'
if (Test-Path $env_) {
    foreach ($linha in Get-Content $env_) {
        if ($linha -match '^\s*DVFLY_DOMAIN\s*=\s*"?([^"]*)"?\s*$') { $dominio = $Matches[1].Trim() }
    }
}
if ($dominio -eq '') {
    Write-Host '   (sem dominio no .env)'
} else {
    $codigo = CaddyPorDentro $dominio
    if ($codigo -eq '200') {
        Write-Host "   https://$dominio/healthz -> 200" -ForegroundColor Green
    } elseif ($codigo -eq '') {
        Write-Host "   https://$dominio/healthz -> o Caddy nao respondeu" -ForegroundColor Red
    } else {
        Write-Host "   https://$dominio/healthz -> $codigo (esperado 200)" -ForegroundColor Red
    }
}

Write-Host ''
Write-Host '  Manda um print desta janela inteira.' -ForegroundColor Cyan
Write-Host ''
