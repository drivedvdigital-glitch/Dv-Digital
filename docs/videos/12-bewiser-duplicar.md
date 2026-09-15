# RELATÓRIO 12 — Be Wiser Clips · Duplicar elementos (1:26)

ID `VQJn7-KxMzM` · gen-2, Winter '26.

## Implementado no D&VFly (15/09)

- **"Cópia de <nome>"** na duplicação — visível na árvore, no breadcrumb e na etiqueta
  da barra flutuante do canvas ao mesmo tempo. Cópia continua entrando logo após o
  original (já era assim) e sem confirmação/toast (reversível: Ctrl+Z).
- **Regra promovida ao CLAUDE.md**: fricção proporcional à reversibilidade — ação
  reversível não pede confirmação; destrutiva de página inteira pede gesto extra
  (é como já calibramos: duplicar/excluir bloco direto + undo; excluir página em 2
  cliques; o modal de template virá com checkbox quando existir galeria).

## Já tínhamos (confirmações)

- Três caminhos pro duplicar: barra flutuante ⧉, ops do inspetor ⧉, Ctrl+D ✓
- Nível semântico (H1-H6) separado do tamanho visual ✓ (deles: campo "HTML tag")
- Cópia após o original ✓ · sem modal ✓

## Sync item / Object unsynced (a pendência mais interessante)

Painel do Content list deles: "Sync item Yes|No (padrão No)" + "Object unsynced:
Container" — nenhum vídeo explica. Leitura provável: itens compartilham
estrutura/estilo e editar um propaga. **Nosso Repetidor JÁ é isso por construção**
(uma subárvore × linhas de dados = sync sem toggle); quando acharem um vídeo que abra
o deles, comparar os dois modelos.

## Pendências novas

Menu de overflow da barra flutuante (chevron) · rótulos dos 7 ícones (ilegíveis na
gravação — corretamente não chutados) · barra de formatação varia por elemento (3
fileiras no Heading × 2 no Button).
