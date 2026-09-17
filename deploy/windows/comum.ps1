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
    $pastaApp = Join-Path $raiz 'app'
    $runner = Join-Path $raiz 'deploy\windows\rodar-app.gerado.cmd'
    $node = CaminhoDoNode
    $conteudo = @"
@echo off
rem Escrito pelo instalador/atualizador. Nao edite: e reescrito a cada vez.
set NODE_ENV=production
set HOST=127.0.0.1
set PORT=$porta
cd /d "$pastaApp"
"$node" server.mjs
"@
    Set-Content -Path $runner -Value $conteudo -Encoding ASCII
    return $runner
}

<# Porta que o runner esta usando, para conferir a saude no endereco certo. #>
function PortaDoRunner($raiz, $padrao) {
    $runner = Join-Path $raiz 'deploy\windows\rodar-app.gerado.cmd'
    if (Test-Path $runner) {
        foreach ($linha in Get-Content $runner) {
            if ($linha -match '^\s*set PORT=(\d+)') { return $Matches[1] }
        }
    }
    return $padrao
}
