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

$url = "http://127.0.0.1:$porta/api/chave?senha=" + [uri]::EscapeDataString($senha)
try {
    $resposta = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
} catch {
    Write-Host '  O app nao respondeu.' -ForegroundColor Red
    Write-Host '  Se o erro falar de 404, o CODIGO desta VM e antigo: clique em ATUALIZAR DVFly.'
    MostrarLog $Raiz 15
    return
}
$dados = $resposta.Content | ConvertFrom-Json

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
        Write-Host "   ERRADA - esta chave NAO assina o token que a Shopify mandou$onde." -ForegroundColor Red
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
