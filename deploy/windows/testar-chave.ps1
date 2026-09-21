# Pergunta A SHOPIFY se as chaves guardadas nesta VM estao certas.
#
# Existe porque a conferencia no olho ja falhou tres vezes: comparar o fim da
# chave com o Dev Dashboard depende de achar o app certo no meio de nomes
# parecidos, e "ID token recusado (assinatura)" so aparece quando a loja tenta
# abrir o app - tarde, e sem dizer de onde veio a chave errada.
#
# A Shopify aceita client_credentials para um app custom na organizacao da
# propria loja: mandar o par e ver se ela devolve um token responde, em dois
# segundos e sem chutar, a unica pergunta que sobrou.

$ErrorActionPreference = 'Stop'
$Raiz = 'C:\dvfly'
$ArquivoEnv = Join-Path $Raiz 'app\.env'

if (-not (Test-Path $ArquivoEnv)) {
    Write-Host "Nao achei $ArquivoEnv." -ForegroundColor Red
    exit 1
}

<# Os pares do .env: sufixo, Client ID e chave. #>
function LerApps($linhas) {
    $apps = @()
    foreach ($sufixo in @('') + (2..9 | ForEach-Object { "_$_" })) {
        $id = ''; $secret = ''
        foreach ($linha in $linhas) {
            if ($linha -match "^\s*SHOPIFY_CLIENT_ID$sufixo\s*=\s*`"?([^`"\s]*)`"?\s*$") { $id = $Matches[1] }
            if ($linha -match "^\s*SHOPIFY_CLIENT_SECRET$sufixo\s*=\s*`"?([^`"\s]*)`"?\s*$") { $secret = $Matches[1] }
        }
        if ($id -eq '' -and $secret -eq '') { continue }
        $apps += [pscustomobject]@{ Sufixo = $sufixo; ClientId = $id; Secret = $secret }
    }
    return $apps
}

<#
    O que a resposta da Shopify quer dizer, em uma frase.

    A diferenca que importa e entre "a chave esta errada" e "esta chave nao e
    desta loja": as duas devolvem erro, e so uma se conserta com adicionar-app.
#>
function Interpretar($status, $corpo) {
    if ($status -eq 200) { return 'CERTA - a Shopify aceitou este par.' }
    if ($status -eq 0) { return "NAO DEU PARA PERGUNTAR - a VM nao alcancou a loja ($corpo)." }
    if ($status -eq 404) { return 'LOJA NAO ENCONTRADA - confira o dominio .myshopify.com que voce digitou.' }
    if ($corpo -match 'invalid_client') {
        return 'ERRADA - a Shopify recusou o par: esta chave nao e a deste Client ID.'
    }
    if ($corpo -match 'invalid_request|unsupported_grant_type') {
        # App de OUTRA organizacao responde assim: o par pode estar certo, a
        # loja e que nao e dele. Dizer "chave errada" aqui manda consertar o
        # que nao esta quebrado.
        return "OUTRA LOJA - a Shopify nao aceita este app nesta loja (HTTP $status). Normal para o app da outra organizacao."
    }
    return "RESPOSTA INESPERADA (HTTP $status): $corpo"
}

<# O POST do client_credentials, sem nunca devolver o token que vem no sucesso. #>
function PerguntarShopify($shop, $clientId, $clientSecret) {
    $corpo = @{ grant_type = 'client_credentials'; client_id = $clientId; client_secret = $clientSecret }
    try {
        $r = Invoke-WebRequest -Uri "https://$shop/admin/oauth/access_token" -Method Post -Body $corpo `
            -ContentType 'application/x-www-form-urlencoded' -UseBasicParsing -TimeoutSec 20
        return [pscustomobject]@{ Status = [int]$r.StatusCode; Corpo = '' }
    } catch {
        $resposta = $_.Exception.Response
        if ($null -eq $resposta) { return [pscustomobject]@{ Status = 0; Corpo = $_.Exception.Message } }
        $texto = ''
        # PowerShell 5.1 devolve o corpo no fluxo; o 7 ja o traz em ErrorDetails.
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $texto = $_.ErrorDetails.Message
        } else {
            try {
                $leitor = New-Object System.IO.StreamReader($resposta.GetResponseStream())
                $texto = $leitor.ReadToEnd()
            } catch { }
        }
        return [pscustomobject]@{ Status = [int]$resposta.StatusCode; Corpo = $texto }
    }
}

Write-Host ''
Write-Host '  D&VFly - a chave desta VM esta certa?' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Isto NAO muda nada: so pergunta a Shopify se o par Client ID + chave'
Write-Host '  secreta que esta guardado aqui e aceito pela loja.'
Write-Host ''

# Enter que sobrou do comando colado nao e resposta de ninguem.
try { $Host.UI.RawUI.FlushInputBuffer() } catch { }

$apps = @(LerApps @(Get-Content $ArquivoEnv))
if ($apps.Count -eq 0) {
    Write-Host '  Nenhum app configurado no app\.env.' -ForegroundColor Red
    exit 1
}

Write-Host '   Dominio da loja  (ex.: 49e257-b3.myshopify.com)' -ForegroundColor Cyan
$shop = ''
for ($tentativa = 1; $tentativa -le 4 -and $shop -eq ''; $tentativa++) {
    $digitado = (Read-Host '   cole aqui e pressione Enter').Trim().ToLower()
    # Endereco colado do admin tambem serve: o que importa e o .myshopify.com.
    if ($digitado -match '([a-z0-9][a-z0-9-]*\.myshopify\.com)') { $shop = $Matches[1] }
    elseif ($digitado -eq '') { Write-Host '   Nada chegou aqui. Digite de novo.' -ForegroundColor Yellow }
    else { Write-Host '   Precisa terminar em .myshopify.com' -ForegroundColor Yellow }
}
if ($shop -eq '') { throw 'Sem o dominio da loja nao da para perguntar nada a Shopify.' }

foreach ($app in $apps) {
    Write-Host ''
    Write-Host ("== SHOPIFY_CLIENT_ID{0}  {1}" -f $app.Sufixo, $app.ClientId) -ForegroundColor Green
    if ($app.Secret -eq '') {
        Write-Host '   SEM CHAVE no .env - par pela metade.' -ForegroundColor Red
        continue
    }
    $r = PerguntarShopify $shop $app.ClientId $app.Secret
    $frase = Interpretar $r.Status $r.Corpo
    $cor = if ($frase.StartsWith('CERTA')) { 'Green' } elseif ($frase.StartsWith('ERRADA')) { 'Red' } else { 'Yellow' }
    Write-Host "   $frase" -ForegroundColor $cor
}

Write-Host ''
Write-Host '  Se o app que a loja abre saiu como ERRADA: pegue a chave secreta DELE no' -ForegroundColor Cyan
Write-Host '  Dev Dashboard (ou gire uma nova em "Alternar") e rode o adicionar-app.'
Write-Host ''
