# A chave guardada nesta VM assina os tokens que a loja manda?
#
# Esta e a pergunta que nunca tinha resposta antes de instalar. Trazer uma loja
# nova para o ar e copiar uma chave secreta do Dev Dashboard para ca, e a unica
# coisa que julgava a copia era abrir o app no admin e ler um 401. Com tres apps
# chamados "DVHub Application" em tres organizacoes, copiar do app errado e um
# clique - e cada tentativa errada custava uma volta inteira.
#
# A prova sempre esteve aqui: um token que a Shopify assinou de verdade e que o
# app acabou de recusar. O servidor guarda esse token por meia hora, em memoria,
# e este script pergunta a ele se a chave configurada assina aquele token.
#
# A versao anterior perguntava a Shopify por client_credentials. Nao servia: um
# app de instalacao gerenciada nao aceita esse tipo de pedido, e a resposta era
# recusada antes de a chave ser olhada.
#
# COMO USAR
#   1. abra o app no admin da loja (pode falhar - e o que se quer medir);
#   2. rode este script.

$ErrorActionPreference = 'Stop'
$Raiz = 'C:\dvfly'
$ArquivoEnv = Join-Path $Raiz 'app\.env'

if (-not (Test-Path (Join-Path $Raiz 'deploy\windows\comum.ps1'))) {
    Write-Host "Nao achei o D&VFly em $Raiz." -ForegroundColor Red
    exit 1
}
. (Join-Path $Raiz 'deploy\windows\comum.ps1')

<# O valor de uma chave do .env, sem aspas. #>
function DoEnv($linhas, $nome) {
    foreach ($linha in $linhas) {
        if ($linha -match "^\s*$nome\s*=\s*`"?(.*?)`"?\s*$") { return $Matches[1] }
    }
    return ''
}

if (-not (Test-Path $ArquivoEnv)) { throw "Nao achei $ArquivoEnv." }
$linhas = @(Get-Content $ArquivoEnv)
$senha = DoEnv $linhas 'DVFLY_ACCESS_KEY'
$porta = PortaDoRunner $Raiz '3000'

Write-Host ''
Write-Host '  D&VFly - a chave guardada aqui esta certa?' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Isto NAO muda nada. Ele confere as chaves do app\.env contra o ultimo'
Write-Host '  token que a Shopify assinou e o app recusou.'
Write-Host ''

if ($senha -eq '') {
    Write-Host '  Sem DVFLY_ACCESS_KEY no .env esta conferencia fica desligada' -ForegroundColor Yellow
    Write-Host '  (ela so responde a quem sabe a senha de acesso).'
    Write-Host '  Defina a senha primeiro: senha.ps1' -ForegroundColor Cyan
    Write-Host ''
    return
}

# A senha vai no CORPO, nunca na URL: o log de acesso do Caddy guarda a query,
# e o filtro dele so apaga o que esta nomeado la dentro.
$dados = $null
$codigo = 0
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$porta/api/chave" -Method Post -Body @{ senha = $senha } `
        -UseBasicParsing -TimeoutSec 10
    $dados = $r.Content | ConvertFrom-Json
} catch {
    # O PowerShell 5.1 LANCA em qualquer resposta que nao seja 2xx - e e
    # justamente no corpo dessas que a rota escreve o conserto (senha errada,
    # senha nao configurada, espera). Sem ler daqui, toda explicacao que o app
    # sabe dar virava "o app nao respondeu", que manda procurar no lugar errado.
    $corpo = $_.ErrorDetails.Message
    if ($_.Exception.Response) {
        $codigo = [int]$_.Exception.Response.StatusCode
        if (-not $corpo) {
            try {
                $leitor = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
                $corpo = $leitor.ReadToEnd()
            } catch { }
        }
    }
    if ($corpo) { try { $dados = $corpo | ConvertFrom-Json } catch { } }
}

if ($null -eq $dados) {
    if ($codigo -eq 404) {
        Write-Host '  O CODIGO desta VM e antigo: /api/chave ainda nao existe aqui.' -ForegroundColor Yellow
        Write-Host '  Conserto: clique em ATUALIZAR DVFly (area de trabalho).' -ForegroundColor Cyan
    } else {
        Write-Host "  O app nao respondeu em 127.0.0.1:$porta (HTTP $codigo)." -ForegroundColor Red
        MostrarLog $Raiz 15
    }
    Write-Host ''
    return
}

if ($dados.erro) {
    Write-Host "  $($dados.erro)" -ForegroundColor Red
    Write-Host ''
    return
}

$semTeste = 0
foreach ($app in $dados.apps) {
    Write-Host ''
    Write-Host "== $($app.clientId)" -ForegroundColor Green
    Write-Host ("   chave guardada: {0} caracteres, terminando em ...{1}" -f $app.tamanhoDaChave, $app.fimDaChave) -ForegroundColor DarkGray
    if ($null -eq $app.assina) {
        $semTeste++
        Write-Host '   SEM TOKEN PARA TESTAR - nenhuma loja deste app tentou abrir o app na ultima' -ForegroundColor Yellow
        Write-Host '   meia hora. Abra o app no admin dela (mesmo que de erro) e rode isto de novo.'
        continue
    }
    $onde = if ($app.loja) { " (loja $($app.loja), ha $($app.minutos) min)" } else { '' }
    if ($app.assina) {
        Write-Host "   CERTA - esta chave assina o token que a Shopify mandou$onde." -ForegroundColor Green
    } else {
        $quantos = if ($app.testados -gt 1) { " (nenhum dos $($app.testados) tokens lembrados)" } else { '' }
        Write-Host "   ERRADA - esta chave NAO assina o token que a Shopify mandou$onde$quantos." -ForegroundColor Red
        Write-Host '   No Dev Dashboard, abra o app que tem ESSE Client ID (confira pelo ID, nao'
        Write-Host '   pelo nome - os apps se chamam igual) e copie a chave secreta dele pelo botao'
        Write-Host '   de copiar. Depois: adicionar-app.ps1'
    }
}

Write-Host ''
if ($semTeste -eq $dados.apps.Count) {
    Write-Host '  Nenhum app tinha token para testar. A ordem e: primeiro abrir o app no' -ForegroundColor Cyan
    Write-Host '  admin da loja, depois rodar isto.'
}
Write-Host ''
