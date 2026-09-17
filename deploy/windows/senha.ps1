# Liga (ou troca, ou desliga) a senha de acesso do D&VFly nesta VM.
#
# Existe porque a senha e a unica resposta do instalador que alguem vai querer
# mudar depois - e reinstalar tudo para trocar uma linha do .env seria um
# caminho longo para um passo curto. Aqui ela e escrita, o app reinicia e a
# tela confirma que a trava ficou de pe.

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

Write-Host ''
Write-Host '  D&VFly - senha de acesso' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Quem instalar o app so consegue usar depois de digitar esta senha.'
Write-Host '  Cada loja pede uma vez so; as que ja foram liberadas continuam liberadas.'
Write-Host '  Deixe em branco para DESLIGAR a trava.'
Write-Host ''
Write-Host '  Uma frase e melhor que uma palavra (ex.: carro-azul-do-miguel-2026).'
Write-Host ''
$senha = Read-Host '  digite a senha e pressione Enter'
$senha = $senha.Trim()

# A aspa dupla e o unico caractere que o arquivo .env nao sabe carregar: ele
# delimita o valor. Recusar e melhor do que gravar uma senha que o app leria
# pela metade, sem ninguem entender por que ela "nao funciona".
if ($senha.Contains('"')) {
    throw 'A senha nao pode ter aspas duplas ("). Use qualquer outro caractere.'
}

Passo 'Escrevendo no app\.env'
$linhas = @(Get-Content $ArquivoEnv)
$nova = 'DVFLY_ACCESS_KEY="' + $senha + '"'
if ($linhas -match '^\s*DVFLY_ACCESS_KEY\s*=') {
    $linhas = $linhas | ForEach-Object {
        if ($_ -match '^\s*DVFLY_ACCESS_KEY\s*=') { $nova } else { $_ }
    }
} else {
    # Instalacao anterior ao cadeado: a linha ainda nao existe.
    $linhas += $nova
}
Set-Content -Path $ArquivoEnv -Value $linhas -Encoding ASCII
Write-Host '   escrita.'

# O app le o .env quando sobe. Sem reiniciar, a senha nova fica no arquivo e o
# processo continua com a antiga - a confusao mais facil de criar aqui.
Passo 'Reiniciando o app para ele ler a senha'
$porta = PortaDoRunner $Raiz '3000'
PararApp $porta
IniciarApp
$ok = EsperarApp $porta 15

Write-Host ''
if (-not $ok) {
    Write-Host '  O app nao respondeu depois de reiniciar.' -ForegroundColor Red
    MostrarLog $Raiz 25
    return
}

# A prova sai do proprio app, nao da nossa expectativa.
$saude = (Invoke-WebRequest -Uri "http://127.0.0.1:$porta/healthz" -UseBasicParsing -TimeoutSec 8).Content
$ligada = $saude -match '"senhaDeAcesso":true'
$liberadas = if ($saude -match '"lojasLiberadas":(\d+)') { $Matches[1] } else { '?' }

if ($senha -eq '' -and -not $ligada) {
    Write-Host '  Trava DESLIGADA. Qualquer loja que abrir o app vai poder usar.' -ForegroundColor Yellow
} elseif ($senha -ne '' -and $ligada) {
    Write-Host '  Trava LIGADA.' -ForegroundColor Green
    Write-Host "  Lojas ja liberadas: $liberadas. As outras vao pedir a senha ao abrir o app."
    Write-Host '  A senha esta em C:\dvfly\app\.env (DVFLY_ACCESS_KEY). Guarde uma copia.'
} else {
    Write-Host '  O app subiu, mas nao ficou no estado esperado:' -ForegroundColor Red
    Write-Host "  $saude"
}
Write-Host ''
