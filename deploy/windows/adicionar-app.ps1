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

<# Os apps da Shopify que ja estao no .env: sufixo ('', '_2', ...) e Client ID. #>
function AppsNoEnv($linhas) {
    $apps = @()
    foreach ($linha in $linhas) {
        # Linha comentada nao casa: o ^\s* nao deixa o # passar.
        if ($linha -match '^\s*SHOPIFY_CLIENT_ID(_\d)?\s*=\s*"?([^"\s]+)"?\s*$') {
            $sufixo = if ($Matches.ContainsKey(1)) { $Matches[1] } else { '' }
            $apps += [pscustomobject]@{ Sufixo = $sufixo; ClientId = $Matches[2] }
        }
    }
    return $apps
}

<#
    Le um segredo sem ecoar na tela.

    -AsSecureString existe no Windows PowerShell 5.1 e no 7; -MaskInput so no 7,
    e a VM roda o 5.1. O BSTR e zerado depois de virar texto: o valor ainda
    acaba numa variavel comum (o .env e texto, nao ha para onde fugir), mas nao
    fica uma copia solta na memoria nao gerenciada.
#>
function SegredoDoConsole {
    $seguro = Read-Host '   cole aqui e pressione Enter (nao aparece na tela)' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

<#
    Pergunta ate vir uma resposta que sirva, em vez de morrer na primeira.

    O motivo e concreto: o Client ID chegou vazio sem ninguem ter digitado nada
    (o Enter que sobrou do comando colado respondeu a pergunta sozinho), o
    secret foi parar na pergunta seguinte, e o script desistiu com "sem o par
    completo" - com o par inteiro na mao de quem estava ali, e com a chave
    secreta ja impressa na tela. Pergunta que so tem uma chance nao pode
    perder essa chance para um Enter de ninguem.
#>
function Perguntar {
    param([string]$Titulo, [string]$Dica, [scriptblock]$Valida, [string]$Porque, [switch]$Oculto)
    for ($tentativa = 1; $tentativa -le 4; $tentativa++) {
        Write-Host ''
        Write-Host "   $Titulo" -ForegroundColor Cyan
        if ($Dica) { Write-Host "   $Dica" -ForegroundColor DarkGray }
        # Chave secreta nao se digita na tela.
        #
        # O Read-Host normal ecoa o que foi colado, e o que esta na tela acaba
        # num print - foi assim que um secret de producao saiu desta VM. A tela
        # confirma so o tamanho e o fim, que bastam para conferir com o Dev
        # Dashboard e nao servem para ninguem.
        $valor = if ($Oculto) { SegredoDoConsole } else { Read-Host '   cole aqui e pressione Enter' }
        $valor = "$valor".Trim()
        if ($valor -eq '') {
            Write-Host '   Nada chegou aqui.' -ForegroundColor Yellow
            Write-Host '   (Se voce colou o comando com uma linha em branco no fim, esse Enter' -ForegroundColor Yellow
            Write-Host '    sobrando respondeu a pergunta sozinho. E so responder agora.)' -ForegroundColor Yellow
            continue
        }
        if (& $Valida $valor) { return $valor }
        Write-Host "   $Porque" -ForegroundColor Yellow
    }
    throw "Quatro tentativas sem uma resposta valida para: $Titulo"
}

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
Write-Host '  Serve para duas coisas:'
Write-Host '    - acrescentar um app NOVO, quando uma loja SUA nao puder instalar o app'
Write-Host '      atual (a Shopify amarra um app custom a uma loja so);'
Write-Host '    - TROCAR a chave secreta de um app que ja esta aqui, depois de girar'
Write-Host '      essa chave no Dev Dashboard.'
Write-Host ''
Write-Host '  ATENCAO: no app novo, o App URL tem que ser o MESMO endereco deste'
Write-Host '  servidor, e o redirect URL o mesmo com /app no fim.'
Write-Host ''

$linhas = @(Get-Content $ArquivoEnv)
$numero = ProximoNumero $linhas
$jaAqui = @(AppsNoEnv $linhas)

# Enter que sobrou do comando colado nao e resposta de ninguem.
try { $Host.UI.RawUI.FlushInputBuffer() } catch { }

# Trocar secret nao pode exigir redigitar 32 caracteres que este arquivo ja
# sabe de cor: os apps de casa aparecem numerados, e so o secret e digitado.
$clientId = ''
if ($jaAqui.Count -gt 0) {
    Write-Host '  Apps da Shopify que este servidor ja atende:'
    for ($i = 0; $i -lt $jaAqui.Count; $i++) {
        Write-Host ("    [{0}] {1}   (SHOPIFY_CLIENT_ID{2})" -f ($i + 1), $jaAqui[$i].ClientId, $jaAqui[$i].Sufixo)
    }
    Write-Host '    [N] um app NOVO, de outra loja'
    $limite = $jaAqui.Count
    $escolha = Perguntar `
        -Titulo 'Qual deles?' `
        -Dica "digite o numero para so trocar a chave secreta dele, ou N para um app novo" `
        -Valida { param($v) $v -match '^[Nn]$' -or ($v -match '^\d+$' -and [int]$v -ge 1 -and [int]$v -le $limite) } `
        -Porque "Responda um numero de 1 a $limite, ou a letra N."
    if ($escolha -notmatch '^[Nn]$') { $clientId = $jaAqui[[int]$escolha - 1].ClientId }
}

if ($clientId -eq '') {
    $clientId = Perguntar `
        -Titulo 'Client ID do app novo' `
        -Dica 'Dev Dashboard - Client credentials' `
        -Valida { param($v) $v -notmatch '"' -and $v -notmatch '^shpss_' -and $v.Length -ge 8 } `
        -Porque 'Isso nao parece um Client ID (comecou com shpss_? entao e a chave secreta).'
}

# Chave da Shopify tem tamanho fixo: `shpss_` + 32 caracteres = 38.
#
# Custou uma tarde. A chave da terceira loja entrou com 37 - um caractere
# perdido na colagem - e nada disse nada: o .env aceita qualquer texto, o app
# sobe, e quem descobre e a loja, com "ID token recusado (assinatura)". Contar
# os caracteres e a checagem mais barata que existe, e pega justamente o erro
# que nenhuma leitura no olho pega.
$TAMANHO_DA_CHAVE = 38
$clientSecret = Perguntar -Oculto `
    -Titulo "Chave secreta do app $clientId" `
    -Dica "Dev Dashboard - Chave secreta (use o botao de copiar). shpss_ + 32 = $TAMANHO_DA_CHAVE caracteres" `
    -Valida {
        param($v)
        if ($v -match '"' -or $v -eq $clientId) { return $false }
        if ($v -match '^shpss_') { return $v.Length -eq $TAMANHO_DA_CHAVE }
        return $v.Length -ge 12
    } `
    -Porque "Isso e o Client ID, ou a chave veio CORTADA: uma chave shpss_ tem $TAMANHO_DA_CHAVE caracteres. Copie pelo botao de copiar do painel, nao pelo olhinho."

# Colagem cortada e erro mudo: o .env aceita qualquer texto e quem descobre e a
# loja, com "ID token recusado (assinatura)" dias depois. O fim da chave confere
# com o Dev Dashboard e nao serve para quem so ve o print.
Write-Host ("   recebido: {0} caracteres, terminando em ...{1}" -f $clientSecret.Length,
    $clientSecret.Substring([Math]::Max(0, $clientSecret.Length - 4))) -ForegroundColor DarkGray

<#
    A chave e julgada AGORA, contra um token que a Shopify assinou.

    O app guarda por meia hora o ultimo token que recusou. Se a loja ja tentou
    abrir o app, da para saber neste instante se a chave colada e a certa - em
    vez de gravar, reiniciar, voltar ao admin e ler um 401. Sem token guardado
    a resposta e "nao sei", que NAO e "errada": segue em frente.
#>
function ConferirChave($porta, $senha, $clientId, $chave) {
    # Sempre devolve um objeto com MOTIVO. Falhar aberto e o certo aqui - uma
    # conferencia que nao pode ser feita nao pode impedir de configurar o app -
    # mas falhar aberto e CALADO e como nao ter escrito nada: o operador acha
    # que a chave passou pela conferencia quando ela nem foi conferida.
    if ($senha -eq '') {
        return [pscustomobject]@{ assina = $null; motivo = 'sem DVFLY_ACCESS_KEY no .env (rode senha.ps1)' }
    }
    try {
        $corpo = @{ senha = $senha; clientId = $clientId; chave = $chave }
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$porta/api/chave" -Method Post -Body $corpo `
            -UseBasicParsing -TimeoutSec 8
        $dados = $r.Content | ConvertFrom-Json
        if ($null -eq $dados.assina) {
            return [pscustomobject]@{ assina = $null; motivo = 'nenhuma loja deste app tentou abrir o app na ultima meia hora' }
        }
        return $dados
    } catch {
        $codigo = 0
        if ($_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode }
        $motivo = switch ($codigo) {
            404 { 'o codigo desta VM e antigo (clique em ATUALIZAR DVFly)' }
            403 { 'o app recusou a senha de acesso (o .env mudou e o app nao foi reiniciado?)' }
            429 { 'muitas tentativas de senha; espere alguns minutos' }
            503 { 'o app subiu sem DVFLY_ACCESS_KEY' }
            default { "o app nao respondeu em 127.0.0.1:$porta" }
        }
        return [pscustomobject]@{ assina = $null; motivo = $motivo }
    }
}

$portaAgora = PortaDoRunner $Raiz '3000'
$senhaDeAcesso = ''
foreach ($linha in $linhas) {
    if ($linha -match '^\s*DVFLY_ACCESS_KEY\s*=\s*"?(.*?)"?\s*$') { $senhaDeAcesso = $Matches[1] }
}
$veredito = ConferirChave $portaAgora $senhaDeAcesso $clientId $clientSecret
if ($null -eq $veredito.assina) {
    Write-Host "   NAO DEU PARA CONFERIR esta chave: $($veredito.motivo)." -ForegroundColor Yellow
    Write-Host '   Ela vai ser gravada assim mesmo. Depois do reinicio, abra o app no admin da'
    Write-Host '   loja e rode testar-chave.ps1 para saber se acertou.'
} else {
    if ($veredito.assina) {
        Write-Host '   CONFERIDA: esta chave assina o token que a Shopify mandou.' -ForegroundColor Green
    } else {
        Write-Host ''
        Write-Host '   ESTA CHAVE NAO SERVE.' -ForegroundColor Red
        Write-Host '   Ela nao assina o token que a Shopify mandou para este Client ID.'
        Write-Host '   No Dev Dashboard, abra o app pelo CLIENT ID (nao pelo nome - os apps se'
        Write-Host '   chamam igual) e copie a chave secreta dele pelo botao de copiar.'
        Write-Host ''
        $mesmoAssim = (Read-Host '   Gravar assim mesmo? digite SIM (ou Enter para parar)').Trim()
        if ($mesmoAssim -ne 'SIM') {
            Write-Host ''
            Write-Host '   Nada foi mudado. Rode de novo com a chave certa.' -ForegroundColor Cyan
            Write-Host ''
            return
        }
    }
}

# Client ID que ja esta aqui nao e erro: e troca de secret.
#
# Girar a chave secreta no Dev Dashboard e uma operacao normal - depois de um
# vazamento, por exemplo. Recusar com "ja esta configurado" obrigaria a editar o
# .env a mao, que e justamente o que estes scripts existem para evitar.
$sufixo = $null
foreach ($linha in $linhas) {
    if ($linha -match "^\s*SHOPIFY_CLIENT_ID(_\d)?\s*=\s*`"?$([regex]::Escape($clientId))`"?\s*$") {
        # Grupo opcional que nao casou nao aparece em $Matches: para o app
        # principal (SHOPIFY_CLIENT_ID, sem numero) o sufixo e string vazia, e
        # `$null` aqui mandaria a troca de secret virar "app novo".
        $sufixo = if ($Matches.ContainsKey(1)) { $Matches[1] } else { '' }
    }
}

if ($null -ne $sufixo) {
    Passo "Trocando o secret do app que ja estava aqui (SHOPIFY_CLIENT_ID$sufixo)"
    $achou = $false
    $linhas = $linhas | ForEach-Object {
        if ($_ -match "^\s*SHOPIFY_CLIENT_SECRET$sufixo\s*=") {
            $achou = $true
            "SHOPIFY_CLIENT_SECRET$sufixo=`"$clientSecret`""
        } else { $_ }
    }
    if (-not $achou) { $linhas += "SHOPIFY_CLIENT_SECRET$sufixo=`"$clientSecret`"" }
    $numero = if ($sufixo -eq '') { 1 } else { [int]$sufixo.TrimStart('_') }
} else {
    Passo "Escrevendo o app numero $numero no app\.env"
    $linhas += "SHOPIFY_CLIENT_ID_$numero=`"$clientId`""
    $linhas += "SHOPIFY_CLIENT_SECRET_$numero=`"$clientSecret`""
}
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
# O campo so existe no codigo que sabe atender varios apps. Ele NAO aparecer
# nao e "deu errado": e esta VM estar rodando codigo velho, com o .env ja certo
# e o programa sem saber ler o par novo. Dizer isso aqui evita a caca ao erro.
if ($saude -notmatch '"appsDaShopify"') {
    Write-Host '  O .env recebeu o app novo, mas o CODIGO desta VM e antigo:' -ForegroundColor Yellow
    Write-Host '  ele ainda nao sabe atender mais de um app da Shopify.'
    Write-Host ''
    Write-Host '  Conserto: clique em ATUALIZAR DVFly (area de trabalho) e rode este' -ForegroundColor Cyan
    Write-Host '  script de novo - ou so confira o /healthz depois de atualizar, porque'
    Write-Host '  o par que voce digitou ja esta guardado.'
    Write-Host ''
    return
}
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
