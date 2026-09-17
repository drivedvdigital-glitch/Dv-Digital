# O que o instalador e o atualizador precisam fazer igual.
#
# Existe porque a primeira versao deixava a geracao do runner SO no instalador:
# quem clicava em ATUALIZAR levava codigo novo e continuava com o arquivo velho
# chamando `node` pelo nome - que e justamente o que nao funciona dentro de uma
# tarefa agendada. Duas copias da mesma verdade viram uma verdade so quando
# alguem lembra de mudar as duas.

function CaminhoDoNode() {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) { return $node.Source }
    # A tarefa roda como SYSTEM, que pode ter um PATH mais velho que o desta
    # janela; os lugares onde o instalador do Node.js poe o executavel.
    foreach ($tentativa in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe")) {
        if (Test-Path $tentativa) { return $tentativa }
    }
    throw 'Nao achei o node.exe nesta maquina. Rode o instalador (docs\HOSPEDAGEM.md).'
}

<#
    Escreve o .cmd que a tarefa "DVFly App" executa.

    Duas coisas que so se descobrem na VM estao aqui dentro:

      - o caminho COMPLETO do node. O servico de Tarefas entrega aos filhos o
        ambiente de quando ELE subiu; nesta VM, antes de o Node existir. Chamar
        "node" ali da "nao reconhecido", a tarefa morre na hora, e a saida de
        uma tarefa agendada nao vai para lugar nenhum: o app simplesmente nao
        aparece.
      - as variaveis ficam no processo do app, nao na maquina. Esta VM tem
        outros programas rodando, e um NODE_ENV=production global mudaria o
        comportamento deles sem ninguem entender por que.
#>
function EscreverRunner($raiz, $porta) {
    # Guarda contra a armadilha que custou um dia: a porta chegava 443 aqui (um
    # `foreach ($porta in 80, 443)` do instalador escrevia por cima da variavel,
    # porque nome de variavel no PowerShell nao diferencia maiusculas). O app
    # subia na 443, respondia lindamente em 127.0.0.1:443 - e o Caddy, que
    # procurava na 3000, devolvia 502 para o mundo inteiro. Tudo parecia certo
    # de dentro. A porta do app nunca e a porta do servidor web: dizer isso em
    # voz alta e mais barato do que descobrir de novo.
    if ("$porta" -notmatch '^\d+$' -or [int]$porta -lt 1024 -or [int]$porta -gt 65535) {
        throw "Porta invalida para o app: '$porta'. Tem que ser entre 1024 e 65535 (a 80 e a 443 sao do Caddy)."
    }
    $pastaApp = Join-Path $raiz 'app'
    $runner = Join-Path $raiz 'deploy\windows\rodar-app.gerado.cmd'
    $log = CaminhoDoLog $raiz
    $node = CaminhoDoNode
    # A saida vai para um arquivo. Sem isso, um app que morre ao subir nao
    # deixa rastro nenhum: tarefa agendada joga stdout e stderr fora, e a
    # unica pista que sobra e "nao respondeu". O log e zerado quando passa de
    # 5 MB, para nunca encher o disco num ciclo de reinicios.
    $conteudo = @"
@echo off
rem Escrito pelo instalador/atualizador. Nao edite: e reescrito a cada vez.
set NODE_ENV=production
set HOST=127.0.0.1
set PORT=$porta
set DVFLY_LOG=$log
if exist "%DVFLY_LOG%" for %%F in ("%DVFLY_LOG%") do if %%~zF GTR 5000000 del "%DVFLY_LOG%"
cd /d "$pastaApp"
echo [%date% %time%] subindo o D&VFly na porta $porta >> "%DVFLY_LOG%"
"$node" server.mjs >> "%DVFLY_LOG%" 2>&1
echo [%date% %time%] o processo terminou com codigo %errorlevel% >> "%DVFLY_LOG%"
"@
    Set-Content -Path $runner -Value $conteudo -Encoding ASCII
    return $runner
}

<# Onde o app escreve o que aconteceu com ele. #>
function CaminhoDoLog($raiz) {
    return (Join-Path $raiz 'app\dvfly.log')
}

<# As ultimas linhas do log, para quando o app nao responde. #>
function MostrarLog($raiz, $linhas) {
    $log = CaminhoDoLog $raiz
    if (-not (Test-Path $log)) {
        Write-Host '   (o app ainda nao escreveu nada no log)'
        return
    }
    Write-Host "   ultimas linhas de $log :" -ForegroundColor Cyan
    Get-Content $log -Tail $linhas | ForEach-Object { Write-Host "     $_" }
}

<# Porta que o runner esta usando, para conferir a saude no endereco certo. #>
function PortaDoRunner($raiz, $padrao) {
    $runner = Join-Path $raiz 'deploy\windows\rodar-app.gerado.cmd'
    if (Test-Path $runner) {
        foreach ($linha in Get-Content $runner) {
            if ($linha -match '^\s*set PORT=(\d+)') {
                # Uma instalacao feita antes do conserto deixou `set PORT=443`
                # neste arquivo. Ler isso de volta so espalharia o erro: a porta
                # do servidor web nunca e a porta do app.
                if ([int]$Matches[1] -ge 1024) { return $Matches[1] }
            }
        }
    }
    return $padrao
}

<# A porta que o Caddy procura, lida do Caddyfile que o instalador gerou. #>
function PortaDoCaddyfile($caddyfile) {
    if (Test-Path $caddyfile) {
        foreach ($linha in Get-Content $caddyfile) {
            if ($linha -match 'reverse_proxy\s+127\.0\.0\.1:(\d+)') { return $Matches[1] }
        }
    }
    return '?'
}

<#
    Bate no app PELO CADDY sem sair da maquina, e devolve o codigo HTTP.

    Pedir https://dominio de dentro da VM nao serve de prova: muitas VMs nao
    enxergam o proprio IP publico, e a falha ali nao diz nada sobre o app. O
    --resolve manda a conexao para 127.0.0.1 com o nome certo no SNI - o mesmo
    caminho do visitante, medido por dentro.

    O -k e de proposito: aqui se mede se o Caddy ALCANCA o app. Se o certificado
    ainda estiver saindo, um erro de certificado esconderia a unica resposta que
    importa (200 x 502).
#>
function CaddyPorDentro($dominio) {
    $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
    if (-not (Test-Path $curl)) { return '' }
    $codigo = & $curl -s -k -o NUL -w '%{http_code}' --max-time 25 --resolve "${dominio}:443:127.0.0.1" "https://$dominio/healthz" 2>$null
    $codigo = "$codigo".Trim()
    if ($codigo -eq '000') { return '' }
    return $codigo
}

<#
    Para o app antes de compilar. Obrigatorio no Windows: o `prisma generate`
    substitui `query_engine-windows.dll.node`, e um arquivo aberto por um
    processo nao pode ser substituido - a compilacao morre com
    "EPERM: operation not permitted, rename ...". No Linux isso funciona, que e
    por que a armadilha so aparece aqui.

    So a tarefa e parada: nada de matar processos por nome, porque esta VM tem
    outros programas em node rodando e derrubar o alheio nao e conserto.
#>
function PararApp() {
    if (Get-ScheduledTask -TaskName 'DVFly App' -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName 'DVFly App' -ErrorAction SilentlyContinue
        # O Windows leva um instante para soltar o arquivo depois que o
        # processo morre.
        Start-Sleep -Seconds 3
    }
}

function IniciarApp() {
    if (Get-ScheduledTask -TaskName 'DVFly App' -ErrorAction SilentlyContinue) {
        Start-ScheduledTask -TaskName 'DVFly App'
    }
}

<# Espera o app responder; devolve $true quando responde. #>
function EsperarApp($porta, $tentativas) {
    foreach ($tentativa in 1..$tentativas) {
        Start-Sleep -Seconds 2
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$porta/healthz" -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200) { return $true }
        } catch {
            # ainda subindo
        }
    }
    return $false
}
