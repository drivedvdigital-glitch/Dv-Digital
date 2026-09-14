# Como a loja realmente trabalha hoje

> **Primeira pesquisa com usuário do projeto — e o usuário é você.**
>
> Tudo até aqui era pesquisa de concorrente: o que o PageFly faz, como ele falha, que APIs a
> Shopify oferece. Este documento é outra coisa: é o registro de **como o D&VFly vai ser usado de
> verdade**, observado numa gravação de 6min07s de operação real.
>
> É o documento mais importante da Fase 2, porque muda a prioridade de coisas que a pesquisa de
> mercado tinha colocado no lugar errado.

---

## 0. Fonte e método

Gravação de tela de 6min07s (1916×892, sem narração), da operação real na Shopify. Foi baixada,
fatiada em frames com `ffmpeg` e lida quadro a quadro.

O que está aqui é **o que aparece na tela**. Onde eu inferi, está dito que é inferência — e o
final do documento lista as perguntas que a gravação não responde.

---

## 1. O achado que muda o projeto

### O que eu esperava ver

Alguém arrastando blocos de uma biblioteca para um canvas. Foi para isso que a pesquisa
dimensionou 56 itens P0, sendo 20 deles blocos.

### O que realmente acontece

Na página `El error que millones repiten cada día`, a árvore inteira tem **dois elementos**:

```
PageFly body
└── Seção
    └── Linha
        └── Coluna
            ├── </> Código GTM        (oculto — pixel de rastreio)
            └── </> Landing Page      (a página inteira)
```

O elemento `Landing Page` é um bloco **HTML/Liquid**. Selecionado, o inspector inteiro mostra
exatamente um controle:

> **Conteúdo** → `[ Abrir editor de código ]`
> *"O código Líquido incorporado só funciona na página ativa."*

**A landing page inteira — manchete, corpo, prova social, CTA — é um bloco de HTML escrito à
mão.** O construtor visual não está sendo usado para construir. Está sendo usado como:

1. **Encanamento da Shopify** — criar a página, o template, atribuir a produtos, publicar
2. **Hospedagem do HTML** — um lugar onde o markup vive e é editável
3. **Preview responsivo** — na gravação, o seletor está em 320px conferindo o mobile
4. **Integração com o tema** — mostrar/esconder header e footer, ordenar seções

> Isso não é crítica ao seu método — é a **descoberta de requisito mais valiosa que o projeto
> teve**. A pesquisa de mercado me fez dimensionar uma biblioteca de blocos porque é isso que o
> concorrente vende. A operação real diz outra coisa.

---

## 2. O fluxo completo, como observado

```
 1. Shopify admin → PageFly → Páginas          "Usando 40 slots"
 2. Criar página (tipo Produto ou Bloco)
 3. Colar o HTML no bloco HTML/Liquid          ← aqui mora o trabalho real
 4. Conferir no mobile (320px)
 5. Configurações: esconder header/footer do tema
 6. Atribuição: escolher os produtos que usam este design
 7. Publicar
 8. Ir ao EDITOR DE TEMAS da Shopify           ← passo que eu não tinha mapeado
    └── ordenar a seção do PageFly entre as seções do tema
    └── escolher qual template cada produto usa
 9. Conferir na loja ao vivo
```

O **passo 8 não estava em nenhum documento meu.** Depois de publicar, o trabalho continua no
editor de temas da Shopify, onde a seção `PageFly Page 4f4ffdfa` aparece no meio das seções do
tema (Informações do produto, Horizontal Ticker, Produtos relacionados, Testimonials, Apps…) e
precisa ser posicionada.

---

## 3. O que a tela confirmou da pesquisa

Três coisas que eu tinha documentado só pela API apareceram funcionando:

| Documentado em | Confirmado na tela |
|---|---|
| Apêndice A.2 — `templateSuffix` | Campo **"Nome do modelo: `pf-4f4ffdfa`"** nas configurações da página |
| Seção 1.1 — Page Assignment | Painel de atribuição com busca de produtos e "Aplicar para Personalizar Produto" |
| Seção 1.1 — Theme's Sections | Checkbox **"Mostrar cabeçalho e rodapé"**, desmarcado |

E um detalhe novo: o editor de temas mostra os templates **com contagem de uso** — "Produto padrão
(atribuído a 100+ produtos)", "semilla (5 produtos)", "landing-page", "landing-page-2". Ou seja,
existe um **sistema de templates nomeados** rodando sobre um catálogo grande.

---

## 4. O perfil de operação

Extraído do que aparece nas telas, não de suposição:

| Observação | Evidência na tela |
|---|---|
| **Venda por COD** (pagamento na entrega) | "Pago contra entrega", "Pedir Ahora y Pagar al Recibir" |
| **Multi-país** | Admin em pt-BR, loja em espanhol; páginas nomeadas `250-CO-S-…`, `08-MX-S-…` (CO = Colômbia, MX = México) |
| **Catálogo grande de páginas** | "Usando 40 slots"; lista com dezenas de páginas |
| **Formato advertorial** | "El error que cometen millones de personas…", "El dolor en el nervio ciático no es muscular…" — matéria jornalística que vende |
| **Muitas páginas despublicadas** | Quase toda a lista em "Despublicado" — são variantes e testes |
| **Editor Legacy** | Ambas as páginas com o selo "Legado" |
| **Nomenclatura sistemática** | `250-CO-S-semilla` = SKU-país-tamanho-produto, igual aos arquivos do Drive |

O tipo de página **"Bloque"** (seção) aparece tanto quanto "Produto" na listagem — seções
reutilizáveis são parte central do método, não acessório.

---

## 5. O que isso muda na priorização

A pesquisa fechou em 56 P0 / 54 P1 / 35 P2. **Este documento não muda a lista — muda a ordem e o
peso.**

### Sobe muito

| Item | Era | Vira | Porquê |
|---|---|---|---|
| **Bloco HTML/Liquid com editor de código decente** | P0, um item entre 20 blocos | **P0 nº 1** | É onde o trabalho real acontece. Precisa de destaque de sintaxe, formatação, busca, e não pode ser um `<textarea>` |
| **Compor com as seções do tema** | P1 | **P0** | O passo 8 do fluxo. Sem isso, a página publicada não fica no lugar certo |
| **Esconder header/footer por página** | P1 | **P0** | Desmarcado em toda landing observada |
| **Preview mobile fiel** | P0 (já era) | **P0, primeiro** | Foi a única verificação feita na gravação |
| **Seções reutilizáveis ("Bloque")** | P1 | **P0** | Metade da lista de páginas é deste tipo |
| **Lista de páginas com busca, filtro e status** | P2 (!) | **P0** | Com dezenas de páginas, a listagem é a tela mais usada depois do editor |
| **Atribuição a produtos** | P1 | **P0** | Faz parte de toda publicação de página de produto |

### Desce

| Item | Era | Vira | Porquê |
|---|---|---|---|
| **Biblioteca ampla de blocos visuais** | 20 itens P0 | **~6 P0, resto P1** | Hero, texto, imagem, botão, FAQ e repetidor cobrem o observado. O resto pode esperar |
| **Templates prontos** | P0 | **P1** | O conteúdo vem de HTML próprio, não de template do app |
| **Edição inline de texto** | P0 | **P1** | Promovi na análise de UX porque é o gesto mais frequente *num builder de blocos*. Não é o gesto mais frequente **aqui** |

> A promoção da edição inline continua certa **como princípio de interface** (regra U3). O que
> muda é a urgência: se o texto mora dentro de um bloco de HTML, editar inline não é o caminho
> crítico do MVP.

### Entra novo

| Item | Prioridade | Porquê |
|---|---|---|
| **Importar HTML e converter em árvore de blocos** | **P1** | A ponte entre como você trabalha hoje e o que o compilador sabe otimizar |
| **Duplicar página como ponto de partida** | **P0** | Com `250-CO-S-…` e `08-MX-S-…`, variar uma página existente é o gesto de criação real |
| **Campo de código de rastreio por página** | **P1** | O "Código GTM" hoje é um bloco HTML oculto — merece campo próprio |
| **Gestão em lote** (publicar/despublicar/excluir vários) | **P1** | Com 40 slots e dezenas de páginas, agir de um em um não escala |

---

## 6. A tensão que isto cria — e ela é boa

Existe um conflito aparente entre o achado e a arquitetura, e vale encarar de frente.

**A arquitetura diz:** o editor produz um documento de dados, e o compilador emite HTML otimizado.
É isso que entrega os 10,1 KB e o CSS deduplicado medidos no protótipo.

**A operação real diz:** o conteúdo chega como um bloco de HTML escrito à mão.

Se o HTML entra cru e sai cru, **o compilador não otimiza nada** — o D&VFly vira um campo de texto
com deploy, e a vantagem de performance evapora.

### Três saídas, e a recomendação

| Saída | O que é | Avaliação |
|---|---|---|
| **A. Passar o HTML adiante** | O bloco emite o markup como veio | Simples, honesto, mas perde a tese do projeto |
| **B. Importar HTML → árvore de blocos** | Um parser converte o HTML em nós na importação; dali em diante é documento de dados | Melhor dos dois mundos, mas parser de HTML arbitrário é trabalhoso e nunca perfeito |
| **C. Otimizar o HTML na compilação** | O HTML segue como bloco, mas passa por um passe de otimização no publish: extrai CSS inline para o stylesheet escopado, adiciona `width`/`height`/`loading` nas imagens, valida a semântica | **Recomendada** |

**Por que a C.** Ela não te obriga a mudar de método, entrega a maior parte do ganho de
performance, e é muito mais barata que um parser completo. O HTML continua sendo a fonte, e o
compilador vira um **otimizador** em vez de um gerador — o que, para este uso, é o papel certo.

A B fica como P1: quando existir, você ganha a opção de editar visualmente o que hoje só existe
como markup. Mas ela deixa de ser pré-requisito.

---

## 7. O que a gravação não respondeu

Honestidade sobre os limites — são perguntas, não conclusões:

1. **O HTML de bloco único é a regra ou foi o caso desta página?** Na segunda página observada
   (`250-CO-S-semilla`), o painel estava em Configurações e a árvore não ficou visível. Vi o
   método uma vez com clareza, não N vezes.
2. **De onde vem o HTML?** Escrito à mão, gerado por IA, copiado de outra página? Muda bastante o
   desenho da importação.
3. **Por que o editor Legacy e não o Gen 2?** Escolha deliberada, páginas antigas, ou o Gen 2
   exige um plano que você não tem?
4. **As colunas Heatmap e A/B Test da listagem são usadas?** Apareceram na tela; não vi uso.
5. **Sem narração, não sei onde você travou.** Frames mostram o que está na tela, não a irritação.
   Se algo te fez perder tempo na gravação, isso continua sendo a informação mais valiosa que você
   pode me dar — e só você tem.
