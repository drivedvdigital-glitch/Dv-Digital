# Instala o D&VFly numa VM Windows nua, do zero, e deixa ele de pe sozinho.
#
# Roda quantas vezes quiser: o que ja existe e reaproveitado, nada e apagado.
#
# O que faz, em ordem:
#   1. instala o que falta (Git, Node LTS, Caddy) pelo winget
#   2. baixa o codigo em C:\dvfly
#   3. pergunta o dominio e as credenciais da Shopify (so na primeira vez)
#   4. compila e prepara o banco
#   5. registra duas tarefas do Windows (app e HTTPS) que sobem no boot e
#      se reerguem sozinhas se cairem
#   6. abre as portas 80 e 443 e confere que o app respondeu
#
# Escrito para o Windows PowerShell 5.1, que e o que vem na maquina - nada de
# sintaxe nova, senao quebra justamente na VM onde ninguem vai depurar.

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$Raiz = 'C:\dvfly'
$Repositorio = 'https://github.com/drivedvdigital-glitch/Dv-Digital.git'
$Branch = 'claude/dvfly-pagefly-research-skqx9r'
# Nome longo de proposito. Nome de variavel no PowerShell NAO diferencia
# maiusculas: um `foreach ($porta in 80, 443)` mais abaixo escrevia por cima de
# um `$Porta` e deixava o app subindo na 443 enquanto o Caddy procurava por ele
# na 3000 - de fora, 502 eterno; de dentro, tudo parecia certo.
$PortaDoApp = 3000

function Passo($texto) {
    Write-Host ''
    Write-Host "== $texto" -ForegroundColor Green
}

function Aviso($texto) {
    Write-Host "   $texto" -ForegroundColor Yellow
}

function Existe($comando) {
    $antigo = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    $achou = Get-Command $comando -ErrorAction SilentlyContinue
    $ErrorActionPreference = $antigo
    return [bool]$achou
}

# O winget instala coisas que mexem no PATH; sem reler, o proprio script nao
# enxerga o que acabou de instalar.
function AtualizarPath() {
    $maquina = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $usuario = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$maquina;$usuario"
}

function Instalar($id, $comando, $nome) {
    if (Existe $comando) {
        Write-Host "   $nome ja esta instalado."
        return
    }
    Write-Host "   instalando $nome..."
    winget install --id $id --silent --accept-package-agreements --accept-source-agreements | Out-Null
    AtualizarPath
    if (-not (Existe $comando)) {
        throw "Instalei $nome mas o comando '$comando' nao apareceu. Feche esta janela, abra o PowerShell como administrador de novo e rode o instalador outra vez."
    }
}

Write-Host ''
Write-Host '  D&VFly - instalacao na VM' -ForegroundColor Cyan
Write-Host '  Esta janela vai fazer tudo. Leva uns 10 minutos na primeira vez.'

# ---- 1. o que falta na maquina ---------------------------------------------
Passo 'Conferindo o que falta instalar'
if (-not (Existe 'winget')) {
    throw 'Esta VM nao tem o winget (Instalador de Aplicativos). Instale-o pela Microsoft Store e rode o instalador de novo.'
}
Instalar 'Git.Git' 'git' 'Git'
Instalar 'OpenJS.NodeJS.LTS' 'node' 'Node.js'
Instalar 'CaddyServer.Caddy' 'caddy' 'Caddy (o HTTPS)'

# ---- 2. o codigo ------------------------------------------------------------
Passo "Baixando o codigo em $Raiz"
if (Test-Path (Join-Path $Raiz '.git')) {
    Push-Location $Raiz
    git fetch origin $Branch --quiet
    git checkout $Branch --quiet
    git reset --hard "origin/$Branch" --quiet
    Pop-Location
    Write-Host '   codigo atualizado.'
} else {
    git clone --branch $Branch $Repositorio $Raiz
    Write-Host '   codigo baixado.'
}

$ArquivoEnv = Join-Path $Raiz 'app\.env'

# ---- 3. as respostas que so voce sabe --------------------------------------
Passo 'Configuracao'

function ValorDoEnv($chave) {
    if (-not (Test-Path $ArquivoEnv)) { return '' }
    foreach ($linha in Get-Content $ArquivoEnv) {
        if ($linha -match "^\s*$chave\s*=\s*`"?([^`"]*)`"?\s*$") { return $Matches[1].Trim() }
    }
    return ''
}

function Confirmar($pergunta) {
    $resposta = Read-Host "   $pergunta (s/N)"
    return ($resposta.Trim().ToLower() -eq 's')
}

# O IP com que esta VM aparece para o mundo. Tres fontes: se a primeira estiver
# fora do ar, a conferencia nao pode virar um falso alarme.
function IpPublico() {
    foreach ($url in @('https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com')) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
            $ip = $r.Content.Trim()
            if ($ip -match '^\d{1,3}(\.\d{1,3}){3}$') { return $ip }
        } catch {
            # tenta a proxima
        }
    }
    return ''
}

function IpsDoDominio($dominio) {
    try {
        $enderecos = [System.Net.Dns]::GetHostAddresses($dominio)
        return @($enderecos | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.IPAddressToString })
    } catch {
        return @()
    }
}

function Perguntar($rotulo, $atual, $exemplo) {
    Write-Host ''
    if ($exemplo -ne '') {
        Write-Host "   $rotulo  $exemplo" -ForegroundColor Cyan
    } else {
        Write-Host "   $rotulo" -ForegroundColor Cyan
    }
    if ($atual -ne '') {
        Write-Host "   (ja configurado - Enter mantem o que esta la)"
    }
    # A seta deixa claro que a janela esta ESPERANDO, e nao travada.
    $resposta = Read-Host '   digite e pressione Enter'
    if ($resposta.Trim() -eq '') { return $atual }
    return $resposta.Trim()
}

<#
    As linhas do .env que o instalador NAO conhece, devolvidas como estao.

    Ele reescreve o arquivo inteiro a cada rodada - e por isso apagava os apps
    que o adicionar-app.ps1 tinha acrescentado (SHOPIFY_CLIENT_ID_2 e amigos):
    eles nao estao na lista fixa que ele escreve. A loja da segunda organizacao
    parava de entrar, sem nada na tela ligando uma coisa a outra.

    Entao o que veio de outro script volta junto. Vale para o que ainda vier:
    qualquer chave que o instalador nao escreve e preservada.
#>
function LinhasPreservadas($arquivo) {
    $nossas = @(
        'DATABASE_URL', 'DVFLY_TOKEN_KEY', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET',
        'SHOPIFY_API_VERSION', 'DVFLY_DEV_ORIGINS', 'DVFLY_AUTH', 'DVFLY_ALLOWED_SHOPS',
        'DVFLY_ACCESS_KEY', 'DVFLY_DOMAIN', 'DATABASE_URL_DIRECT'
    )
    $guardar = @()
    if (-not (Test-Path $arquivo)) { return $guardar }
    foreach ($linha in Get-Content $arquivo) {
        if ($linha -match '^\s*#' -or $linha.Trim() -eq '') { continue }
        if ($linha -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') { continue }
        $chave = $Matches[1]
        if ($nossas -contains $chave) { continue }
        $guardar += $linha
    }
    return $guardar
}

$Dominio = ValorDoEnv 'DVFLY_DOMAIN'
$ClientId = ValorDoEnv 'SHOPIFY_CLIENT_ID'
$ClientSecret = ValorDoEnv 'SHOPIFY_CLIENT_SECRET'
$Chave = ValorDoEnv 'DVFLY_TOKEN_KEY'
$Senha = ValorDoEnv 'DVFLY_ACCESS_KEY'

Write-Host ''
Write-Host '   O dominio e o endereco publico do app. Precisa ja estar apontando'
Write-Host '   para o IP desta VM (registro A no seu provedor de dominio).'
$Dominio = Perguntar 'Dominio do app' $Dominio '(ex.: app.seudominio.com)'
if ($Dominio -eq '') { throw 'Sem dominio nao da para ter HTTPS, e a Shopify so abre o app por HTTPS.' }

# O erro numero 1 desta instalacao e rodar antes de o DNS apontar: o Caddy nao
# consegue o certificado, o app sobe, e de fora nada abre - sem nenhuma pista.
# Melhor descobrir agora, com o conserto escrito na tela.
Passo 'Conferindo se o dominio ja aponta para esta VM'
$ipPublico = IpPublico
$ipsDoDominio = IpsDoDominio $Dominio
if ($ipPublico -eq '') {
    Aviso 'Nao consegui descobrir o IP publico desta VM (sem internet?). Sigo assim mesmo.'
} elseif ($ipsDoDominio.Count -eq 0) {
    Aviso "O dominio $Dominio ainda nao resolve para nenhum IP."
    Aviso "Crie o registro A apontando $Dominio para $ipPublico e espere alguns minutos."
    if (-not (Confirmar 'Continuar mesmo assim?')) { throw 'Instalacao interrompida. Rode de novo quando o dominio estiver apontando.' }
} elseif ($ipsDoDominio -contains $ipPublico) {
    Write-Host "   $Dominio aponta para esta VM ($ipPublico). Certo."
} else {
    Aviso "$Dominio aponta para $($ipsDoDominio -join ', '), e esta VM e $ipPublico."
    Aviso 'Se voce usa Cloudflare ou outro proxy na frente, isso e normal e pode seguir.'
    Aviso 'Se nao usa, corrija o registro A antes - senao o certificado HTTPS nao sai.'
    if (-not (Confirmar 'Continuar mesmo assim?')) { throw 'Instalacao interrompida. Ajuste o registro A e rode de novo.' }
}

$ClientId = Perguntar 'Client ID da Shopify' $ClientId '(Dev Dashboard - Client credentials)'
$ClientSecret = Perguntar 'Client secret da Shopify' $ClientSecret '(comeca com shpss_)'
if ($ClientId -eq '' -or $ClientSecret -eq '') {
    throw 'Sem as credenciais do app, o D&VFly nao consegue falar com a Shopify. Elas estao no Dev Dashboard, em Client credentials.'
}

if ($Chave -eq '') {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $Chave = [Convert]::ToBase64String($bytes)
    Write-Host '   Gerei a chave que criptografa o acesso as lojas no banco.' -ForegroundColor Green
    Aviso 'Guarde uma copia dela (esta em app\.env). Trocar essa chave obriga cada loja a abrir o app de novo.'
}

# A senha de acesso e o que impede uma loja desconhecida de usar o app mesmo
# tendo conseguido instalar. Fica em branco para quem nao quer trava - mas a
# pergunta e feita, porque uma protecao que so existe se alguem descobrir que
# existe nao protege ninguem.
Write-Host ''
Write-Host '   Senha de acesso: quem instalar o app so consegue usar depois de'
Write-Host '   digitar esta senha. Cada loja pede uma vez so. Deixe em branco'
Write-Host '   para nao ter trava.'
$Senha = Perguntar 'Senha de acesso ao app' $Senha '(ex.: uma frase que so voce sabe)'
if ($Senha -eq '') {
    Aviso 'Sem senha: qualquer loja que abrir o app vai poder usar.'
} else {
    Write-Host '   Trava ligada. Guarde a senha: ela esta em app\.env (DVFLY_ACCESS_KEY).' -ForegroundColor Green
}

# ---- 4. dependencias, banco e compilacao ------------------------------------
Passo 'Preparando o app (dependencias, banco e compilacao)'
# Se ja houver uma instalacao rodando, ela precisa parar antes: no Windows o
# `prisma generate` nao consegue substituir o motor do Prisma enquanto um
# processo o mantem aberto (EPERM).
. (Join-Path $Raiz 'deploy\windows\comum.ps1')
PararApp $PortaDoApp
Push-Location $Raiz

# O .env e escrito ANTES do setup: o banco e a compilacao leem dele.
$conteudo = @"
# Escrito pelo instalador da VM em $(Get-Date -Format 'dd/MM/yyyy HH:mm').
# Este arquivo nunca vai para o GitHub.
DATABASE_URL="file:./dvfly.db"
DVFLY_TOKEN_KEY="$Chave"
SHOPIFY_CLIENT_ID="$ClientId"
SHOPIFY_CLIENT_SECRET="$ClientSecret"
SHOPIFY_API_VERSION=""
DVFLY_DEV_ORIGINS=""
DVFLY_AUTH=""
DVFLY_ALLOWED_SHOPS=""
DVFLY_ACCESS_KEY="$Senha"
# Guardado aqui so para o instalador lembrar do dominio numa proxima rodada.
DVFLY_DOMAIN="$Dominio"
"@
# O que outro script escreveu aqui volta no fim - apps extras, principalmente.
$preservadas = LinhasPreservadas $ArquivoEnv
Set-Content -Path $ArquivoEnv -Value $conteudo -Encoding ASCII
if ($preservadas.Count -gt 0) {
    Add-Content -Path $ArquivoEnv -Value $preservadas -Encoding ASCII
    $apps = @($preservadas | Where-Object { $_ -match '^\s*SHOPIFY_CLIENT_ID_' }).Count
    if ($apps -gt 0) { Write-Host "   mantive $apps app(s) extra da Shopify que ja estavam configurados." }
}

Write-Host '   instalando dependencias (a primeira vez demora)...'
cmd /c 'npm run setup' | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'npm run setup falhou.' }
cmd /c 'npm run build' | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'A compilacao falhou.' }
Pop-Location
Write-Host '   app compilado.'

# ---- 5. o HTTPS -------------------------------------------------------------
Passo 'Configurando o HTTPS (Caddy)'
$PastaCaddy = Join-Path $Raiz 'deploy\windows'
$Caddyfile = Join-Path $PastaCaddy 'Caddyfile.gerado'
$modelo = Get-Content (Join-Path $PastaCaddy 'Caddyfile.template') -Raw
$modelo = $modelo.Replace('{{DOMINIO}}', $Dominio).Replace('{{PORTA}}', "$PortaDoApp")
Set-Content -Path $Caddyfile -Value $modelo -Encoding ASCII
Write-Host "   Caddyfile escrito para $Dominio."

Passo 'Abrindo as portas 80 e 443 no firewall'
foreach ($portaDaWeb in 80, 443) {
    $nome = "DVFly HTTPS $portaDaWeb"
    netsh advfirewall firewall delete rule name="$nome" | Out-Null
    netsh advfirewall firewall add rule name="$nome" dir=in action=allow protocol=TCP localport=$portaDaWeb | Out-Null
}
Write-Host '   portas liberadas.'

# ---- 6. as tarefas que mantem tudo de pe ------------------------------------
Passo 'Registrando as tarefas do Windows (sobem no boot, se reerguem sozinhas)'

function RegistrarTarefa($nome, $programa, $argumentos, $pasta) {
    $acao = New-ScheduledTaskAction -Execute $programa -Argument $argumentos -WorkingDirectory $pasta
    $gatilho = New-ScheduledTaskTrigger -AtStartup
    $conta = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    # Se o processo cair, o Windows reergue em 1 minuto, sem limite de vezes.
    $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
    if (Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $nome -Confirm:$false
    }
    Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Principal $conta -Settings $ajustes | Out-Null
    Start-ScheduledTask -TaskName $nome
    Write-Host "   $nome registrada e iniciada."
}

$caddy = (Get-Command caddy).Source
$pastaApp = Join-Path $Raiz 'app'

# O runner e escrito pela mesma funcao que o atualizador usa (comum.ps1), para
# que clicar em ATUALIZAR nunca deixe um arquivo velho para tras.
. (Join-Path $PastaCaddy 'comum.ps1')
$Runner = EscreverRunner $Raiz $PortaDoApp

RegistrarTarefa 'DVFly App' "$env:SystemRoot\system32\cmd.exe" "/c `"$Runner`"" $pastaApp
RegistrarTarefa 'DVFly HTTPS' $caddy "run --config `"$Caddyfile`"" $PastaCaddy

# ---- 7. o atalho de atualizar ----------------------------------------------
Passo 'Criando o atalho ATUALIZAR na area de trabalho'
$atalho = Join-Path ([System.Environment]::GetFolderPath('CommonDesktopDirectory')) 'ATUALIZAR DVFly.lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($atalho)
$link.TargetPath = Join-Path $Raiz 'ATUALIZAR-NA-VM.cmd'
$link.WorkingDirectory = $Raiz
$link.Description = 'Puxa a versao nova do D&VFly e reinicia'
$link.Save()
Write-Host '   atalho criado.'

# ---- 8. a prova -------------------------------------------------------------
Passo 'Conferindo se o app respondeu'
$ok = $false
foreach ($tentativa in 1..20) {
    Start-Sleep -Seconds 3
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$PortaDoApp/healthz" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) {
            Write-Host ''
            Write-Host ('   ' + $r.Content)
            $ok = $true
            break
        }
    } catch {
        Write-Host '   ainda subindo...'
    }
}

Write-Host ''
if ($ok) {
    Write-Host '  PRONTO. O D&VFly esta no ar nesta VM.' -ForegroundColor Green
    Write-Host ''
    Write-Host '  1. O HTTPS:'
    # O teste tem que passar PELO CADDY, e sem sair da maquina. Pedir
    # https://dominio daqui de dentro depende de a VM enxergar o proprio IP
    # publico (varias nao enxergam), e ai um "nao respondeu" nao significa
    # nada. Com --resolve a conexao vai para 127.0.0.1 com o nome certo no
    # SNI: e exatamente o caminho do visitante, medido de dentro.
    $codigo = CaddyPorDentro $Dominio
    if ($codigo -eq '200') {
        Write-Host "     https://$Dominio/healthz respondeu 200. Esta no ar." -ForegroundColor Green
    } elseif ($codigo -eq '502') {
        Write-Host '     O Caddy esta de pe, mas nao achou o app.' -ForegroundColor Red
        Write-Host "     O app esta na porta $PortaDoApp; o Caddy procura na porta $(PortaDoCaddyfile $Caddyfile)."
        Write-Host '     As duas tem que ser iguais. Rode o instalador de novo.'
    } elseif ($codigo -eq '') {
        Write-Host '     O Caddy nao respondeu aqui de dentro.' -ForegroundColor Yellow
        Write-Host '     Pode ser o certificado saindo (leva ate um minuto na primeira vez).'
        Write-Host '     Se depois de alguns minutos continuar assim:'
        Write-Host ("       Get-Content " + (Join-Path $PastaCaddy 'dvfly-acessos.log') + ' -Tail 30')
        Write-Host '     e confira as portas 80/443 no painel do provedor da VM.'
    } else {
        Write-Host "     O Caddy respondeu $codigo (esperado 200)." -ForegroundColor Yellow
        Write-Host '     Rode: powershell -ExecutionPolicy Bypass -File C:\dvfly\deploy\windows\diagnosticar.ps1'
    }
    Write-Host ''
    Write-Host '  2. Na SUA maquina, no shopify.app.toml, troque os dois enderecos por'
    Write-Host "     https://$Dominio  e rode:  npx shopify app deploy"
    Write-Host ''
    Write-Host '  3. Abra o app dentro do admin da loja. Ele se instala sozinho.'
    Write-Host ''
    Write-Host '  Para publicar uma versao nova: clique em ATUALIZAR DVFly, na area de trabalho.'
} else {
    Write-Host '  O app nao respondeu.' -ForegroundColor Red
    foreach ($tarefa in 'DVFly App', 'DVFly HTTPS') {
        $info = Get-ScheduledTaskInfo -TaskName $tarefa -ErrorAction SilentlyContinue
        if ($info) {
            Write-Host ("    " + $tarefa + ': ultimo resultado ' + $info.LastTaskResult)
        }
    }
    Write-Host '  (resultado 0 = rodou; 1 ou 267011 = o processo nao chegou a subir)'
    Write-Host ''
    MostrarLog $Raiz 25
    Write-Host ''
    Write-Host '  Veja o que ele disse:'
    Write-Host '    Get-ScheduledTask "DVFly App" | Get-ScheduledTaskInfo'
    Write-Host "    cd $Raiz\app ; node server.mjs"
    Write-Host '  A segunda linha roda o app na sua frente e mostra o erro.'
}
Write-Host ''
