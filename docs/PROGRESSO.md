# D&VFly — Progresso

Page builder visual para Shopify, app privado. Interface em pt-BR, código e comentários em inglês.

## Status geral

| Fase | Descrição | Status |
|---|---|---|
| 1 | Pesquisa de mercado (referência: PageFly) | ✅ Concluída — verificada em fontes primárias |
| 2 | Arquitetura | ✅ Concluída — R1 fechado |
| 3 | MVP | 🔨 Em andamento — app publicando em loja real |
| 4 | Recursos P1 | ⬜ Não iniciada |

---

## Fase 1 — Pesquisa ✅

**Entregue:** `docs/PESQUISA_PAGEFLY.md`

### Passada 1 — levantamento inicial

Inventário funcional por categoria, linha do tempo das atualizações, reclamações de usuários
mapeadas para oportunidades, e tabela de priorização com 106 itens (43 P0 / 37 P1 / 26 P2).
Feito **por busca web**, porque o ambiente daquela sessão tinha egresso bloqueado para
`help.pagefly.io`, `pagefly.io`, `apps.shopify.com` e `shopify.dev`. Tudo que ficou incerto foi
marcado com ⚠️.

### Passada 2 — verificação por leitura direta

Este ambiente tem acesso pleno à rede. As fontes foram **lidas**, não resumidas por busca.

**O que foi lido**

- **Central de ajuda do PageFly** — árvore completa mapeada pelo `sitemap-pages.xml` e pelo
  índice `llms.txt`; **as 241 páginas em inglês foram baixadas em Markdown e lidas**.
- **Shopify App Store** — listagem do app e a aba de reviews com filtro de 1, 2 e 3 estrelas
  (**85 depoimentos lidos na íntegra**).
- **pagefly.io** — página de preços, páginas de produto (AI page builder, heatmap) e o post de
  release 4.20.0.
- **Trustpilot** — ficha do produto.
- **shopify.dev** — Admin GraphQL (páginas, temas, produtos, coleções, arquivos, metafields),
  arquitetura de templates de tema, theme app extensions, access scopes, apps customizados
  criados pelo admin, e o status da REST Admin API. Versão de API `2026-07`.

**O que foi corrigido em relação à passada 1**

| Item | Antes | Agora |
|---|---|---|
| Integrações | "130+" | **210 apps** em 20 categorias, contados na listagem oficial |
| Preços | 3 planos (Free / PAYG ~US$ 24 / Unlimited US$ 99, com opção anual) | **5 planos self-serve** (Free · Builder US$ 24 · Optimize US$ 39 · Accelerate US$ 99 · Power US$ 199) + 3 tiers enterprise (US$ 299/499/999). **Não há plano anual** |
| Avaliações | "~4,9 com ~6.000 avaliações" | **4,9 / 5 com 5.899**, distribuição completa (70 de 1★, 21 de 2★, 27 de 3★) |
| Desinstalação | "dados apagados com janela de ~24 h" | **Exclusão imediata e irreversível**, sem carência e sem backup do fornecedor |
| Página de produto/coleção | "substitui o template" | **Dois modos** — anexa conteúdo ao nativo *ou* substitui; quem decide é a composição do template JSON |
| Galeria de imagens | listada como elemento | **Não existe** como elemento; monta-se com Content List ou Slideshow |
| Mídia 3D | listada como elemento | É um **tipo de mídia** dentro do bloco de produto |
| Sombra | "box-shadow e text-shadow" | **Só box-shadow** |
| Estrutura do editor | Seção → Linha → Coluna → Elemento | **Dois motores**: Legacy (linha/coluna) e **Gen 2** (flex, desde a 4.23.0) |
| Total de itens priorizados | 106 (43/37/26) | **145 (56 P0 / 54 P1 / 35 P2)**, contados nas tabelas |

**O que foi confirmado (⚠️ removidos)**

- Histórico de versões: **50 salvamentos manuais**; autosaves não entram.
- Créditos de IA do plano free: **10 por mês**.
- Imagem de compartilhamento social: **é campo nativo**, exclusivo de páginas Regular.
- Limites técnicos: **256 KB por página** (limite da Shopify), 20 MB por imagem, **1.000 templates
  JSON por tema** — acima disso o app cai para template Liquid.
- Publicação: tudo sai como **template JSON**, em temas OS 1.0 e OS 2.0.
- Ausência de agendamento de publicação de página (só o início de teste A/B é agendável).

**O que a leitura direta revelou e não estava mapeado**

- **Editor Gen 2** (versão 4.23.0): flex sections e blocks, sem linha/coluna, exclusivo dos planos
  por slot. É a mudança arquitetural mais profunda do concorrente no período.
- **Universal Elements**: conversão de tipo de elemento (texto estático ↔ dado dinâmico) como
  propriedade do modelo de dados.
- **Cart Drawer**: superfície inteira nova, com Reward Ladder e Bundle Offers rodando como
  **Shopify Functions** e exigindo scopes de `cart_transforms` e `discounts`.
- **CRO Center**: section insights com engagement score, sales funnel, heatmaps por seção,
  A/B bayesiano com agendamento, co-piloto de analytics com detecção de anomalia.
- **AEO Optimizer** e **conector MCP** — o ciclo "agentic" de 2026.
- **Market localization** por Shopify Market.
- Elementos não mapeados: checkout dinâmico, indicador de estoque, sticky bar de produto,
  app block do OS 2.0, comparador de imagens, formulário de busca, vendor.

**Seção 3 (reclamações) — aprofundada com os depoimentos reais**

A minoria negativa é pequena mas consistente, e vem **desproporcionalmente de contas antigas e
lojas grandes** — são falhas que aparecem com escala e com o tempo. Os padrões, em ordem de
frequência, e a decisão de arquitetura que cada um gera:

1. **O editor não bate com a página publicada** → um motor de renderização só; o preview é o
   output do próprio compilador.
2. **Atualizações do app quebram páginas prontas** → o publish congela o output; versionar o
   compilador junto com a página; nunca migrar o usuário à força.
3. **O app suja o tema, e a sujeira escala** (o guia oficial de desinstalação manda o lojista
   apagar arquivos Liquid, código no `theme.liquid` e um bloco no `en.default.json` **à mão**;
   houve caso relatado de 3.000+ páginas duplicadas após backup de tema) → pegada mínima e
   inventário auditável.
4. **Lock-in** (export `.pagefly` sem HTML e sem imagens) → export estático, JSON aberto,
   conteúdo que vive no Shopify.
5. **Instabilidade** (perda de acesso ao console, editor degradando perto do teto de 256 KB) →
   o storefront nunca pode depender do nosso backend.
6. **Suporte** que edita o tema do cliente direto e já publicou página inacabada no ar →
   publicar é sempre explícito e reversível.
7. **Performance e SEO** (Lighthouse 23 no template básico do próprio fornecedor, enquanto o
   artigo oficial nega qualquer impacto) → performance como critério de aceite.
8. **Responsividade dá trabalho dobrado** → herança de breakpoint explícita e visível.
9. **Slots e preço** → irrelevante para nós, e essa é a vantagem.
10. **Curva de aprendizado e HTML incorreto** (links de produto são handlers de clique, não
    `<a href>`) → HTML semântico correto por padrão.
11. **Dependência do app para editar** → gerar seção Liquid real com `schema`.

**Novo Apêndice A — APIs da Shopify (destrava a Fase 2)**

Documentado a partir de `shopify.dev`, versão `2026-07`:

- **A.1 Páginas:** `pageCreate` / `pageUpdate` / `pageDelete` e o shape completo dos inputs.
  Publicar/despublicar é o campo `isPublished`; `publishDate` dá **agendamento nativo**;
  `redirectNewHandle` preserva links ao renomear; `body` aceita HTML — encaixe exato da nossa
  arquitetura de compilar para HTML.
- **A.2 Templates alternativos:** os dois passos (escrever `templates/<tipo>.<sufixo>.json` com
  `themeFilesUpsert`, depois apontar o recurso com `templateSuffix` em `productUpdate` /
  `collectionUpdate` / `pageUpdate`), mais os limites de 1.000 templates JSON, os tipos que não
  podem ser JSON, e os templates contextuais por mercado.
- **A.3 Theme App Extensions:** app blocks vs. app embeds comparados em declaração, posição,
  ativação, acesso a dados dinâmicos e caso de uso; os limites validados no deploy (10 MB, 30
  blocks, 100 KB de Liquid); as restrições (não renderizam no checkout, sem
  `content_for_layout`); e o **deep linking**, que insere um bloco no template sem escrever no tema.
- **A.4 Scopes** para o `shopify.app.toml`, por etapa.
- **A.5 REST:** legada desde 01/10/2024; GraphQL obrigatória para novos apps públicos desde
  01/04/2025. O recurso Asset tem restrição própria e mais antiga.
- **A.6** Todas as URLs consultadas.

**O que permanece incerto — e por quê**

| Item | Motivo |
|---|---|
| Datas das versões anteriores à 4.20.0 | O PageFly **removeu do ar** as notas de release: só a 4.20.0 (20/01/2025) ainda responde; as demais dão 404 ou redirecionam para o índice do blog. O Internet Archive está bloqueado neste ambiente |
| Versões acima da 4.20.0 | O PageFly **parou de publicar release notes**. Não há changelog. O conteúdo das versões novas foi recuperado dos blocos "Version Update" dentro dos artigos da documentação, mas **sem datas** |
| Reviews em G2 e Capterra | 403/404 por proteção anti-bot |
| Contagem exata de templates | Todas as fontes do fornecedor dizem "320+"; não há listagem pública para conferir |
| Detalhes internos de renderização do concorrente | Não são documentados publicamente; só instalando o app e inspecionando o output |
| **Se `write_themes` exige isenção da Shopify para app privado** | **A documentação da Shopify se contradiz** — ver abaixo |

### ⚠️ Risco levantado aqui, ainda aberto

A Fase 1 encontrou uma contradição na documentação da Shopify sobre escrita em arquivos de tema:
as mutations de arquivo de tema exigem `write_themes` **e uma isenção**, enquanto a página que
explica a restrição a limita a apps **distribuídos na App Store** e a página de apps customizados
lista `write_themes` como atribuível normalmente pelo lojista. O D&VFly é privado. A pesquisa
registrou a ambiguidade em vez de preencher com suposição.

Segue aberto e virou o **R1** da Fase 2 — ver adiante, com o passo a passo para resolver.

**Propriedade intelectual:** nenhum código, CSS, HTML, ícone, imagem, texto de interface ou
template do concorrente foi copiado para o repositório. As páginas de documentação baixadas para
leitura ficaram em diretório temporário fora do repositório e não foram versionadas. A marca do
concorrente aparece apenas neste material interno de pesquisa competitiva, nunca no produto.

---

## Fase 2 — Arquitetura ✅

**Entregue:** `docs/ARQUITETURA.md` e o spike em `prototype/`.

### Protótipo do compilador — a tese está verificada

Antes de escrever a arquitetura, o núcleo dela foi construído e **medido**. A tese do projeto é
uma afirmação sobre bytes, e afirmação sobre bytes se verifica.

`prototype/` compila um documento de blocos (JSON) para HTML + CSS estáticos. Roda com Node 22.6+
e **zero dependências instaladas**:

```sh
cd prototype
node --experimental-strip-types bin/build.ts
node --experimental-strip-types --test "test/*.test.ts"
```

Resultado na landing de exemplo — hero, 6 cards de benefício, 12 depoimentos, oferta com contador
e FAQ de 8 itens, 78 nós:

| Medida | Resultado |
|---|---|
| HTML | 7,1 KB |
| CSS | 2,6 KB |
| JS | 0,3 KB — só o contador pediu runtime |
| **Total** | **10,1 KB** |
| Teto de template da Shopify | 256 KB — **usando 3,9%** |
| Reúso de CSS | 32 regras para 107 pedidos de estilo (**3,3×**) |
| Tempo de compilação | ~5 ms |

Os três números que decidiram coisas:

- **3,9% do teto.** O concorrente documenta que páginas com muitos elementos aninhados estouram os
  256 KB e orienta a *remover elementos*. Compilando para HTML estático, sobra folga de 25×.
- **3,3× de reúso.** Doze depoimentos de estilo idêntico emitem **uma** regra, não doze. É a
  confirmação de que o repetidor genérico encolhe o output em vez de aumentá-lo — justifica ele
  ser P0.
- **5 ms.** Recompilar a cada edição cabe dentro de um frame. Foi isso que liberou o canvas a
  mostrar o output real em vez de um espelho — a decisão D5.

**18 testes** travam os invariantes (compilador puro, zero JS por padrão, accordion em
`<details>`, link é `<a href>`, `javascript:` descartado, texto escapado, imagem com dimensões e
lazy, classes prefixadas, breakpoints mobile-first, bloco desconhecido falha alto).

### Duas suposições de stack que estavam desatualizadas

O `PROGRESSO.md` anterior previa **Remix + Polaris React**. As duas caíram na verificação:

| Suposição | Realidade verificada |
|---|---|
| Remix | O template oficial é o **`shopify-app-template-react-router`**; `@shopify/shopify-app-remix` foi sucedido por **`@shopify/shopify-app-react-router`** (^1.1.0). React Router 7.18.2, Vite 7, Prisma 6.16 |
| Polaris React | **Deprecado.** O pacote `@shopify/polaris` carrega aviso de depreciação no npm desde a última release (13.9.5, mar/2025), apontando para os **Polaris web components** |

Bom ter descoberto agora: construir a UI do admin em Polaris React seria começar em cima de algo
que a Shopify parou de manter.

### A decisão mais cara: o motor do editor

**Editor próprio sobre `@dnd-kit/core`, com canvas em iframe renderizando o output real do
compilador.** Os candidatos foram testados contra o invariante I1 ("um compilador só"):

| Opção | Por que não |
|---|---|
| **GrapesJS** | Edita HTML/CSS como modelo primário — não sobra etapa de compilação |
| **Puck** e **craft.js** | Conceitualmente certos (documento em JSON), mas **renderizam React** — o canvas e o publish viram dois motores de renderização, que é a causa provável da reclamação nº 1 do concorrente |
| **dnd-kit** | ✅ Não é editor: é primitivo de arrasto. Resolve a parte cara e não diferenciante e não opina sobre renderização. 92,6 M downloads/mês |

Custo assumido conscientemente: **a UI do editor é nossa** — painéis, inspector, árvore e o
protocolo do iframe. Pagamos em UI para não pagar em divergência editor/produção, que é o defeito
que este produto existe para não ter.

### Demais decisões registradas

Modelo de dados com `Version.compilerVersion` (o publish congela o output), `ThemeMark` (inventário
auditável do que escrevemos no tema) e `Variant` já no MVP (para o A/B test depois ser UI, não
migração). Duas trilhas de publicação, com app blocks + deep linking como plano B da trilha B.
Orçamentos de performance como número verificado no build. Nove decisões na tabela final do
documento.

### Fluxos de uso — `docs/UX_FLUXOS.md`

A pesquisa mapeou *o que existe* e a arquitetura definiu *como construir*. Faltava *como se usa* —
a Fase 3 precisava disso para não inventar interface no meio da implementação.

**Método.** A ideia original era assistir aos vídeos-tutorial do concorrente. **Não foi possível:**
não tenho processamento de vídeo nem áudio, e os três contornos testados falharam (a página do
YouTube responde 429 aqui; sem ela não há faixa de legenda; a API `timedtext` responde vazia).
Só o oEmbed funcionou, o que rendeu os títulos.

A informação veio por outro caminho, e o material já estava aqui desde a Fase 1: **643 passos
documentados em 117 das 241 páginas** da central de ajuda. Os vídeos demonstram exatamente esses
fluxos. Eu tinha minerado essas páginas procurando funcionalidades e descartado os fluxos — era
questão de reler com a outra pergunta.

O que se perde sem o vídeo é a camada de *sensação* (quantos cliques parecem muitos, onde o cursor
hesita). Isso não se recupera de texto e está registrado como limitação.

**O achado mais forte — 101 títulos de vídeo recuperados:**

| | Vídeos |
|---|---|
| Marcados "(Legacy Editor)" | **74** |
| Marcados "Gen 2 Editor" | **7** |

**Três quartos da biblioteca de tutoriais ensina o motor que o concorrente está abandonando.** É um
argumento novo para a decisão "nascer flex": trocar de motor de layout não custa só migrar páginas
— custa a biblioteca de ensino inteira.

**O catálogo de vídeos como mapa de falhas.** Um tutorial é uma confissão de que algo não era
evidente na tela: 42 vídeos de "como adicionar o elemento X", 13 de operação básica de layout
(inclusive *"How to Align Elements"*, *"How to Add Shopify Divider Spacer"* e *"How to Name A
Section"*), 4 que são contorno de bug. Daí saiu a regra **U1: se precisa de tutorial, o desenho
está errado** — que virou critério de aceite, não aspiração.

**Dois fluxos que justificam sozinhos as promoções para P0:**

- **Pôr dois elementos lado a lado** no concorrente: criar um Block, pôr os elementos dentro, aba
  Styling, habilitar Flex, Direction: Row. Quatro passos de flexbox cru. No D&VFly: arrastar para
  a borda lateral do outro, e o container é criado sozinho.
- **Mudar um texto**: clicar no elemento e digitar numa caixa da barra lateral — não há edição
  inline. É o gesto mais frequente da ferramenta.

O documento traz ainda a anatomia da tela, a tabela de gestos (com equivalente por teclado para
todo arrasto), os estados de erro, as sete regras de interface e a ordem de execução dentro da
etapa 6 da Fase 3.

**Não acrescenta itens à priorização** — confirma as três promoções que já tinham sido feitas por
outro argumento e reordena a execução.

---

### Transcrições dos tutoriais oficiais — seção 8 do `docs/UX_FLUXOS.md`

As transcrições completas dos 15 vídeos mais vistos do canal oficial do concorrente (de 7,8 mil a
82 mil views) foram lidas. **Isto fechou a lacuna que o próprio `UX_FLUXOS.md` tinha declarado
impossível de recuperar de texto:** o método de trabalho ensinado pelo fornecedor, com os erros
que o apresentador comete ao vivo.

**Nota de PI:** o zip com as transcrições **não foi versionado**. A regra da seção 0.3 da pesquisa
("descreva funcionalidades, não transcreva a documentação alheia") vale para isto. O material foi
lido em diretório temporário e a seção 8 é síntese com palavras próprias.

**Os cinco achados que mais pesam:**

1. **A tese da categoria, dita pelo fornecedor.** O editor de temas da Shopify é flexível **só na
   home**; produto e coleção são praticamente fixos — a demonstração abre a página de produto num
   tema gratuito e mostra que só há header, bloco do produto e footer. Confirma que o valor real
   está na trilha B da arquitetura (produto/coleção), não na trilha A.

2. **O procedimento oficial de conflito de tema é colar CSS de descrição de vídeo.** Para uma seção
   ocupar a largura da tela, a orientação é testar **três trechos de CSS diferentes**, publicados
   na descrição do vídeo, até um funcionar no seu tema. Se nada funcionar, o suporte fornece o CSS
   específico. É a confirmação da reclamação nº 1 (editor ≠ página publicada) pela boca do próprio
   fornecedor — e é exatamente o que o invariante I1 e o CSS escopado existem para tornar
   impossível.

3. **A aula oficial de fundamentos ensina a instalar três extensões de navegador** (medidor de
   fonte, conta-gotas de cor, régua de pixels) para medir o design de referência à mão e transcrever
   os números no painel. Não é tutorial de page builder; é engenharia reversa manual de CSS.

4. **Três dos quatro erros que o apresentador comete ao vivo são o mesmo erro:** aplicar a
   propriedade no nível errado da árvore (padding no heading em vez da section, texto no heading em
   vez do parágrafo, section selecionada em vez da row). Um nível de container a menos — flex, sem
   row/column — elimina a classe inteira por construção. O quarto erro: ele não consegue configurar
   a cor de hover de um botão e remete à documentação.

5. **A anatomia canônica de landing page** (hero → lista de produtos → lista de coleções → banner
   de oferta/contador → depoimentos → selos → newsletter) vira a especificação dos nossos templates
   P0, que até aqui era só "5+ templates criados do zero".

**Efeito na priorização:** nada muda nos 145 itens. Confirma I1, a decisão de nascer flex, a regra
U2 e a U7, agora com evidência do próprio fornecedor em vez de inferência. **Entra um item P1:**
detectar e resolver a duplicação da seção nativa do tema ao publicar página de produto — aparece
como passo manual obrigatório nos tutoriais deles **e** na gravação da operação real, a mesma dor
por dois ângulos independentes.

---

### 🔴 Uso real — `docs/USO_REAL.md` (lido de gravação de tela)

**A descoberta de requisito mais importante do projeto até aqui.** Uma gravação de 6min07s da
operação real foi baixada, fatiada em frames com `ffmpeg` e lida quadro a quadro.

**O que se esperava:** alguém arrastando blocos de uma biblioteca. Foi para isso que a pesquisa
dimensionou 56 P0, 20 deles blocos.

**O que acontece:** a landing page inteira é **um bloco de HTML escrito à mão**. A árvore da
página tem dois elementos — um pixel de rastreio oculto e um bloco HTML/Liquid chamado "Landing
Page" com a página toda dentro. Selecionado, o inspector inteiro oferece um controle: "Abrir
editor de código".

O construtor visual não está sendo usado para construir. Está sendo usado como encanamento da
Shopify (criar página e template, atribuir a produtos, publicar), hospedagem do HTML, preview
mobile e integração com o tema.

**Um passo do fluxo não estava em nenhum documento:** depois de publicar, o trabalho continua no
**editor de temas da Shopify**, onde a seção do app aparece entre as seções do tema e precisa ser
posicionada.

**Três coisas documentadas só pela API apareceram funcionando:** o `templateSuffix` (campo "Nome do
modelo: `pf-4f4ffdfa`"), o Page Assignment e o controle de header/footer do tema.

**Perfil da operação:** COD multi-país (admin pt-BR, loja em espanhol, páginas `250-CO-S-…` e
`08-MX-S-…`), formato advertorial, 40 slots contratados, dezenas de páginas em sua maioria
despublicadas, editor Legacy, e o tipo "Bloque" (seção reutilizável) tão usado quanto "Produto".

**Efeito na priorização** — a lista de 145 itens não muda; muda o peso:

| Sobe para P0 | Desce |
|---|---|
| Bloco HTML/Liquid com editor de código de verdade (**o nº 1**) | Biblioteca ampla de blocos: de 20 P0 para ~6 |
| Compor com as seções do tema | Templates prontos → P1 |
| Esconder header/footer por página | Edição inline de texto → P1 |
| Seções reutilizáveis, atribuição a produtos | |
| Lista de páginas com busca e filtro (era **P2**) | |

Entram novos: duplicar página como ponto de partida (P0), importar HTML → árvore (P1), campo de
código de rastreio (P1), gestão em lote (P1).

**A tensão que isso cria, encarada no documento:** a arquitetura compila documento de dados para
HTML otimizado; a operação entrega HTML pronto. Se o HTML entra e sai cru, a vantagem de
performance evapora. A saída recomendada é o compilador virar **otimizador** — o HTML segue como
fonte, mas passa por um passe no publish que extrai CSS inline para o stylesheet escopado, põe
`width`/`height`/`loading` nas imagens e valida semântica. O parser completo de HTML → árvore fica
como P1, deixando de ser pré-requisito.

**Cinco perguntas que a gravação não respondeu** estão listadas no documento — entre elas se o
bloco único de HTML é regra ou foi o caso daquela página, de onde vem o HTML, e por que o editor
Legacy em vez do Gen 2.

---

### ✅ R1 — RESOLVIDO em 14/09/2026

A ambiguidade do `write_themes` **está fechada, e a favor da trilha principal.**

**Método:** `packages/compiler/bin/shopify-probe.ts` rodado contra a loja real. **7/7 passaram.**

```
✓ Client credentials grant ... token obtido programaticamente
✓ Conexão e token ............ loja "Magyarország", API 2026-07
✓ pageCreate ................. criou página (rascunho)
✓ pageDelete ................. limpeza ok
✓ read_themes ................ 4 temas
✓ themeFilesUpsert ........... escreveu seção + template JSON no tema "Dawn" (UNPUBLISHED)
✓ themeFilesDelete ........... limpeza ok
```

**O que isso decide:**

| Pergunta | Resposta |
|---|---|
| `write_themes` exige isenção da Shopify para app privado? | **Não.** Escreveu `sections/*.liquid` + `templates/page.*.json` sem isenção nenhuma |
| A trilha B (produto/coleção via template) é viável? | **Sim — caminho principal confirmado** |
| O plano B (app blocks + deep linking) é necessário? | **Não para desbloquear.** Continua desejável por outro motivo: deixa o conteúdo editável no editor de temas (reclamação 3.11) |
| A trilha A (páginas avulsas) funciona? | **Sim** — `pageCreate`/`pageDelete` passaram |

**Uma correção de premissa no caminho.** A sonda original só aceitava um token `shpat_`
pré-gerado. A Shopify também oferece o **client credentials grant**, documentado para apps que
agem só em lojas da própria organização — exatamente o nosso caso:

```
POST /admin/oauth/access_token
  grant_type=client_credentials, client_id, client_secret
→ { access_token, expires_in }
```

Com esse grant **não existe token visível no admin**; pede-se um de curta duração quando
necessário. A sonda passou a aceitar as duas formas.

**Um falso negativo que valeu a lição.** A primeira execução deu `FILE_VALIDATION_ERROR:
sections: can't be blank`. Não era permissão — era o payload de teste, um template JSON vazio, que
a própria validação da Shopify rejeita. Trocado por uma **seção + template que a referencia** (o
mesmo par que o produto vai escrever de verdade), passou. Fica a regra: sondagem de permissão
precisa mandar carga **válida**, senão a validação de conteúdo mascara a resposta.

⚠️ **Confirmar a loja.** A sonda rodou em `tf1vp1-fd.myshopify.com`, cujo nome é **"Magyarország"**
e que tem o tema **Dawn** despublicado. O vídeo da operação real mostrava uma loja com badge
"Colombia". Se forem lojas diferentes, o resultado do R1 continua valendo (é o mesmo tipo de app e
de permissão), mas o app precisa ser instalado também na loja de produção antes da Fase 3 publicar
qualquer coisa lá.

---

## Fase 3 — MVP 🔨

### ✅ Feito — o compilador, com o passe de otimização de HTML

`prototype/` virou **`packages/compiler/`**, o pacote núcleo do produto.

**A ordem da Fase 3 foi invertida de propósito.** A arquitetura previa começar pelo app rodando
(passo 1); o `USO_REAL.md` mostrou que o item nº 1 é outro. Comecei pelo **passo 3** porque ele
(a) não depende de credencial nenhuma da loja e (b) resolvia a maior incerteza de arquitetura que
tinha sobrado — a tensão da seção 6 do `USO_REAL.md`: *se o HTML entra cru e sai cru, o compilador
não otimiza nada e a vantagem de performance evapora*.

**A saída foi a recomendada lá: o compilador virou otimizador.** O HTML escrito à mão continua
sendo a fonte; no publish ele passa por um passe que:

| O que faz | Por quê |
|---|---|
| Extrai todo `style="..."` para o stylesheet **deduplicado** | Estilo inline do autor e estilo de bloco caem no mesmo pote — doze parágrafos iguais custam **uma** regra |
| **Escopa** os blocos `<style>`, com `body`/`:root` virando a raiz da nossa subárvore | Um `body{...}` dentro de um bloco não repinta a loja inteira. É exatamente o conflito que o concorrente remenda mandando colar CSS de descrição de vídeo |
| Põe `loading`/`decoding` nas imagens, sem nunca sobrescrever o autor | Só a primeira imagem (ou a marcada `data-dvf-eager`) fica eager |
| **Reporta** imagem sem dimensão/alt, `onclick` no lugar de link, scripts | Reporta, não reescreve — mexer calado no markup do autor é pior que não mexer |

Parseia com biblioteca de verdade, não regex.

**Medido no fixture de advertorial** (escrito para o repo, 22 estilos inline):

| | |
|---|---|
| Estilos inline extraídos | 22 → **10 regras** (2,2× de reúso) |
| Blocos `<style>` escopados | 1 |
| Total compilado | **3,7 KB** — 1,4% do teto da Shopify |

**Um bug real que o novo relatório expôs e que foi corrigido:** o `audit()` só andava na árvore de
blocos, então reportava "página sem H1" numa página cujo H1 estava dentro do HTML do autor — e
teria reclamado uma vez por bloco de HTML. As checagens **de página** (um H1, existe CTA) passaram
para o `compile()`, o único lugar que vê a árvore **e** o interior do HTML. O `audit()` ficou com
as checagens **por nó**.

Testes: de 18 para **41**.

### ✅ Feito — o app, publicando em loja real

Em `app/`: abas **Páginas** e **Lojas**, editor com preview, publicação multi-loja. Verificado
dirigindo as rotas de verdade, não só por teste unitário — página criada pelo app e publicada em
`tf1vp1-fd.myshopify.com/pages/dvfly-pelo-app`, com **zero estilos inline** no fragmento gerado.

O marco do ponto 4 está cumprido: existe página real no ar, saída do editor.

### 🔴 Um bug de empacotamento que só apareceu em máquina limpa

O app subia aqui e quebrava no primeiro clone alheio, com
`Cannot find module 'node-html-parser'`. A causa é sutil e vale registrar:

O app importa o compilador **pelo código-fonte**, por caminho relativo. Quando
`packages/compiler/src/html-optimize.ts` pede `node-html-parser`, o Node resolve a partir da pasta
*do compilador* e sobe na árvore — `packages/compiler/node_modules`, `packages/node_modules`, raiz.
**Nunca** olha dentro de `app/node_modules`. Aqui funcionava só porque `packages/compiler` tinha um
`node_modules` próprio, de um `npm install` antigo que ninguém mais repetiria.

Declarar a dependência em `app/package.json` **não resolve** — testei, e o erro continua idêntico,
porque o problema é de onde a resolução começa, não de onde a biblioteca está declarada.

A correção é o repositório virar um **npm workspace** (`package.json` na raiz): um `npm install` na
raiz instala os três pacotes e iça as dependências para `node_modules/` da raiz, que está no
caminho de subida do compilador. Os `package-lock.json` por pacote saíram; agora há um só, na raiz.

Junto: `app/.env` é ignorado pelo git, então um clone novo não tinha `DATABASE_URL` e todo comando
do Prisma falhava antes do app existir. O `npm run setup` agora cria o `.env` a partir de
`app/.env.example` (`app/scripts/ensure-env.mjs`, em Node porque o projeto roda em Windows e Linux).

**Verificado do zero**: apaguei `node_modules`, os lockfiles e o `.env`, rodei `npm run setup` e
`npm run dev`, e exercitei as rotas — `/app` e `/app/stores` em 200, e o `POST /api/preview/:id`
colapsando dois estilos inline iguais numa classe só. 41/41 testes passando.

A lição que fica: **teste de máquina limpa é diferente de teste unitário.** Nenhum dos 41 testes
pegaria isso, porque todos rodam de dentro do pacote que tem a dependência.

### 🔴 A sequela: duas cópias do React

Virar workspace cria um problema **para quem já tinha instalado antes**. O `app/node_modules`
antigo não some sozinho — o install da raiz escreve a própria árvore e ignora o que estava lá. A
resolução então sobe a partir de `app/app/routes/` e acha o React **velho**, enquanto o
`react-router`, resolvido da raiz, acha o iça­do. Duas cópias do React, dispatcher de hooks nulo, e
toda tela morre com `Cannot read properties of null (reading 'useContext')`.

Essa mensagem não aponta para nada. Quem está depurando não tem por onde puxar o fio.

**Reproduzido de propósito** — plantei uma segunda cópia do React em `app/node_modules` e a tela
quebrou com exatamente essa mensagem; removi e voltou. Só então escrevi a correção, em vez de
adivinhar.

`scripts/preflight.mjs` detecta a duplicata e **recusa subir** (`predev`), dizendo qual pasta
apagar e qual comando rodar (`npm run fix:duplicados`). Um install limpo na raiz não gera
`node_modules` aninhado neste projeto, então React aninhado aqui é sempre resto — nunca algo que o
npm precisou.

Verificado clicando no navegador de verdade (Playwright, Chromium): abrir `/`, `/` com `?shop=`,
trocar de aba, criar página, digitar HTML, salvar e voltar — **zero erros de JavaScript** em todos
os passos.

### ⬜ O que falta

Escopo: os **56 itens P0** da seção 4 da pesquisa, na ordem da seção 11 da arquitetura:

1. ~~App rodando~~ — ✅ **feito**, em `app/`
2. ~~Sonda de permissões / R1~~ — ✅ **feito**, 7/7 (ver acima)
3. ~~Compilador~~ — ✅ **feito**, em `packages/compiler/`
4. ~~**Publicação da trilha A**~~ — ✅ **feito**, página real no ar
5. Canvas em iframe (o módulo mais arriscado, feito cedo) — **o próximo**
6. Painéis: árvore, biblioteca de blocos, inspector com herança de breakpoint visível
7. Blocos P0, começando pelo repetidor genérico
8. Versionamento, autosave e restauração
9. Auditoria estática no editor (já existe em `prototype/src/audit.ts`)
10. Export estático e rotina de desinstalação

### ✅ Interface nativa do admin + editor em tela cheia

A direção veio do próprio dono, com as capturas do concorrente e a regravação em vídeo (6min07s,
reanalisado quadro a quadro para **desenho**, não fluxo): a experiência do concorrente, escrita do
zero, com a identidade D&VFly. Zero código, texto ou marca alheia no produto.

O que mudou:

- **Lista de páginas em Polaris web components** — os componentes `s-*` do CDN da Shopify, os
  mesmos que o admin usa, então dentro do admin a tela é indistinguível de tela nativa. Excluir
  pede um segundo clique na própria linha (dialog `confirm()` pode ser engolido dentro do iframe
  do admin).
- **Editor em tela cheia**, no arranjo consagrado: barra superior (voltar, marca, título editável,
  estado, larguras de dispositivo Cheio/1200/768/390, Salvar, **Publicar** verde), estrutura à
  esquerda, canvas central com a página sombreada, código + publicação à direita.
- **A aba Lojas morreu.** Decisão do dono: "cada loja instala o app e automaticamente já
  configura". `ensureStore` registra a loja que abre o app — o `?shop=` chega, as credenciais do
  app valem para qualquer loja que o instalou, e a linha só grava depois de um `shop { name }`
  respondido. Loja auto-registrada entra como produção (publicar nela exige a confirmação extra).
- **Sub-navegação no menu lateral do admin** via `ui-nav-menu` do App Bridge, como o concorrente
  faz; o client id que o App Bridge precisa sai do banco (qualquer loja registrada) ou do ambiente.

Três armadilhas reais de web components + React 18, encontradas **rodando** (Playwright + bundle
real da Polaris interceptado, porque o Chromium daqui não confia no proxy TLS — os bytes vêm de um
download com TLS verificado): `disabled={false}` desabilita; `defaultvalue` não é observado (é
`value`); botões Polaris não carregam `name`/`value`. Registradas no `app/README.md`.

Verificação: 9/9 passos clicados num navegador real (criar, renomear, digitar código, preview
atualizado, largura 390 medida no iframe, salvar, persistência após reload, aviso sem loja,
excluir com confirmação). Loja desconhecida não registra lixo; `shop` inválido não entra no CSP.

### 🔨 Canvas — primeira fatia real (seleção, estrutura, edição)

O ponto 5 saiu do papel. O editor agora é um construtor de verdade, não um textarea:

- **Árvore de estrutura** à esquerda, derivada do documento real (os 11 blocos do compilador,
  aninhamento completo). Página herdada de antes aparece como era: um bloco HTML.
- **Clique simétrico**: clicar na árvore contorna o elemento no canvas; clicar no elemento dentro
  do canvas seleciona na árvore e abre o inspetor. Breadcrumb Seção / Pilha / Título acima do
  canvas, clicável.
- **Inspetor por tipo**: título (texto + nível), texto, imagem (src/alt/dimensões), botão
  (rótulo/href), HTML (código). Sanfona/repetidor/contagem editam props como JSON até ganharem
  controles próprios — dito na tela, não escondido.
- **Operações**: adicionar (paleta de 7 blocos, entra dentro do contêiner selecionado ou depois da
  folha), duplicar (com ids novos), excluir, subir/descer.
- **Como o clique chega lá**: o compilador ganhou `nodeIds` — em build de editor cada bloco sai
  com `data-dvf-id`; uma ponte de ~30 linhas dentro do iframe reporta cliques por `postMessage` e
  aplica o contorno. **Página publicada não carrega nada disso** (teste de regressão garante).

Verificado clicando: 11/11 passos num navegador real, incluindo clicar no H2 *dentro* do canvas e
ver a árvore marcar, duplicar → 2 títulos no preview, salvar → recarregar → estrutura persistida.
Testes do compilador: 42/42.

### ✅ Arrastar, desfazer, barra flutuante

As três últimas peças do canvas básico, num commit só porque compartilham a fundação:

- **Desfazer/refazer** (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, mais botões ↶↷ na barra): o histórico é
  literalmente uma lista de documentos — o retorno prometido de toda operação de árvore ser pura.
  Mutações em até 600ms se fundem numa entrada só (digitar uma frase = um undo, não um por tecla).
  Dentro de campo de texto o Ctrl+Z continua sendo o do navegador, como o usuário espera.
- **Arrastar para reordenar**, na árvore E no canvas, com o mesmo `relocateNode` por trás — regras
  idênticas nos dois gestos: nunca para dentro de si mesmo, `inside` só em contêiner, movimento
  impossível devolve a árvore intacta. Indicador verde de posição (linha em cima/embaixo; contêiner
  aceso quando o solte vai para dentro).
- **Barra flutuante** sobre o elemento selecionado no canvas, como a referência: rótulo do bloco
  (que também é alça de arrasto), subir, descer, duplicar, excluir.

**Um bug de React que vale registrar:** a primeira versão do histórico fazia o push *dentro* do
updater do `setState`. O template roda em `StrictMode`, que executa updaters duas vezes justamente
para caçar impureza — e o histórico corrompia em silêncio (Ctrl+Z morto, botões sempre apagados).
A correção foi tirar todo efeito colateral do updater (refs fora, `setDoc` com valor pronto).
Também: o iframe engole teclas quando o canvas tem foco, então a ponte encaminha Ctrl+Z/Y para
fora via `postMessage`.

Verificado no navegador, 11/11 — incluindo desfazer uma exclusão feita pela barra flutuante,
arrasto real na árvore (ordem conferida antes/depois) e arrasto real no canvas (H2 solto acima do
parágrafo, DOM conferido).

### ✅ Aba Estilo — responsivo mobile-first como formulário

O inspetor ganhou as abas **Geral | Estilo**. A Estilo expõe exatamente o vocabulário fechado do
compilador — nada que ela ofereça pode falhar ao compilar:

- **Um design + sobreposições** (U4): seletor Base / ≥768 / ≥1200. Campo vazio herda do
  breakpoint anterior e mostra o valor herdado como placeholder; digitar cria a sobreposição;
  limpar o campo remove (a operação apaga a chave, não grava `undefined`).
- **Escolher o breakpoint muda a largura do canvas** (Base→390, ≥768→768, ≥1200→1200): o que se
  edita é o que se está olhando.
- Grupos: Layout (só contêiner: direção, espaço, alinhar), Espaçamento (padding/margin por lado),
  Texto (tamanho, peso, alinhamento), Aparência (cor com amostra, fundo, cantos, largura máx.),
  Visibilidade (esconder por tamanho de tela).

Verificado no navegador, 12/12 — incluindo os dois que provam o modelo responsivo: a sobreposição
de tamanho no ≥768 **não vaza** para o canvas de 390, e limpar o campo faz o valor voltar a
herdar. Estilos persistem após salvar e recarregar.

### ✅ Rodada de paridade com a referência (15/09) — parte 1: o editor

Feedback por áudio + prints da referência virou uma lista de ajustes. Primeira leva, no editor:

- **Salvar só existe quando há o que salvar** — o botão aparece com a primeira mudança e some
  depois de salvar (publicar também salva). Publicar continua fixo no canto superior direito.
- **Atalhos completos**: Ctrl+S salvar, Ctrl+Shift+S salvar & publicar, Ctrl+D duplicar,
  Delete excluir, **Ctrl+C / Ctrl+V copiam e colam o *estilo*** entre blocos, Ctrl+Z/Shift+Z já
  existiam. Um painel "Atalhos de teclado" (ícone de teclado na barra) lista todos. Os atalhos
  funcionam também com o foco dentro do canvas (a ponte encaminha).
- **Tamanhos de tela com desenhos**: monitor / notebook / tablet / celular, ícones próprios
  desenhados do zero, no lugar dos números.
- **Olhinho na árvore**: esconde o bloco. Escondido = cinza e riscado na lista, some do canvas
  e — o importante — **não sai na página publicada**: o compilador omite o nó por inteiro (nada
  de `display:none` carregando bytes escondidos). H1 escondido também não conta nas auditorias.
  Desfazer (Ctrl+Z) desfaz o olhinho como qualquer outra operação.

**Armadilha nova paga**: um `setState` disparado de um listener nativo no meio de um evento de
input re-renderiza antes de o React processar o mesmo evento — e a primeira tecla digitada num
campo controlado era silenciosamente revertida. A marcação de "sujo" tinha de ser `onInput` do
próprio React, não um listener nativo. Verificado dirigindo o app: 13/13.

### ✅ Rodada de paridade (15/09) — parte 2: a lista de páginas

- **Pré-visualizar** (`/preview/:id`): a página compilada numa aba própria, antes de publicar.
  Mesmos bytes da publicação — o teste pina que a prévia não carrega nenhum resíduo de editor.
- **Exportar / Importar**: exportar baixa um `.json` legível (título, handle, documento);
  importar recria a página em qualquer instalação. O servidor **compila o arquivo antes de
  aceitar** — o que não compila não vira página — e resolve conflito de handle com sufixo.
  Arquivo alheio é recusado com mensagem honesta.
- **Publicar / Despublicar na lista**: liga e desliga a visibilidade do que JÁ está em cada
  loja (sem recompilar — conteúdo novo é papel do editor). Badge mostra "(pausada)" quando
  despublicada. Verificado **contra a loja real**: despublicou e republicou a página de
  demonstração na tf1vp1-fd via API, com o estado restaurado ao final. (A conferência pela
  vitrine não foi possível daqui: a loja responde com desafio anti-robô ao container.)
- Sem teste A/B e sem "ver análises" — decisão de escopo do dono, registrada.

Verificado dirigindo o app: 6/6 (a limpeza revelou 7 páginas-fantasma de rodadas de debug,
removidas direto no banco).

### ✅ Rodada de paridade (15/09) — parte 3: Configurações da página

Engrenagem na barra do editor abre o painel **Configurações da página**:

- Explicação honesta do título (é o que aparece na aba e no Google), **URL da página**
  (saiu do painel esquerdo para cá, com saneamento de handle), **Tipo de página**
  (Normal hoje; Produto listado como "em preparação" — plano completo em
  `docs/MODELOS_DE_TEMA.md`), **Seções do tema → Mostrar cabeçalho e rodapé**, e o
  **Nome do modelo** (padrão do tema ou `page.dvfly-solo`).
- Desligar cabeçalho/rodapé é real, não CSS: a publicação grava um layout mínimo + seção +
  modelo `page.dvfly-solo` no tema principal (`themeFilesUpsert`, idempotente) e aponta a
  página para ele via `templateSuffix`. Religar devolve ao modelo padrão.
- **Provado na loja real, ida e volta (4/4)**: página publicada em megakciok.shop sem
  header/footer do tema (com o head da Shopify preservado), depois republicada com o tema
  de volta. Página de teste removida da loja e do app ao final.
- Banco: `Page.pageType` e `Page.showChrome` (armadilha operacional: `prisma generate` com
  o dev server de pé deixa o servidor com client velho → 500 até reiniciar).
- Pesquisa a fundo pedida sobre páginas de produto/blog: experimentos + plano registrados
  em `docs/MODELOS_DE_TEMA.md` (escopos de tema e produto confirmados na API).

### ✅ Pesquisa por vídeo (15/09) — relatório 1 aplicado

Nasceu o fluxo de pesquisa por vídeo: o Claude no Chrome assiste os tutoriais do PageFly e
gera relatórios estruturados (`docs/videos/`), e as lacunas viram implementação. Do
relatório 1 (EcomSensei 2026) já entraram: **breakpoint ≥1440** (4 dispositivos
consistentes em estilo/visibilidade/preview), **visibilidade por dispositivo na aba
Geral** com semântica de faixa exata no compilador (esconder no celular não vaza mais
para o desktop — media queries de faixa), **animações de entrada com preview no hover**
(progressive enhancement, reduced-motion, CSS/JS só quando usadas, assentadas no canvas)
e **tipos de ação do botão** (link/âncora/e-mail/telefone). Verificado: 46/46 compilador +
10/10 fluxo novo + 13/13 regressão. Fila do que sobrou: `docs/videos/MAPA_DE_LACUNAS.md`.

### ✅ Pesquisa por vídeo (15/09) — relatório 2 (★ com frames) aplicado

O relatório 02 (How to Easy, frames lidos com zoom) virou a **referência-base** — e
revelou que o relatório 01 descrevia a geração anterior do produto. Aplicado no mesmo
dia: **placeholders do cabeçalho/rodapé do tema no canvas** (clicáveis → abrem as
Configurações), **estado "Alterações não salvas"** (Descartar com confirmação +
Publicar sai de cena com pendências), **"Ver no ar" desabilitado em vez de oculto**, e
**estado vazio instrutivo**. Verificado: 46/46 + 9/9 novo + 13/13 + 10/10 regressão.
Fila atualizada no MAPA_DE_LACUNAS (fontes do tema com tokens, zoom do canvas, busca na
árvore, variantes por elemento, add-to-cart…).

### ✅ Pesquisa por vídeo (15/09) — relatórios 3 e 4 aplicados

O catálogo completo de elementos (Garry) e a lista completa de atalhos (Easytorial)
fecharam os buracos da referência. Aplicado: **paleta "Adicionar" em grupos**
(Estrutura/Básico/Mídia/Avançado) com pílula de contagem calculada; **elemento Lista**
(`<ul>/<ol>` reais, um item por linha, opção numerada); **elemento Vídeo YouTube**
(qualquer formato de link → só o id de 11 caracteres entra na página, embed nocookie,
lazy, 16:9 — link inválido compila para nada); **toast "Salvo ✓" sobre o canvas**.
**Atalhos: paridade 1:1 confirmada** com a lista completa da referência (falta só a
multi-seleção com Ctrl, na fila). Verificado: 48/48 compilador + 5/5 novo + 13/13
regressão. Fila consolidada dos 4 relatórios no MAPA_DE_LACUNAS.

### ✅ Pesquisa por vídeo (15/09) — relatórios 5-7 aplicados

Página de produto, seções-no-tema e preços/CRO Center documentados. Aplicado no código:
**multi-seleção com Ctrl** (árvore e canvas; excluir/duplicar/colar estilo em lote;
aviso "N selecionados" no inspetor; destaque múltiplo no canvas — fecha a paridade
completa de atalhos com a referência), **estados vazios com rota exata** (imagem sem
URL / YouTube sem link mostram no canvas o campo que resolve, e não saem na página
publicada), **renomear seções na árvore** ("Banner principal" em vez de "Seção") e
**ícone do dispositivo na aba Estilo** (a divisão global × por-dispositivo visível).
Verificado: 49/49 compilador + 11/11 novo + 13/13 + 5/5 regressão. Registros
estratégicos (economia deles, pergunta aberta de seções, CRO checklist, lição de i18n)
no MAPA_DE_LACUNAS.

### ✅ Spec 08 aplicada (15/09) — Abas e Fontes do tema

Dois itens grandes da fila, guiados por frames lidos com zoom: **elemento Abas**
(lista de itens com inversão de cor, cabeçalho/conteúdo separados, âncora de deep-link
com runtime, ARIA, duplo-clique-renomeia no canvas — melhor que a referência) e
**fontes do tema com tokens** (token + fonte resolvida ao vivo da vitrine; compila para
as variáveis OS 2.0 do tema, conferidas no tema real; canvas com a tipografia
verdadeira). De quebra, três consertos de UX que os testes expuseram: container de abas
só aceita abas, a lista de itens permanece ao editar uma aba, e a barra flutuante não
cobre mais os botões das abas. Verificado: 51/51 + 9/9 novo + 29 regressão.

### ✅ Relatórios 9-10 aplicados (15/09) — Formulário de contato e Despublicar

A aba Shopify do catálogo deles abriu (35/37 elementos, padrão `<Recurso> <Campo>`,
adotado) e expôs o modelo composicional de formulários — contra o qual decidimos
conscientemente: o D&VFly ganhou um **Formulário de contato widget** (grupo "Loja" na
paleta) que posta no `/contact` nativo da vitrine, com campos opcionais, botão e
mensagem de sucesso configuráveis — o envio cai na caixa da própria loja, sem servidor
nosso. E o **Despublicar entrou no editor** (link ao lado do badge), verificado ao vivo
na loja real com republicação em seguida. Do Product list ficou o desenho do nosso
futuro bloco de produtos (carrossel = modo de layout, não elemento). Verificado:
52/52 compilador + 5/5 novo + regressão verde.

### ✅ Relatório 12 aplicado (15/09) — "Cópia de <nome>"

Duplicar agora nomeia a cópia ("Cópia de Título", "Cópia de Aba 1") e o nome aparece
nos três lugares ao mesmo tempo — árvore, breadcrumb e etiqueta flutuante do canvas —
barato e de alto retorno em páginas grandes. A regra de fricção-por-reversibilidade
entrou no CLAUDE.md junto com as demais regras de interface aprendidas da referência.
Verificado: 52/52 + 4/4 novo + regressão verde.

### ✅ Refino visual + modo escuro (15/09)

Todo o cromo do app passou a usar **tokens de design** (`--dv-*`, em
`app/app/ui/theme.tsx`): nenhuma cor solta em componente, e o **modo escuro é um
atributo** (`data-theme="dark"` na raiz `.dv-ui`), com toggle sol/lua no editor e na
lista, lembrado por navegador (localStorage, primeira visita segue o sistema). O
`color-scheme` acompanha, então scrollbars/checkboxes/selects nativos escurecem de
graça. O papel do canvas fica **branco de propósito** nos dois temas — ele é a página
da loja, não o editor. A lista de páginas saiu do visual Polaris e ganhou a identidade
D&VFly (mesmos tokens, tabela própria, badges e banner coerentes com o editor); os
s-checkbox/s-badge/s-banner do editor viraram nativos tematizados. Extras de uso:
transições e hover em todos os controles, foco visível em verde, ícone de
configurações redesenhado (sliders — a engrenagem de traço lia como um segundo sol ao
lado do toggle). Armadilha nova documentada: CSS com `[data-theme="dark"]` como filho
de texto de `<style>` quebra a hidratação SSR (aspas escapadas) — o `<UiStyle />`
injeta via innerHTML. Verificado: flow17 7/7 (toggle real por cor computada,
persistência após reload, editor herda o tema, papel branco no escuro) + regressão
flow6/12/14/16 verde + 52/52 compilador + typecheck limpo.

### ✅ Relatório 13 aplicado (15/09) — gravação própria, a fonte nº 1

A gravação de 6:07 do PageFly numa loja real em produção (pt-BR) virou o relatório mais
importante da pesquisa (`docs/videos/13-gravacao-propria.md`) e **confirmou a decisão de
arquitetura mais cara**: página deles = template de tema nomeado atribuído a
produtos/posts — exatamente o desenho já provado em `docs/MODELOS_DE_TEMA.md`, agora
validado antes de escrever o bloco de produtos. Implementado na hora: **ações em massa
na lista** (checkbox por linha + selecionar todas + barra "N selecionadas" com
Publicar/Despublicar em lote; desabilitado-com-motivo quando nenhuma selecionada tem
publicação anterior), **contagem real no cabeçalho** ("N páginas · M no ar", contada
dos dados — a versão honesta do "Usando 40 slots" deles) e **publicar com campos
obrigatórios** (título/URL vazios não publicam; o erro aponta a rota exata, nada é
gravado). Verificado: flow18 8/8 — incluindo despublicar+republicar EM MASSA a página
real em megakciok.shop, com conferência do HTTP 200 e do conteúdo no ar depois — +
flow17 7/7 + 52/52 compilador. Pendências novas registradas (telas Seções/Análise/CRO/
Motor de Vendas, "Ver mais", Código GTM, "+" das abas de filtro).

### ✅ Auditoria de configuração (15/09) — código × Shopify × PageFly

Pedido do dono: analisar todo o código e pesquisar mais a fundo o que Shopify e PageFly fazem,
para configurar o app da melhor forma. Três levantamentos em paralelo (leitura integral do
código; docs oficiais da Shopify de set/2026; as 241 páginas da central do PageFly relidas
por mecanismo) viraram `docs/CONFIGURACAO_E_MECANISMOS.md` — 30 achados com arquivo:linha,
tabela "eles × nós", plano P0/P1/P2 e a lista final de variáveis de ambiente. **Corrigido na
mesma entrega:** módulo de configuração explícito (`config.server.ts`: `.env` carregado de
propósito, `SHOPIFY_API_VERSION` validada, produção recusa subir sem credenciais no
ambiente); cliente Shopify com retry em 429/THROTTLED, aviso quando a Shopify serve outra
versão de API e resposta não-JSON tratada; **publicação pela id lembrada** (renomear a URL
atualiza a mesma página com redirect, em vez de criar uma segunda); clientes/tokens
reutilizados entre requisições; teto de 64 KB (body da Page — o que morde primeiro) e 256 KB
verificados no publish; excluir na lista despublica nas lojas antes; publicar em massa em
loja de produção recusado com o caminho; `allowedActionOrigins` só fora de produção; fontes
do tema por loja; `postMessage` com origem checada; stack de erro escondido em produção;
`build`/`start`/`typecheck` na raiz (build de produção rodado pela primeira vez). Pacote
Shopify ganhou seus **primeiros 14 testes** (token, retry, versão, upsert por id, deploy
isolado). Armadilha nova paga: constante de módulo `.server.ts` usada num componente derruba
o bundle do Vite ("Server-only module referenced by client") — nasceu `app/lib/shared.ts`.
Verificado: 66/66 testes, typecheck limpo, flow18 8/8 (ciclo real em massa na loja, agora
pela id) + flow17 + flow6 13/13 + flow14 + flow16, página ao vivo conferida no fim.

### ✅ Vínculo com produto (15/09) — a página de produto de ponta a ponta

"Toda a configuração quando é coisa de vinculação com produto" — o pedido do dono, e o
coração do modelo que o relatório 13 confirmou. Entregue conforme o plano de
`docs/MODELOS_DE_TEMA.md`: tipo **Produto** nas Configurações da página (URL travada com o
motivo — a URL é a do produto), **produtos vinculados por loja** (busca no catálogo, Vincular
/ ✕, contagem; um produto pertence a uma página só), **posição do conteúdo** (acima/abaixo
das seções de produto do tema — o canvas mostra o placeholder no lado certo), **nome do
modelo copiável** (`product.dvfly-<id>`). Publicar grava no tema a seção (fragmento em
`{% raw %}`) e o template composto com TODAS as seções do `product.json` do tema, e aponta
cada produto vinculado via `templateSuffix`; com a página no ar, vincular/desvincular vale na
hora; despublicar devolve só os produtos que ainda apontam para o nosso sufixo; excluir
remove os arquivos do tema (I3). Lista, editor e exclusão passaram a usar UM interruptor
(`publish.server.ts`). Descobertas ao construir: o `product.json` do tema tem bloco de
comentário antes do JSON; o nome da seção no schema tem teto de 25 caracteres. Verificado
**na loja real**: flow19 8/8 (a URL do produto `pinkjuice` renderizou nosso conteúdo + as
seções do tema; desvincular devolveu na hora; sufixo null e zero arquivos `dvfly` no tema
ao final) + flow18/17/6 + 73/73 testes (21 no pacote Shopify) + typecheck.

### ✅ Passada de usabilidade (15/09) — "tem coisa que não dá pra entender como usar"

Diagnóstico: as ações existiam mas eram ícones minúsculos sem nome, mover só por arrasto
sem nenhum sinal de que arrastava, nenhum menu de contexto, a nota da paleta vaga, e zero
orientação no primeiro uso. Entregue: **barra de ações nomeada** no inspetor (↑ Subir, ↓
Descer, ⧉ Duplicar, 👁 Esconder/Mostrar, ✕ Excluir, com atalho no tooltip) + frase de como
mover; **menu do botão direito** em qualquer bloco, na Estrutura E no canvas (mesmas ações +
Editar conteúdo/estilo, título com o nome do bloco, Esc fecha); **grip ⠿** nas linhas da
árvore e na barra flutuante do canvas (com tooltip "arraste pelo nome"); **nota da paleta
dinâmica** ("Entra dentro de «Seção»" / "logo depois de «Título»" / "no fim da página");
**toast "Bloco excluído · Ctrl+Z desfaz"** em qualquer caminho de exclusão; **guia "Como
usar"** com os 6 gestos — na primeira visita mora dentro do inspetor vazio (não cobre
nada; "Entendi" some pra sempre), e o botão ? no topo traz de volta; **Configurações**
virou botão com texto. Tentativa descartada: abrir o guia como popover na primeira
visita — cobria as abas Geral/Estilo (o flow6 pegou). Regras promovidas ao CLAUDE.md
(três caminhos + nome; avisar o caminho de volta; dizer onde a ação acontece antes do
clique). Verificado: flow20 7/7 + flow6 13/13 + flow14 + flow16 + typecheck.

### ✅ Instalável em qualquer loja (15/09) — "como o PageFly"

Pedido: instalar o D&VFly numa loja Shopify como se instala o PageFly, com o app se
configurando sozinho. Pesquisa nova em `shopify.dev` (instalação gerenciada, token exchange,
ID tokens, TOML, distribuição, webhooks, escopos) → `docs/INSTALACAO.md` (passo a passo) +
`shopify.app.toml` na raiz. Implementado: **toda rota autentica** (`requireShop`: ID token
HS256 com o client secret, claims `exp/nbf/aud/iss×dest`, tolerância de 10 s), **instalação
por token exchange** na primeira abertura (`installStore` → `Store.accessToken` offline),
**`/bounce`** para documento sem token dentro do admin, **links de nova aba** com token,
**webhooks** `app/uninstalled` + `app/scopes_update` + os 3 de compliance com HMAC do corpo
bruto (401 sem), `Store` sem cópia do segredo do app, `DVFLY_AUTH=off` só fora de produção.
O client credentials ficou como caminho de desenvolvimento para lojas da própria organização.
Nuances honestas registradas: distribuição custom = uma loja ou uma organização Plus por
app (lojas de terceiros sem relação = App Store, com revisão); token offline expirável é
obrigatório só para apps públicos (2027); a política 5.1.1 da App Store proíbe escrever no
tema (nosso "sem cabeçalho" e páginas de produto) — irrelevante na distribuição custom.
Verificado: 14 testes novos (87 no total), flow21 5/5 com auth ligada (bounce, 401 + header de
retry, token assinado com o segredo real aceito, webhooks HMAC, criar→editar→excluir sob
Authorization), regressão 18/20/6/17 no modo dev, typecheck. **Pendente por natureza:** o
ciclo dentro do admin real só se prova instalando numa loja — o guia diz o que observar.

### ✅ Revisão geral (15/09, noite) — "revisar tudo para ver se está certinho"

Quatro revisões independentes sobre o código do dia (segurança/autenticação; publicação e
páginas de produto; editor e lista; documentação × código), mais a bateria completa de
fluxos Playwright, os testes, o typecheck e o build. Elas acharam **coisa de verdade** — a
lista abaixo é o que foi confirmado e corrigido, agrupado, com o que ficou de fora.

**Publicação e páginas de produto**
- Página publicada como Normal e trocada para Produto (ou o inverso) deixava a versão antiga
  no ar e mandava um id `template:` para `pageUpdate` (achado na própria revisão, antes dos
  agentes). Agora cada deployment sabe **o que ele é** na loja (`deploymentKind`), e publicar
  como um tipo **retira o outro** antes (`retireOtherKind`) — depois do teto de tamanho e da
  confirmação de produção, que passa a cobrir também a loja de onde algo sai do ar; lojas
  retiradas são nomeadas na mensagem; recurso já apagado pelo lojista conta como retirado;
  loja desinstalada é pulada.
- Um produto excluído entre vincular e publicar derrubava a loja inteira **depois** de
  escrever o tema (modelo órfão que o app não via). Vínculo por produto tolerante: a loja
  registra o deployment, os outros produtos entram, o recusado é nomeado com o conserto.
- "Mostrar cabeçalho e rodapé" era oferecido para página de produto e ignorado ao publicar:
  desabilitado com o motivo, preview coerente.
- Excluir na lista decidia a remoção do modelo do tema pelo tipo atual da página, não pelo
  deployment; duplicar/exportar/importar perdiam tipo e configurações; "Ver no ar" e o teto
  da barra de status também eram pelo tipo atual. Tudo por deployment / por tipo certo.
- `stripJsonComments` apagava vírgulas **dentro de strings** ("Related, ]" → "Related ]");
  nome da seção cortava emoji ao meio em 25 caracteres; republicar recompunha o modelo do
  `product.json` do tema, apagando o que o lojista tinha reordenado/ocultado no editor de
  temas (contra a promessa da tela). Scanner que respeita strings; corte por code point; o
  modelo existente vira a base e só a nossa seção é garantida (muda de ponta quando
  "acima/abaixo" muda; posição no meio é do lojista). `themeFilesDelete` trata `NOT_FOUND`
  por código. Busca de produtos sanitiza `" : ( )`. Intent desconhecido não publica.

**Segurança**
- `/bounce` aceitava `to=/\evil.com` (o parser de URL lê `/\` como `//`) e `</script>` no
  destino — um **redirect aberto que entregava o ID token** e um XSS refletido. Destino
  parseado como URL e aceito só na mesma origem; JSON com `<` escapado; CSP
  `frame-ancestors`; marca `dv_bounced` para um salto só (token que falha depois do bounce é
  recusado, não bounceado de novo — e qualquer falha do token da URL bounceia, não só
  "expirado").
- O 401 lançado na lista e no editor chegava ao App Bridge **sem** o header de retry
  (rotas sem `headers` export): token expirado quebrava o salvar em vez de repetir.
  `passHeaders` nas três rotas.
- Loja desinstalada continuava alvo (`toStore` caía nas credenciais do app); `storeUsable`
  sem uso. `clientFor` recusa com o motivo; "Publicar em" e vínculos desabilitados
  explicando; a lista marca "sem acesso". O webhook de desinstalação **não** vira mais os
  deployments para "fora do ar" (a página continua no ar na Shopify — dizer o contrário era
  mentira) e ignora entregas atrasadas anteriores a uma reinstalação.
- Tokens/segredos das lojas iam inteiros nos payloads dos loaders; o ID token seguia em
  todo `Link` e recarga, e o `react-router-serve` o imprimia no log. Loaders devolvem só o
  que a tela usa; `shopSearch` mantém só `shop/host`; a barra de endereço é limpa depois da
  carga; **`npm start` virou `app/server.mjs`** (Express, `trust proxy` — sem ele, atrás de
  qualquer proxy TLS o CSRF do React Router recusaria toda action com 400 — e log só com o
  caminho). `DVFLY_ALLOWED_SHOPS` opcional; `Store.tokenExpiresAt` + renovação ao abrir
  (apps com token expirável); `[build] include_config_on_deploy` no TOML; corpo nulo no JWT
  vira `SessionTokenError`; `<form method="post" autoComplete="off">` no editor.

**Telas**
- **Qualquer `input` no formulário marcava "não salvo"** — marcar uma loja em "Publicar em"
  **escondia o Publicar** (os fluxos não pegaram porque marcavam o checkbox por script, sem
  evento). Sujo só para título e `[data-settings]`; publicação recusada depois de salvar avisa
  `saved` e o editor não pede para salvar de novo.
- Preview com erro (413) derrubava o editor inteiro com o trabalho não salvo; respostas
  atrasadas do preview e da busca de produtos sobrescreviam as novas; a seleção capturada no
  timer podia ficar velha. Guardas de `stale` e leitura pela ref.
- Inspetor sem `key`: o textarea de JSON mostrava o bloco anterior. Menu do botão direito
  aberto pelo canvas não fechava com Escape nem com clique no canvas; sem `role=menu` nem
  foco. Seleção da lista guardava ids de páginas excluídas. Toolbar do canvas aparecia no
  canto para bloco oculto no dispositivo. Data "Atualizada" divergia entre servidor e
  cliente (fuso). Tudo corrigido.

**Docs × código** — 18 discrepâncias apontadas, corrigidas: TOML "não existe" (§0), `DVFLY_AUTH`
fora da tabela §6, `app/README` "o que falta" contradizendo o próprio corpo e sem 3 rotas,
`packages/shopify/README` descrevendo o desenho antigo (client credentials, upsert por
handle, 4 arquivos), `packages/compiler/README` com 41 testes/11 blocos (são 52/16) e
`npm install` dentro do pacote, `README` raiz sem 4 docs, vídeo 08 apontando arquivo
inexistente, `CLAUDE.md` sem `editorHints` e exagerando "toda rota". O `ensureStore` de dev
**ainda** copiava o par para a linha — agora só quando o `.env` não o tem, e o doc diz isso.

**Verificado**: 94 testes (52 + 42, 7 novos), typecheck, build de produção, `checks-auth`
11/11 contra o servidor de produção real (`server.mjs`: CSRF passa com `X-Forwarded-Proto` e
recusa sem; bounce cai para `/app` com `/\evil.com`, `//evil.com`, `https://…`; `</script>`
não escapa do JSON; 401 `.data` com header de retry na lista **e** no editor; token expirado
ou forjado na URL → bounce, depois do bounce → 401; loaders sem segredo; log sem `id_token`),
flow21 5/5 contra o servidor de produção, bateria 6–22 no modo dev (flow22 = troca de tipo ao
vivo na loja: Normal → Produto → Normal → excluir). Falhas de teste corrigidas no caminho:
flow16 lia a etiqueta com o grip `⠿`; flow22 casava "Despublicar" em `hasText: 'Publicar'`;
flow9 não limpava a página que criava (flow7 encontrou a sobra).

**Ficou de fora, com nome**: o olho da árvore dentro do `<button>` da linha (HTML inválido,
P2); arrastar `<button draggable>` no Firefox (não testado; só há Chromium aqui); cifrar o
access token em repouso; inventário dos três arquivos `dvfly-solo`; webhook `themes/publish`;
renovação de token expirável sem ninguém abrir o app.

### ✅ Redesenho no padrão do admin (15/09, noite) — "sem cara de IA, igual à referência"

Pedido: tirar da interface o ar de coisa montada por IA e aproximá-la da referência.
Diagnóstico com prints: pílulas de texto no lugar de um catálogo, glifos tipográficos
(⠿ ✕ ⧉ ↑ ↓ 👁) fazendo papel de ícone, verde neon no botão principal, rótulos em
VERSALETES, um painel esquerdo só, ações da lista em azul de link. O que a pesquisa registra
da referência (relatórios 02 e 13): trilho vertical de ícones à esquerda com um painel por
vez, catálogo de elementos em cards com ícone e contagem, barra superior com nome + status
à esquerda, dispositivos com a largura em px no centro e Pré-visualizar / Ver ao vivo /
Salvar-Publicar à direita, inspetor com abas Geral | Estilo, listagem com abas por tipo,
busca e badges — tudo no tom neutro do admin da Shopify.

Feito, do zero, com identidade própria:
- **Tokens novos** (`app/app/ui/theme.tsx`): cinzas do admin, superfícies brancas com
  borda-fio, **um botão primário escuro** por tela, secundário branco com borda, `plain` nas
  linhas; badges tintadas sem borda (sucesso/neutro/info/crítico); foco azul; fonte Inter
  carregada; escuro recalibrado. Cor só onde tem significado.
- **Conjunto de ícones próprio** (`app/app/ui/icons.tsx`): 50 glifos traçados na mesma grade
  (16, traço 1.5), um por ação e um por bloco. Nenhum emoji ou caractere tipográfico sobrou
  como ícone — inclusive na barra flutuante do canvas (agora SVG) e nos lados do espaçamento.
- **Editor**: trilho de ícones (Construir · Configurações da página · Ajuda; atalhos e tema
  embaixo) com indicador de painel ativo; painel esquerdo com **Estrutura** (árvore com ícone
  por bloco, contagem de blocos, grip e olho no hover) e **Elementos** (busca, grade de cards
  3 colunas com ícone, contagem "D&VFly 15"); **Configurações da página abre no painel
  esquerdo** (como a referência), não mais numa gaveta sobre tudo; barra superior
  reorganizada (voltar · título · badge | dispositivos + "largura total"/"390 px" |
  desfazer/refazer · Pré-visualizar · Ver no ar · Salvar/Publicar); inspetor com cabeçalho
  (ícone + tipo + nome), barra de ações com ícones e nomes, abas sublinhadas Geral/Estilo;
  "Despublicar" mora em "Publicar em"; menu de contexto com ícones; canvas em cinza do admin.
- **Lista**: cabeçalho de página do admin, card com abas por tipo (Todas/Normais/Produto com
  contagem dos dados), busca por título ou URL, tabela com título em negrito + URL ou
  contagem de produtos embaixo, badge de tipo, badges por loja, barra de seleção em massa
  dentro do card, ações discretas na linha.
- O modelo de trabalho (Estrutura e Elementos visíveis juntos, inserção relativa ao bloco
  selecionado) foi mantido de propósito: com clique-para-inserir, separar os dois em painéis
  obrigaria a trocar de aba a cada bloco.

Verificado: typecheck; prints claro e escuro da lista, do editor vazio, com bloco
selecionado, aba Estilo, menu de contexto, configurações e barra de seleção em massa;
**bateria completa 6–22 verde contra o visual novo** (19 e 22 na loja real). Três
expectativas de teste estavam presas ao visual antigo e foram atualizadas, não o app: o grip
do canvas virou SVG (flow20), a aba Estilo agora tem dois ícones — pincel + dispositivo
(flow13), e o modo escuro é conferido por luminância em vez do rgb exato do token antigo
(flow17).

### ✅ `INICIAR-DVFLY.cmd` fechava na hora (16/09)

Causa: na revisão de 15/09 a mensagem de erro do `git pull` ganhou um parêntese — "(sem
internet, ou mudanca local nao salva)" — dentro de um bloco `if errorlevel 1 ( ... )`. O
cmd.exe fecha o bloco no primeiro `)` que encontra, mesmo dentro de um `echo`; o resto vira
erro de sintaxe e o arquivo inteiro aborta antes da primeira linha rodar — a janela some
"instantaneamente". Conserto: blocos por `goto` (sem parênteses), ASCII puro, fim de linha
CRLF forçado por `.gitattributes`. Como o próprio launcher faz o `git pull`, quem já está com
a versão quebrada precisa puxar uma vez à mão (comando no chat).

### ✅ "Bad Request" ao abrir dentro do admin pelo túnel (16/09)

Primeiro teste real dentro do admin da Shopify: a tela abre e qualquer ação (criar, salvar)
devolve **400 Bad Request** vindo de `singleFetchAction` — o CSRF do React Router. Causa
reproduzida localmente: o `react-router dev` copia **todo** o `app/.env` para
`process.env` antes de ler `react-router.config.ts`, e a linha `DVFLY_DEV_ORIGINS=""`
(vazia, herdada do `.env.example`) passava no `??` como "definida" — lista de origens
permitidas vazia, túnel `https` × servidor `http` recusado. Conserto: string vazia conta
como "não definida" (`?.trim() ||`). Prova: mesmo POST com `Origin:
https://abc.trycloudflare.com` deu 400 antes e passa depois. Lição para o CLAUDE.md: o
`.env` chega inteiro ao processo de dev, valor vazio incluído.

### ✅ Launcher travava com "You have unstaged changes" (16/09)

Na máquina do usuário o `npm run setup` e o Windows deixam arquivos do projeto alterados
(package-lock, fim de linha), e o `git pull --rebase` recusa. O launcher agora guarda essas
mudanças em `git stash` (recuperáveis) antes de puxar, e segue. Quem já está com o launcher
antigo puxa uma vez à mão: `git stash` + `git pull --rebase origin claude/dvfly-pagefly-research-skqx9r`.

### ✅ "Ir para o editor de temas" nas Configurações da página (16/09)

Pedido, com o primeiro teste real dentro do admin: o atalho que a referência tem para abrir
o editor de temas da Shopify já no modelo da página, onde o lojista esconde ou reordena as
seções do tema em volta do conteúdo — e que só existe depois de publicar. Feito: seção
"Editor de temas" nas configurações, uma linha por loja: cinza com "disponível depois de
publicar" enquanto não há nada no ar naquela loja; link depois, para
`admin.shopify.com/store/<loja>/themes/current/editor?template=<modelo>&previewPath=…` —
`product.dvfly-<id>` com o primeiro produto vinculado como preview para página de produto,
`page` ou `page.dvfly-solo` com `/pages/<url>` para página normal (o que está no ar em cada
loja decide, não o tipo atual). `themes/current` dispensa buscar o id do tema. Verificado:
flow23 4/4 (página normal no ar → link certo; rascunho → cinza com motivo; vira Produto,
vincula, publica na loja real → `template` igual ao nome do modelo e `previewPath` do
produto; exclusão limpa).

### ✅ Cabeçalho e rodapé desligáveis também na página de produto (16/09)

Pedido, com o teste real: o mesmo botão da referência que tira o cabeçalho e o rodapé **só
daquela página de produto** — porque escondê-los no editor de temas tira da loja inteira.
Na revisão de ontem eu tinha deixado o checkbox cinza para produto ("usa o layout do tema").
Agora funciona: desligado, o modelo `product.dvfly-<id>` ganha `layout: theme.dvfly-product`,
um layout que o app **deriva do `layout/theme.liquid` da própria loja** removendo só as tags
`{% sections 'header-group' %}` / `footer-group` / `header` / `footer` / `announcement-bar`
— o resto (CSS, scripts, seções de produto) fica exatamente como o tema desenhou. Tema sem
essas tags cai no layout mínimo do D&VFly. O layout é regravado a cada publicação que o usa
(atualização do tema chega nele) e vai **antes** do modelo, em chamada própria: a Shopify
valida o `layout` do modelo contra os arquivos que o tema já tem, e no mesmo lote ele ainda
não existia — foi a primeira tentativa falhando em silêncio. Religar remove só o **nosso**
layout do modelo (um `layout` que o tema tenha declarado fica).

Verificado na loja real (flow24): produto vinculado publicado com o checkbox desligado →
sem cabeçalho e sem rodapé, com o CSS do tema e as seções de produto presentes e o conteúdo
lá; religar e republicar → cabeçalho e rodapé voltam; excluir → produto volta ao padrão.
Três testes novos do pacote (45). Detalhe do teste: a vitrine devolve **429** se conferida
muitas vezes seguidas — a checagem passou a esperar mais entre tentativas. Fica na fila I3:
o `layout/theme.dvfly-product.liquid` é compartilhado pelas páginas de produto da loja e
não é removido ao excluir uma página.

### ✅ Lista em largura total (16/09)

Dentro do admin, a lista era um cartão estreito boiando no meio de uma tela larga — o ar
de demonstração que o usuário apontou. As listagens do próprio admin (Produtos, Pedidos)
ocupam a largura toda: agora a nossa também, alinhada à esquerda, sem o logo repetindo o
que a barra do admin já mostra, com células mais respiradas e a busca mais larga.
Verificado: print a 1680 px, flow7 e flow18 verdes.

### ✅ HTML colado sai fiel: o compilador parou de mexer no `style=""` (16/09)

Relato do usuário, com a página no ar: a landing page colada num bloco HTML **saía
diferente** do código — imagens estourando a largura, margens sumindo, espaçamentos
trocados. Medido, não deduzido: reconstruí o HTML original a partir do que estava publicado
(cada classe `.dvf-…` que geramos volta a ser o `style=""` que o autor escreveu), renderizei
o cru e o compilado lado a lado e comparei o estilo computado de **362 elementos** em duas
larguras: **94 diferenças** a 420 px (`height`, `max-width`, `margin`, `font-size`, `color`).

Duas causas, as duas nossas:
1. **Hoisting de estilos inline.** Um `style="margin:16px 0"` ganha de tudo na cascata; a
   classe que ele virava (`.dvf-x`, especificidade 0,1,0) **perde** para o próprio CSS do
   autor — que ainda ganhava `.dvf-page` no escopo, virando `.dvf-page #xx-lp .price`
   (1,2,0) — e perde também para o tema. Trocávamos a prioridade do autor por bytes.
2. **Nosso reset `.dvf-page img{max-width:100%;height:auto}`** limitava imagens que o autor
   tinha dimensionado (`max-width:680px` virava 100% da coluna).

Conserto: **o que o autor cola é o que é publicado.** `optimizeHtml` conta os estilos inline
(`inlineStylesKept`) e não os move; o bloco HTML marca seu território com `data-dvf-raw` e o
reset se retira lá dentro (`box-sizing:revert`, `max-width/height:revert`). O passe continua
fazendo o que só ele pode: escopar o `<style>` do autor (protege o tema), `loading`/`decoding`
nas imagens e os avisos (imagem sem dimensão, `onclick` no lugar de link, scripts).

Verificado: a mesma medição depois do conserto dá **0 diferenças** em 1200 px e 420 px (o
`loading="lazy"` é ignorado na medição — muda quando a imagem carrega, não o layout). 97
testes (52 + 45), typecheck, flows 7, 9, 10, 12, 13, 15 e 20 verdes. Perda assumida: o HTML
colado não encolhe mais por dedução de estilos repetidos — a barra de status deixou de
prometer isso e mostra só as regras de CSS.

### ✅ O tema entra na conta: editor igual à loja, HTML colado imune ao tema (16/09)

Pedido: "quero que vc agora ver os outros elementos" — depois do conserto do HTML colado,
olhar os demais blocos. Medição, não olho: uma página com **todos os 16 blocos** renderizada
em dois contextos — o canvas do editor e a **página de produto real da loja**, com o
`base.css` do tema e o bloco `<style data-shopify>` de configurações, comparando o estilo
computado de 69 elementos.

**Achado 1 — o canvas mentia: 455 diferenças a 1200 px e 514 a 420 px.** O editor mostrava
Times New Roman onde a loja mostra Archivo/Helvetica, títulos com metade do tamanho, o
divisor com 8 px de margem onde o tema dá **70 px**, `<summary>` com triângulo que na loja
não existe e `<button>` com a cara do navegador. O editor só alimentava as duas variáveis de
fonte do tema — e nada as usava.

Conserto: **o canvas carrega o CSS do tema da loja**, na mesma ordem da vitrine (folhas do
tema, bloco de configurações, depois a nossa página). A rota `api.theme-fonts` virou
`api.theme-style` e devolve também as folhas (https, nunca script) e o CSS que a própria
Shopify marca como do tema. A pré-visualização de página inteira ganhou o mesmo tratamento.
Best-effort: loja fora do ar → o editor segue funcionando como antes. Medido depois:
**0 diferenças** nas duas larguras.

**Achado 2 — o HTML colado, dentro do tema, saía com 1474 diferenças** do arquivo do autor
(a medição do conserto anterior tinha sido contra um documento nu, sem tema). Três causas:

1. **`rem`.** O tema define `html{font-size:62.5%}` (10 px). Cada `5.2rem` que o autor
   escreveu saía a **52 px em vez de 83.2 px** — a página inteira a 62,5% do tamanho
   desenhado. Não existe CSS que re-enraíze `rem` num pedaço da página, então o valor é
   resolvido no compilador, com a raiz que o arquivo do autor implica (16 px, ou o que o
   `html{font-size}` dele disser). Preludes de `@media` ficam intactos: ali `rem` já vale o
   mesmo nos dois lados. Contado em `remRebased`.
2. **Herança do tema.** `body{letter-spacing:.06rem;line-height:1.8}` descia para tudo.
3. **Colisão de classes.** A `.price` do autor levava as regras da `.price` do tema.

Conserto: duas regras com **exatamente uma classe de especificidade** — o suficiente para
ganhar do tema (regras de elemento e de classe, que carregam antes) e nunca o bastante para
ganhar do CSS do próprio autor (que sai depois e já leva `.dvf-page` na frente):
`:where([data-dvf-raw])` corta a herança e `[data-dvf-raw] :where(*)…{all:revert}` apaga o
tema lá dentro. `<svg>`, `<img>` e `<table>` ficam fora do `all:revert` e recebem a mesma
limpeza propriedade a propriedade: `revert` também apaga **atributo de apresentação**, e
`width`/`height`/`viewBox` são isso — os ícones do autor sumiam e a imagem perdia a proporção.
As regras só entram na página que tem HTML colado (~700 B).

Verificado: **0 diferenças** em 1200 px e 420 px contra o arquivo do autor, dentro do tema
real, e 0 também num documento nu (a medição anterior segue valendo). 102 testes (57 + 45),
typecheck, build, `checks-auth` inteiro contra o servidor de produção, flows 7, 9, 10, 12,
13, 15, 20 e o novo 25 (o canvas com o tema) verdes.

### ✅ Pronto para sair do localhost: Postgres, token criptografado e dois caminhos de deploy (16/09)

Pedido: *"subir o servidor do app da Shopify para sair de localhost… se eu fecho aqui ele lá
na Shopify cai… ter um banco de dados… LEIA O DOCUMENTO DA SHOPIFY"*. A documentação de
hospedagem da Shopify foi lida na fonte e mandou três coisas: **HTTPS com endereço fixo**,
**banco que não seja arquivo** (num host serverless o disco é jogado fora a cada publicação)
e **token de acesso criptografado no banco** ("in case their database is compromised").

**Banco.** O `schema.prisma` virou gerado: `app/scripts/prisma-schema.mjs` lê a `DATABASE_URL`
e escreve o datasource — `file:` vira SQLite (sua máquina, zero instalação), `postgres://`
vira Postgres (servidor). O template é a fonte, o gerado não é versionado, e não existe um
segundo schema para sair do sincronismo. Migrations de verdade (`prisma migrate deploy`) no
Postgres; `db push` no SQLite descartável. `app/scripts/db-sync.mjs` escolhe sozinho, e é
chamado pelo build da Vercel e pelo start do container: **não existe passo manual de banco**.

**Segredo.** `secrets.server.ts`: AES-256-GCM com `DVFLY_TOKEN_KEY` (32 bytes,
`npm run gerar-chave`). O `accessToken` e o `clientSecret` entram lacrados e saem abertos num
único lugar (`toStore`), linhas antigas em texto puro continuam funcionando, e **em produção o
app se recusa a subir sem a chave**. Provado: valor lacrado não contém o token, abre igual,
adulterado é recusado.

**Dois caminhos, o mesmo repositório.** Vercel (preset `@vercel/react-router`, ligado só
quando `VERCEL=1`, banco Postgres do marketplace) e VM própria (`Dockerfile` + `docker-compose`
com Postgres e Caddy, HTTPS automático, migrations no start). Publicar uma versão nova é um
duplo clique: `PUBLICAR-DVFLY.cmd` (Vercel) ou `PUBLICAR-DVFLY-VM.cmd` (VM) — e **só isso**
muda o que está no ar.

**O que já existia vai junto.** `npm run migrar-dados` copia o banco local para o servidor
(lojas, páginas, versões, publicações), idempotente, criptografando os segredos na entrada e
sem apagar nada da máquina.

**Saúde.** `/healthz`, sem autenticação por desenho: banco, credenciais presentes, nº de
lojas, ambiente. É o que responde "o deploy foi, mas o banco não" — a falha que, sem isso,
aparece como erro sem nome dentro do admin.

**Verificado de verdade** (Postgres 16 rodando aqui, não no papel):

- app em **modo produção contra Postgres**: `/healthz` ok, `checks-auth` inteiro (11 passos:
  CSRF atrás de proxy, bounce, 401 com header de retry, token forjado, loader sem segredo).
- `npm run migrar-dados` levou 1 loja, 1 página, 13 versões e 1 publicação do SQLite para o
  Postgres; conferido no `psql` que o `clientSecret` chegou como `dvf1.…` — **criptografado**.
- fluxos 7, 12 e 13 (criar, salvar, exportar, importar, excluir) verdes **contra o Postgres**.
- 102 testes, typecheck, build, e o `docker compose config` valida.

**O que não deu para verificar aqui, dito na cara:** o `docker build` não completa neste
ambiente com a rede normal — os containers não alcançam o `registry.npmjs.org`. (Resolvido
no mesmo dia passando a proxy do sandbox; veja a entrada seguinte, onde a pilha inteira roda.)

**Guia:** `docs/HOSPEDAGEM.md` — as duas estradas, passo a passo, com a tabela de erros
comuns e a nota honesta sobre o plano Hobby da Vercel ser para uso não comercial.

### 🔴→✅ Três vezes a mesma armadilha: caminho do Windows × URL de arquivo (16/09)

A primeira instalação real na VM Windows quebrou três vezes seguidas, e as três eram a mesma
coisa escrita de jeitos diferentes — código que o Linux aceita e o Windows não. Vale registrar
as três porque nenhuma delas aparece em teste unitário nem em CI Linux:

1. **`db:schema` "passou" sem escrever nada.** O arquivo decidia se estava sendo executado com
   `import.meta.url === \`file://${process.argv[1]}\``. No Windows o argumento é
   `C:\dvfly\app\scripts\prisma-schema.mjs` e a url é
   `file:///C:/dvfly/app/scripts/prisma-schema.mjs` — nunca iguais. Saía 0, e a falha aparecia
   dois comandos depois: *"Could not find Prisma Schema"*. Conserto pela raiz: biblioteca pura
   (`prisma-schema.mjs`) × arquivo que executa (`db-schema.mjs`), e este **diz** o que escreveu.
2. **As tarefas subiram e o app nunca respondeu.** O runner chamava `node` pelo nome, e o
   serviço de Tarefas do Windows entrega aos filhos o ambiente de quando **ele** subiu — nessa
   VM, antes de o Node existir. A tarefa morria com "não reconhecido", mensagem que ninguém vê:
   saída de tarefa agendada não vai para lugar nenhum. Agora o caminho do node é absoluto, e
   quando o app não responde o instalador imprime o `LastTaskResult` de cada tarefa com a
   legenda dos números.
3. **`node server.mjs` na mão: `ERR_UNSUPPORTED_ESM_URL_SCHEME`, "Received protocol 'c:'".**
   O servidor fazia `await import(caminhoAbsoluto)`; o loader de ESM lê a letra do drive como
   esquema de URL. No Linux um caminho POSIX absoluto é aceito por acaso, então a linha
   atravessou todos os testes. Agora é `new URL('./build/server/index.js', import.meta.url).href`.

Junto, duas arestas que apareceram no caminho: `db:deploy` sozinho herdava o provider que o
último build tivesse deixado no `schema.prisma` (agora o comando que precisa do schema é quem o
escreve), e o npm 11.17 da VM já avisa que `prisma`/`esbuild` têm script de instalação não
aprovado — no npm 12 isso **bloqueia**, e a VM pararia de compilar sozinha; o campo
`allowScripts` na raiz já aprova os quatro.

A lição, que está no CLAUDE.md: **caminho de arquivo não é URL de arquivo**, e o Linux esconde
isso nas três formas acima.

### 🔴→✅ O instalador parou na VM: um `if` que só é verdade no Linux (16/09)

Primeira execução real na VM, e parou em `npm run setup` com
*"Could not find Prisma Schema"*. O passo anterior, `npm run db:schema`, tinha saído **com
sucesso e sem escrever nada**.

A causa, inteira numa linha:

```js
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {   // ERRADO
```

No Linux isso é verdade. No Windows o argumento é `C:\dvfly\app\scripts\prisma-schema.mjs`
e a url é `file:///C:/dvfly/app/scripts/prisma-schema.mjs` — **nunca** iguais. O script
carregava, não executava nada, saía 0, e a falha aparecia dois comandos depois, com o nome de
um arquivo que ninguém tinha sido avisado que era gerado.

Conserto pela raiz, não pelo remendo: o arquivo que existe para ser executado parou de
adivinhar se está sendo executado. `prisma-schema.mjs` virou biblioteca pura (sem efeito no
import) e `db-schema.mjs` é o que escreve — e agora **diz** o que escreveu, porque um passo
silencioso é o que faz a falha aparecer longe da causa.

Junto, uma coisa que a tela da VM mostrou e que ainda não mordia: o npm de lá (11.17) já
avisa que `prisma`, `@prisma/*` e `esbuild` têm script de instalação **não aprovado**. Hoje é
só aviso; no npm 12 passa a bloquear — e a VM pararia de compilar sozinha, num dia qualquer,
sem ninguém ter mexido em nada. O campo `allowScripts` na raiz já aprova os quatro.

Verificado aqui: a cadeia inteira que a VM roda (`setup` → `build` → `db:deploy`), 102 testes,
typecheck. A armadilha do `argv[1]` está no CLAUDE.md.

### ✅ A VM é Windows: instalação nativa, num comando (16/09)

O print da VM mudou o plano: é **Windows**, acessada por Área de Trabalho Remota, e está
limpa. Docker no Windows exige virtualização aninhada — a maioria das VMs de hospedagem não
tem, e Docker Desktop em servidor é licença e dor de cabeça. Então a VM ganhou caminho
próprio, **nativo**: Node, Git e Caddy instalados na máquina pelo winget, e o Windows
mantendo tudo de pé.

`deploy/windows/instalar-na-vm.ps1` faz a instalação inteira e pergunta só duas coisas (o
domínio e as credenciais da Shopify): instala o que falta, baixa o código em `C:\dvfly`,
gera a chave de criptografia, escreve o `.env`, compila, prepara o banco, escreve o
`Caddyfile` com o domínio, abre 80/443 no firewall e registra **duas tarefas do Windows**
(app e HTTPS) que sobem no boot e se reerguem sozinhas em 1 minuto se caírem. Roda quantas
vezes quiser: o que já existe é reaproveitado e o banco não é tocado.

Três decisões, ditas na cara:

- **Banco é SQLite** nesta estrada — um arquivo, zero instalação, e suficiente para um
  servidor de um processo. Trocar para Postgres depois é uma linha no `.env` mais
  `npm run migrar-dados`. (O caminho do Postgres continua provado no Linux/Docker.)
- **O app escuta só em `127.0.0.1`**: quem fala com a internet é o Caddy, com TLS. Sem isso
  dava para chegar no app pela 3000 sem passar pelo HTTPS. Conferido: de fora, a porta não
  responde.
- **As variáveis vivem no processo do app**, não na máquina. Um `NODE_ENV=production` global
  mudaria o comportamento dos outros programas que já moram nessa VM (AdsPower,
  flow-worker) sem ninguém entender por quê.

Verificado sem ter Windows aqui, que é o que dá para verificar honestamente: os dois scripts
passam pelo **parser do PowerShell**, as funções de verdade (leitura do `.env`, modelo do
`Caddyfile`, leitura da porta) foram **extraídas por AST e testadas** contra dados reais (9
checagens), e o app foi rodado **exatamente na configuração da VM** (produção + SQLite +
chave + `HOST=127.0.0.1`), respondendo `banco: ok` e recusando conexão de fora. Três
armadilhas do Windows foram consertadas antes de sair: `Write-Host` com dois argumentos
posicionais (erro no 5.1), `--disable-interactivity` (não existe em winget antigo) e o
`NODE_ENV` global.

O que só a VM prova: winget, tarefas agendadas e o certificado do Caddy. É a primeira coisa
que o instalador mostra na tela.

### ✅ A pilha da VM provada de ponta a ponta — e dois defeitos consertados (16/09)

O usuário escolheu a VM. Antes de ele encostar na máquina dele, a pilha inteira subiu **aqui**
(Docker + Postgres 16 + Caddy). Os containers deste ambiente não alcançam o `registry.npmjs.org`;
a imagem foi construída passando a proxy e a CA do sandbox num `Dockerfile.test` descartável —
o que muda é só a rede, o resto da imagem é o arquivo do repositório.

O que a prova pegou (e que nenhuma leitura de código pegaria):

1. **503 por 30 s depois de publicar.** O `Caddyfile` fazia checagem ATIVA de saúde. Com um
   destino só, a primeira checagem cai enquanto o app ainda sobe e o destino fica marcado como
   morto até a rodada seguinte — 30 segundos de 503 para todo mundo. Tirada. Quem vigia agora é
   o `healthcheck` do container (bate no `/healthz`, que só dá 200 com o banco respondendo).
2. **1,3 s de 502 a cada publicação** (medido com uma requisição a cada 200 ms durante um
   `up -d --build`): ao recriar o container, o nome `app` some do DNS do Docker e o Caddy não
   repete requisição que falha em DNS. Conserto: `dynamic a` — o endereço é resolvido a cada
   requisição, com `lb_try_duration`. Nova medição: **0 falhas em 120 amostras**.

Também medido e conferido: HTTPS automático (certificado emitido pelo Caddy, `http` → 308),
as migrations aplicadas sozinhas no start (log do container), o banco **sobrevivendo** a
reinício e a recriação do container, e o app **recusando subir** em produção sem
`DVFLY_TOKEN_KEY` — com a mensagem que diz o que fazer.

A imagem saiu de **899 MB para 733 MB**: `npm prune --omit=dev` depois do build (o CLI do
Prisma virou dependência de verdade, porque é ele que aplica as migrations no start) e o motor
extra do Prisma (`rhel-openssl-3.0.x`, que só a Vercel usa) passou a entrar **só quando
`VERCEL=1`** — o bloco `generator` também é gerado agora, pela mesma regra do datasource.

### ✅ A logo virou marca do app (16/09)

A logo enviada (o losango de 25 peças) foi redesenhada **por regra, não à mão**: grade 5×5
girada 45°, peça crescendo do vértice de cima para o de baixo, medidas tiradas da imagem
(passo 13,2% do lado, peça de 4,2% a 11,4%). Saem três arquivos do mesmo gerador:
`app/public/mark.svg` (marca cheia), `app/public/favicon.svg` (a simplificação 3×3, que é o
que sobrevive a 16 px — e agora também o que o editor mostra a 22 px, onde 25 peças viravam
poeira) e `docs/marca/app-icon-1200.png`, para o campo de ícone do app no Dev Dashboard.
O `viewBox` é cortado na caixa real do desenho, calculada, não chutada.

### 🔴→✅ 502 para o mundo com o app de pé: duas letras maiúsculas (17/09)

A instalação na VM terminou dizendo **PRONTO**, com o `/healthz` respondendo `{"banco":"ok"}` —
e, ao mesmo tempo, `https://app.megaakciok.shop/healthz` devolvia **502** de fora. Medido daqui:
12 amostras em 3 minutos, 502 em todas, cada uma levando ~16 s (exatamente o `lb_try_duration`
do Caddy desistindo de achar o app). Caddy de pé, certificado válido, DNS certo, app
respondendo. As duas coisas verdadeiras ao mesmo tempo, e incompatíveis.

A causa, no instalador:

```powershell
$Porta = 3000
...
foreach ($porta in 80, 443) { ... }   # abre o firewall
...
EscreverRunner $Raiz $Porta            # ja vale 443
```

**Nome de variável no PowerShell não diferencia maiúsculas**: `$porta` e `$Porta` são a mesma
variável. Depois do laço do firewall, a porta do app valia **443**. O `Caddyfile` tinha sido
escrito antes, com 3000. Então o app subia em `127.0.0.1:443` e o Caddy — que no Windows
consegue abrir `0.0.0.0:443` mesmo com alguém em `127.0.0.1:443` — atendia o mundo e procurava
o app num lugar vazio. E a conferência final do instalador batia em
`http://127.0.0.1:$Porta/healthz`, ou seja, **na porta errada pelo mesmo motivo**: acertava o
app direto, sem passar pelo proxy, e dizia PRONTO.

O que isso ensina, e virou regra no CLAUDE.md: **toda checagem local passava por fora do
caminho do visitante**. Nenhuma podia falhar. Agora o instalador e o diagnóstico medem o
caminho de verdade, sem sair da máquina:

```powershell
curl.exe -k --resolve "$dominio:443:127.0.0.1" "https://$dominio/healthz"
```

(`--resolve` manda a conexão para o loopback com o nome certo no SNI; pedir `https://dominio`
de dentro da VM não serve de prova, porque muitas VMs não enxergam o próprio IP público.)

Consertado em três camadas, para o erro não ter como voltar: a variável ganhou nome próprio
(`$PortaDoApp`) e o laço do firewall outro; o `EscreverRunner` **recusa** 80, 443 ou qualquer
coisa fora de 1024–65535 (a porta do app nunca é a porta do servidor web); o `PortaDoRunner`
ignora o `set PORT=443` que a instalação quebrada deixou. O diagnóstico agora mostra, lado a
lado, a porta do app e a porta que o Caddy procura, mais quem ocupa a 80 e a 443.

Verificado: 17 checagens sobre as funções reais (extraídas por AST, rodadas no PowerShell 7),
incluindo a simulação do laço que causou o bug; os quatro scripts passam no parser.

### ✅ Senha de acesso: loja instalada não é loja liberada (17/09)

O app publicado na Shopify (`dvhub-application-19`) é de distribuição custom, então só instala
quem recebe um link gerado por nós. Isso já é uma barreira — mas link se encaminha, e loja
muda de dono. A partir de agora, **instalar não é o mesmo que poder usar**.

Com `DVFLY_ACCESS_KEY` preenchida, a loja que abre o app cai numa tela (`/liberar`): nome da
loja, campo de senha, e nada mais — nenhuma contagem de páginas, nenhuma lista, nenhuma pista
do que a senha parece. Acertou, aquela loja fica liberada **para sempre**
(`Store.authorizedAt`); ninguém digita de novo, nem depois de reinstalar ou de atualizar o
app. Vazia, a variável não muda nada para quem já usava — o cadeado é opcional por desenho.

Três decisões que valem estar escritas:

- **A trava mora dentro do `requireShop`**, não em cada tela. É a única porta por onde toda
  tela e todo dado já passam; um portão em qualquer outro lugar é um portão que a próxima
  rota esquece de pôr. A exceção é a própria tela de senha, e ela é **nomeada**, não adivinhada.
- **Pedido de documento cai na tela; pedido de dados leva 403.** Redirecionar um `fetch` do
  App Bridge para uma tela HTML entregaria uma página onde o código espera JSON.
- **Cinco erros por loja e vem uma pausa de 5 minutos** — contada em memória, por loja, e é a
  loja errada que espera, não as outras. A comparação da senha é feita sobre o hash das duas
  (`timingSafeEqual`), então o tempo da resposta não conta quantos caracteres estavam certos.

**O bloqueio quase trancou o dono do lado de fora (17/09, mesmo dia).** Na loja de verdade, a
tela de senha não apareceu: veio o texto da página de *bounce* dizendo que a janela não estava
no admin. O navegador do lojista estava barrando `cdn.shopify.com`, e sem o App Bridge o pulo
que eu tinha inventado — redirecionar para `/liberar` **sem** o token, para que a tela pedisse
um novo — não tinha como se completar. Dirigindo com a CDN bloqueada de propósito, apareceu
ainda um segundo defeito, pior: sem App Bridge a página **não hidrata**, o campo controlado
nunca atualizava o estado do React e o botão ficava desabilitado para sempre. Uma tranca sem
buraco de fechadura.

Três consertos, todos na direção de depender de menos:

- o portão **leva junto o token que já veio na URL** (é a mesma URL que o admin acabou de
  abrir — mesma exposição, um pulo a menos);
- a tela virou um **formulário de verdade** (`<form method="post">`), que o navegador envia
  sozinho, sem JavaScript, para a mesma URL — e o token vai no envio;
- a volta, depois de liberar, **também leva o token**, senão a tela seguinte cairia no mesmo
  pulo.

Medido com a `cdn.shopify.com` abortada no navegador: abrir → tela de senha → senha errada
contada → senha certa → **cai direto na lista de páginas**. Nenhum pedaço do caminho depende
do App Bridge. (O resto do app ainda depende: salvar e publicar mandam o token por `fetch`.
Num navegador que barra a CDN da Shopify, o app abre mas não salva — a mensagem da página de
bounce agora diz isso com todas as letras, em vez de mandar o lojista abrir pelo admin onde
ele já estava.)

Verificado dirigindo, não no papel: **17 checagens** contra o servidor de produção com ID
tokens assinados com o segredo real (loja trancada, 403 no `.data`, senha errada, a pausa
depois do quinto erro, a senha certa liberando **só** aquela loja, destino para fora do app
ignorado, e a própria tela exigindo ID token), **3 checagens** com a variável vazia (nada
muda para quem já usava) e o navegador de verdade: abrir → errar → acertar → reabrir sem
perguntar, nos temas claro e escuro. Mais 7 testes unitários da comparação e do contador.
`npm test` agora inclui o pacote `app` (109 testes no total).

### 🔴→✅ O app caiu e não voltou: o Windows só reinicia o que FALHA (17/09)

Meia hora depois de a instalação terminar com `/healthz` respondendo 200, o admin da loja
ficou carregando para sempre e daqui de fora vieram **8 respostas 502 em 2 minutos, todas
levando ~16 s** (o Caddy desistindo). O app estava no chão — e, pior, continuou lá.

A tarefa agendada tinha `RestartCount 999`, e essa configuração cobre um caso só: a tarefa que
**falha**. Um processo que sai com código 0 — um encerramento pedido pelo sistema, uma parada
qualquer — conta como sucesso, a tarefa termina normalmente e o Windows não tem nada para
reiniciar. O app fica fora do ar até alguém abrir a VM e reparar.

Conserto na raiz: o runner virou um **laço**. Saiu por qualquer motivo, volta em 5 segundos,
registrando no log o código de saída. Parar de verdade continua sendo parar a **tarefa**, que
mata o `cmd` junto — que é o que o instalador, o atualizador e o `senha.ps1` fazem.

Duas armadilhas pagas junto:

- `timeout /t 5` **recusa rodar sem console**, e uma tarefa agendada não tem um. A espera é
  feita com `ping -n 6 127.0.0.1`, que funciona em qualquer lugar.
- parar a tarefa nem sempre leva o filho junto. Se o `cmd` morre e o `node` fica, ele segura a
  porta (a cópia nova não sobe) e o motor do Prisma (EPERM ao compilar). Agora o `PararApp`
  recebe a porta e mata **quem estiver ouvindo nela** — que só pode ser o app, porque quem
  chega depois não consegue nem abrir a porta.

Verificado: 14 checagens sobre o runner gerado de verdade (o laço existe, a ordem das linhas
faz sentido, nada de `timeout`, os três scripts passam a porta) e os cinco scripts no parser.
O `diagnosticar.ps1` passou a dizer, na primeira linha, se o runner daquela máquina tem o laço
— uma instalação antiga não tem, e isso agora aparece em vez de ser adivinhado.

### ✅ Duas lojas, dois apps da Shopify, um servidor só (17/09)

A segunda loja não instalava: *"Não é possível usar este link de instalação — o app pode não
estar disponível para esta loja"*. Não é defeito nosso e não tem configuração que resolva: a
**distribuição custom da Shopify amarra um app a UMA loja**, e a segunda loja vive em outra
organização. O caminho é um segundo app custom, com outro Client ID e outro secret.

A saída óbvia — subir uma segunda instalação do D&VFly — seria duas ilhas: páginas separadas,
dois bancos, nada de "publicar nas duas de uma vez". Então o servidor passou a atender
**vários apps ao mesmo tempo**:

- `SHOPIFY_CLIENT_ID_2` / `SHOPIFY_CLIENT_SECRET_2` (e `_3`, `_4`…). Par pela metade **derruba
  o boot** com a mensagem certa, em vez de ser ignorado e reaparecer como "essa loja não
  instala" três dias depois.
- De qual app é um token sai do **`aud`**, lido sem verificar nada — e isso é seguro
  justamente porque não decide nada: a escolha só diz **com qual segredo** a assinatura vai
  ser conferida. Um `aud` forjado escolhe um segredo que o falsificador não tem, e a
  verificação recusa. Está medido: token do app B assinado com o segredo do app A → 401
  "assinatura"; token de um app que este servidor não atende → 401 "aud".
- Cada loja guarda em `Store.clientId` o app que instalou — na liberação (onde o token já foi
  verificado) e de novo na instalação. É com a credencial dele que o app troca token, publica
  e confere webhook daquela loja.
- O **App Bridge de cada tela recebe o Client ID da loja daquela tela**. Com o id do outro app,
  o admin não embute a página e nenhum `fetch` sai assinado — uma falha que parece tudo e
  nada. Medido: o HTML da loja A traz o id do app A e **não** traz o do B, e vice-versa; o
  mesmo na página de bounce.

Verificado: **10 checagens** contra o servidor de produção com dois apps configurados e duas
lojas (incluindo as duas recusas acima e "nenhum segredo no HTML"), **116 testes** unitários
— 7 novos só para a escolha por `aud` —, typecheck e build. Na VM, um comando acrescenta o
app novo: `deploy\windows\adicionar-app.ps1` (10 checagens sobre a função que escolhe o
próximo número livre no `.env`).

### 🔴→✅ "Já está na versão mais nova. Nada a fazer." — e não estava (21/09)

O ATUALIZAR rodou, ficou nove minutos compilando (medido de fora: nove minutos de app fora do
ar) e não aplicou nada. Clicar de novo respondia **"Ja estava na versao mais nova. Nada a
fazer"** — e continuaria respondendo isso para sempre.

O atualizador comparava **commits**: `git reset` primeiro, compilar depois. Quando a
compilação morre no meio — uma janela fechada, falta de disco, ou (o caso aqui) **outro script
parando o app no meio da compilação** —, o disco fica com o código novo e o build do código
velho. Na rodada seguinte os commits batem, e ele vai embora sem fazer nada. O conserto nunca
chega, e a tela diz que está tudo em dia.

Agora quem responde é o **build**: o commit compilado fica gravado em
`app\build\.commit-construido`, escrito só depois de `npm install`, `npm run build` e
`db:deploy` terem dado certo. Pular a compilação exige que esse registro bate com o `HEAD` de
agora — "mesmo commit" sozinho não basta mais. E, mesmo quando não há o que fazer, o
atualizador confere se o app está de pé e o sobe se não estiver.

11 checagens sobre o script e sobre a regra (versão nova → compila; mesma versão com build
certo → não; mesma versão com build velho ou sem registro → compila).

Junto, no `adicionar-app.ps1`: `appsDaShopify` ausente no `/healthz` não é mais um JSON cru na
tela vermelha — é "o CÓDIGO desta VM é antigo, clique em ATUALIZAR", que era exatamente o que
estava acontecendo.

### 🔴→✅ O instalador apagava o segundo app da Shopify (21/09)

Rodar o instalador de novo — o que a própria documentação manda fazer para consertar qualquer
coisa — **apagava o app da segunda loja**. Ele reescreve o `app\.env` inteiro a cada rodada, a
partir de uma lista fixa de variáveis; `SHOPIFY_CLIENT_ID_2` e `SHOPIFY_CLIENT_SECRET_2` não
estavam nessa lista, porque quem os escreve é outro script (`adicionar-app.ps1`). A loja da
segunda organização simplesmente parava de entrar, e nada na tela ligava uma coisa à outra.

Agora o instalador **devolve o que não é dele**: toda chave que ele não escreve é lida antes e
recolocada depois, e ele diz na tela quantos apps extras manteve. Vale para o que ainda vier —
a regra é "o que outro script pôs aqui continua aqui", não uma lista de exceções que alguém
teria de lembrar de aumentar.

12 checagens sobre a função real (extraída por AST): guarda os dois pares do app 2, guarda uma
chave qualquer que alguém tenha posto à mão, **não** duplica as que o instalador escreve,
ignora comentário e linha vazia, e não explode sem arquivo.

### 🔴→✅ Dez minutos de tela parada, e um build que não existia (21/09)

O app entrou em laço de reinício a cada 5 segundos com
`Cannot find module 'C:\dvfly\app\build\server\index.js'`. A compilação tinha morrido no
meio; o instalador terminou dizendo que estava tudo certo, e o erro do npm **nunca apareceu**:
ele era engolido por um `| Out-Null`.

Dois consertos, e o segundo é o que fecha o buraco:

- **A saída do npm fica na tela.** Uma janela parada por dez minutos não se distingue de uma
  janela travada — e é aí que alguém abre outra janela e mexe no app, que foi exatamente o que
  matou a compilação (o outro script para o app; a compilação em curso vai junto).
- **Compilar sem erro não é prova.** Instalador e atualizador agora conferem que
  `app\build\server\index.js` existe antes de declarar sucesso. Sem isso, o app sobe, não
  acha o build, e o laço do runner o reergue a cada 5 segundos para sempre — com a instalação
  dizendo PRONTO.

Nenhum dos dois é sofisticado. Os dois existem porque a tela mentiu, e uma tela que mente
custa mais caro que qualquer bug.

### ✅ Girar a chave secreta virou o mesmo comando (21/09)

Um secret apareceu em texto numa conversa — acontece. O conserto é girar a chave no Dev
Dashboard, e aí o `adicionar-app.ps1` recusava: *"Este Client ID ja esta configurado aqui"*.
Sobrava editar o `.env` à mão, que é exatamente o que esses scripts existem para evitar.

Agora Client ID repetido **não é erro, é troca de secret**: ele reconhece o app, substitui só
o segredo daquele par e diz qual foi. Client ID novo continua virando app novo.

Um bug do próprio conserto, achado pelo teste antes de sair daqui: no app principal
(`SHOPIFY_CLIENT_ID`, sem número) o grupo opcional da expressão regular não aparece em
`$Matches`, e a troca viraria "acrescentar app". Dez checagens cobrem os três caminhos —
trocar o principal, trocar um numerado, acrescentar um novo — e que nenhum deles encosta nos
outros.

### 🔴→✅ A segunda loja não entrava, e a culpa era da minha mensagem (21/09)

A Colombia instalou o app — ele aparece na lista de Apps do admin dela —, mas a tela dizia
*"O script da Shopify (App Bridge) não carregou nesta janela… o escudo do navegador está
barrando cdn.shopify.com"*. Era a minha mensagem nova, escrita hoje de manhã, apontando com
segurança para o culpado errado.

Medido em vez de acreditado: subi um servidor com dois apps e pedi o bounce de uma loja que
ele nunca viu. Ele devolveu a chave do **app 1**. O admin da Colombia embutiu o **app 2** —
App Bridge com a chave de outro app não inicializa, `window.shopify` nunca existe, e cai no
mesmo `catch` de quando o script é bloqueado. Duas causas, uma frase só.

A raiz é honesta: para uma loja que ainda não está no banco, **nada na requisição diz de qual
app ela é** — não há token, não há linha, e o admin não nomeia o app. Com um app configurado a
pergunta não existia; com dois, escolher o primeiro é cara ou coroa.

Agora, loja desconhecida **tenta um app por vez**: falhou, recarrega com `?app=1`, depois
`?app=2`, e só depois de acabarem as chaves é que a mensagem aparece. A chave errada custa uma
recarga; a certa registra a loja, e daí em diante a linha dela responde na hora. Loja conhecida
não adivinha nada — vai direto no app dela.

12 checagens contra o servidor de produção com dois apps (duas novas: a cadeia de tentativas
da loja desconhecida e o "loja conhecida não adivinha").

### 🔴→✅ "O script não carregou" — com o script carregado (21/09)

A loja nova continuou sem entrar depois do conserto anterior, e eu mandei o usuário caçar um
bloqueador de anúncios. Ele abriu `cdn.shopify.com/shopifycloud/app-bridge.js` no navegador e
colou o arquivo inteiro aqui: carregava perfeitamente. E no meio do próprio código do App
Bridge estava a resposta:

```js
const yt = ["apiKey","shop"];
… if (n.length) throw Error("App Bridge Next: missing required configuration fields: " + n)
```

Ele **exige `apiKey` e `shop`**, lidos da query da própria página ou de `<meta name="shopify-*">`.
A minha página de bounce mandava só a `apiKey`; o `shop` ia escondido dentro do parâmetro `to`,
codificado, onde ele não olha. Resultado: o script carrega, **desiste**, `window.shopify` nunca
existe — e o `catch` da minha página anunciava que o script tinha sido bloqueado.

Conserto: o `shop`, o `host`, o `embedded` e o `locale` viajam na URL do **próprio** `/bounce`,
e a página emite os `<meta>` correspondentes. Medido o caminho inteiro que o admin faz:
`/?shop&host` → `/app?shop&host` → `/bounce?to=…&shop&host` → três metas na página.

E a lição que vale mais que o conserto: **eu afirmei três vezes que era o navegador do
lojista**, com confiança, e as três vezes o defeito era meu. A mensagem na tela era minha
também, e mandava procurar no lugar errado. Ela agora diz o que foi observado ("o App Bridge
não se registrou aqui") e aponta o console do navegador, onde o próprio App Bridge escreve o
motivo exato. Está no CLAUDE.md, com nome e sobrenome.

14 checagens com dois apps (duas novas: os metas obrigatórios e o caminho inteiro carregando
`shop` e `host`), 17 do cadeado com um app só, 116 testes, typecheck, build.

### A recusa que dizia uma palavra e escondia o conserto

Com o bounce consertado, a loja da Colômbia passou a chegar em `/app?dv_bounced=1` com token
na mão — e a tela respondeu **`ID token recusado (assinatura).`** Essa palavra é exata e é
inútil: só quem conhece o `credentialsFor` sabe que "assinatura" significa que o `aud` **casou**
com um app deste servidor (logo o secret conferido foi o certo) e que o segredo guardado aqui
não é o que a Shopify usou para assinar. Ou seja: a chave secreta foi girada no Dev Dashboard
e o `.env` da VM ficou com a antiga — exatamente o que acontece depois de um vazamento.

As duas recusas que uma instalação saudável produz têm conserto próprio e a mesma cara de
"o app quebrou":

| motivo | o que é | conserto |
|---|---|---|
| `assinatura` | o app é conhecido, o secret guardado é velho | `adicionar-app` com o **mesmo** Client ID e a chave atual |
| `aud` | o token é de um app que este servidor nunca viu | `adicionar-app` com o Client ID e a chave desse app |

`app/app/lib/token-refusal.ts` (puro, 3 testes novos) traduz o motivo em frase com a rota do
conserto, e nomeia o Client ID — que é público, vai no `<meta>` de toda página, e sem ele não
dá para saber **qual** secret trocar. Motivo sem conserto conhecido sai como estava, sem
diagnóstico inventado.

Provado dirigindo o servidor construído com dois apps configurados: token do app 2 assinado
com o secret errado → 401 com a frase que nomeia o app; token de um app desconhecido → 401 que
**não** fala em secret girado; token assinado com o secret certo → passa da assinatura. 119
testes, typecheck, build.

### O Enter que ninguém digitou, e o segredo que foi parar no print

O `adicionar-app` morreu com **`Sem o par completo nao da para atender o app novo.`** — e a
tela mostrava a pergunta do Client ID sem resposta nenhuma, seguida da chave secreta digitada
na pergunta seguinte. Ninguém pulou a pergunta: o comando foi colado com uma linha em branco
no fim, esse Enter ficou no buffer do console, e a primeira `Read-Host` do script o consumiu.

Três defeitos num acidente só, e os três consertados:

1. **A pergunta perdia a única chance que tinha.** Agora `Perguntar` valida e repete (4
   tentativas), e quando a resposta chega vazia ela diz de onde veio o Enter fantasma. Antes
   dela, `$Host.UI.RawUI.FlushInputBuffer()`: o que estava no buffer antes da pergunta existir
   não responde a pergunta. O mesmo em `instalar-na-vm.ps1` e em `senha.ps1` — neste último
   vazio significa **desligar a trava de acesso**, então vazio agora pede a palavra `DESLIGAR`.
2. **A chave secreta era ecoada na tela** pelo `Read-Host` comum, e de lá foi para o print.
   Agora entra por `-AsSecureString` (`-MaskInput` só existe no PowerShell 7; a VM é 5.1), e a
   tela confirma só `recebido: N caracteres, terminando em ...XXXX` — o bastante para conferir
   com o Dev Dashboard, inútil para quem só vê a imagem. Colagem cortada deixava de ser erro
   e virava "ID token recusado (assinatura)" dias depois.
3. **Girar um secret exigia redigitar 32 caracteres** que o `.env` já sabe de cor. Os apps
   configurados aparecem numerados; escolher o número pede só a chave nova.

34 checagens em PowerShell de verdade, com as funções e **os validadores tirados do próprio
script pela AST** (não copiados para o teste): `Read-Host` e `Write-Host` falsos dirigem a
pergunta, inclusive devolvendo `SecureString` quando ela é feita escondida. Mais as 10 da
troca de secret e a análise sintática dos 6 scripts da VM.

### Parar de conferir no olho: perguntar à Shopify

Três rodadas atrás do `ID token recusado (assinatura)` da Colômbia, e cada uma terminava no
mesmo lugar: "compare o fim da chave com o Dev Dashboard". Comparar depende de achar o app
certo no meio de dois apps com o **mesmo nome** (`DVHub Application` nas duas organizações),
e o erro só aparece quando a loja tenta abrir o app — tarde, e sem dizer de onde veio a chave.

`deploy/windows/testar-chave.ps1` troca a conferência por uma pergunta: manda o par
`client_id` + `client_secret` guardado no `.env` para `POST /admin/oauth/access_token` com
`grant_type=client_credentials` e mostra o que a Shopify responde, app por app. Distingue as
três respostas que importam — `CERTA` (200), `ERRADA` (`invalid_client`: a chave não é desse
Client ID) e `OUTRA LOJA` (`invalid_request`: o par pode estar certo, a loja é que não é
desse app) — porque tratar a terceira como a segunda manda consertar o que não está quebrado.
O token do sucesso nunca é impresso.

O caminho até aqui, em ordem, com o que cada passo eliminou:

| medição | o que passou a ser fato |
|---|---|
| `aud` do token na tela de erro | a loja abre o app **certo** (`accd22b7…`) — não é app trocado |
| fim das chaves no `diagnosticar` | app 1 termina em `b363`, app 2 em `1009` — a chave vazada não é a da Hungria |
| `readShopifyApps` recusa id repetido | não há dois slots com o mesmo Client ID |
| aviso de variável do Windows | `loadEnvFile` não sobrepõe o ambiente, e ninguém deixou variável para trás |

13 checagens novas (as funções e a interpretação das respostas tiradas do script pela AST).

**E o teste falhou no primeiro uso — do jeito certo.** A loja da Colômbia respondeu `HTTP 400
invalid_request` para o app dela, e eu tinha escrito que isso significava "app de outra
organização". Não significa: um app de **distribuição custom com instalação gerenciada não
aceita `client_credentials`**, então a Shopify recusa o *tipo* do pedido antes de olhar a
chave. O teste não serve para este caso — e dizer "chave errada" ali mandaria consertar o que
talvez não esteja quebrado. A resposta agora sai como `INCONCLUSIVO`, dizendo que quem decide
é a tela do app; `app_not_installed` (o que o app da Hungria devolve) ganhou nome próprio.

O que passou a medir o que importa: **o app registra, no log da VM, o fim da chave que usou na
hora da recusa** (`secretFingerprint`, quatro caracteres, nunca a chave, e no log — a tela de
recusa é pública). "Eu já troquei a chave" e "aqui ainda está a antiga" são indistinguíveis de
fora, e o arquivo no disco não é prova: o processo leu o `.env` quando subiu.

### A Colômbia entrou — e o "Publicar em" passou a saber onde você está

A loja da Colômbia instalou, apareceu em "Publicar em" junto da Hungria e o servidor passou a
atender **dois apps da Shopify ao mesmo tempo**, que era o objetivo desde o começo. O que a
tela mostrou em seguida foi o problema: com a Colômbia marcada e só ela, a tela pedia
"Confirmo publicar em produção" — uma confirmação que aparecia porque **alguma** loja da lista
era de produção, sem dizer qual, e sem relação com o que estava marcado.

Duas coisas, uma delas um defeito de verdade:

1. **A loja que entrou pela trava nascia marcada como "não produção".** `unlockStore` cria a
   linha ANTES da instalação (o portão barra justamente a requisição que a criaria), e a linha
   nasce com o padrão da coluna: `isProduction = false`. O `installStore` que vem depois cai no
   ramo `update`, que não escrevia esse campo — e o ramo `create`, que escrevia, só valia para
   a primeira loja, registrada antes da trava existir. Resultado: toda loja nova entrava sem a
   marca, sem pastilha e sem o cuidado que a marca compra. Consertado no `update` **e** com um
   reparo na abertura, porque uma loja já instalada nunca mais passa pelo upsert.
2. **A confirmação de produção passou a ser sobre a OUTRA loja.** Publicar na loja cujo admin
   você abriu é o ato normal, é o que o botão diz que faz, e o "Despublicar" desfaz —
   confirmar isso toda vez ensina a única lição que uma confirmação não pode ensinar: marcar
   sem ler. Agora a caixa só existe quando há loja de produção marcada **que não é esta**, e
   ela **nomeia** a loja: "Confirmo publicar também em Colombia — não é a loja onde estou".
   A lista ganhou a pastilha `esta loja`, e a loja onde você está já vem marcada.

A tela agora também sabe em que loja está pelo **token verificado** (`loader` devolve `shop`),
e não pela query string, que um bounce pode não carregar.

Verificado **dirigindo o editor no navegador** com duas lojas (Playwright, 14 checagens): a
loja atual vem marcada e com a pastilha; sem confirmação nenhuma quando o destino é só ela;
marcar a outra faz a caixa aparecer nomeando-a; desmarcar faz sumir; e tudo espelhado ao abrir
pela outra loja. Achado de quebra: o React Router roda os loaders **em paralelo**, então o
reparo da marca (no `/app`) e a leitura das lojas (na tela) correm juntos — a pastilha aparece
na carga seguinte, uma vez.

### Dois portões que concordavam por acidente

Com a marca de produção consertada, publicar parou de funcionar — e a recusa era
`Este deploy inclui loja(s) de produção (49e257-b3). Passe allowProduction: true para
confirmar.`, uma frase escrita para quem chama a biblioteca por script, na cara do lojista.

O `deployPage` tem um portão **próprio**, e ele conta TODA loja de produção do deploy,
inclusive aquela cujo admin você está usando. Enquanto a loja nova estava (por defeito)
marcada como "não produção", os dois portões concordavam por acidente: nenhum dos dois
disparava. Consertar a marca acordou o de baixo. O conserto do de cima não estava errado —
estava sozinho.

A política agora mora num lugar só: a tela decide (confirmação apenas para loja de produção
que não é esta) e, passada a decisão, diz à biblioteca que o deploy está autorizado. Lá
embaixo o portão continua de pé para os outros chamadores.

Provado com o botão **Publicar** de verdade, nos dois sentidos: publicar só na loja onde
estou não esbarra mais na trava, e marcar a outra loja sem confirmar continua sendo recusado
— nomeando ela. Portão testado só no sentido que passa não é portão testado. 17 checagens no
navegador.

### A segunda loja no ar, e o caminho escrito para a terceira

A Colômbia publica. O servidor atende **dois apps da Shopify**, as duas lojas aparecem em
"Publicar em", e a publicação funciona de dentro de cada uma.

O caminho inteiro foi percorrido às cegas, então ele virou checklist em `docs/INSTALACAO.md`
§5 — com as três armadilhas que custaram a tarde:

- **os apps têm o mesmo `name`** nas duas organizações, então no painel só o **Client ID**
  identifica; copiar a chave do app parecido é o erro mais fácil e o mais caro;
- **girar a chave cria uma segunda chave válida**: enquanto as duas existirem, a Shopify pode
  assinar com a que você não guardou — foi exatamente isto, e o conserto foi **revogar a
  antiga**, não colar de novo;
- **lançar a versão do app** é o que concede os escopos; sem isso a loja instala e não publica.

E `shopify.app.snevy.toml` já está no repositório para a terceira loja: a configuração de um
app novo sai de um arquivo, não de cliques — duas configurações que deveriam ser iguais e são
mantidas à mão divergem.

### "Cara, acho que você está cometendo os mesmos erros"

A terceira loja (Snevy) subiu e deu o mesmo `ID token recusado (assinatura)`. O Miguel estava
certo: eu o tinha colocado num laço — cola a chave, reinicia, abre o admin, lê o 401, repete.
Cada volta custava minutos e não produzia informação nova.

O defeito do processo: **a chave só era julgada depois de instalada**. Copiar a chave do app
errado é um clique (três apps, três organizações, todos chamados `DVHub Application`), e o
único juiz era o admin da loja.

A prova sempre esteve à mão e nunca tinha sido usada: **o token que a Shopify assinou e o app
acabou de recusar**. Agora o servidor guarda o último token recusado por app (memória, 30 min,
nunca em disco) e `/api/chave` responde se uma chave — a guardada (`GET`) ou uma candidata
(`POST`) — produz aquela assinatura. O `adicionar-app.ps1` pergunta **antes de gravar**: chave
errada não chega ao `.env` nem custa um reinício.

Três decisões que valem mais que o mecanismo:

- **O veredito tem três respostas**, não duas: `certa`, `errada` e `não tenho token para
  testar`. A terceira não é a segunda — confundi-las manda procurar no lugar errado, que é o
  defeito que isto existe para acabar.
- **A rota não passa pelo `requireShop`** — de propósito, e é o ponto: chamam-na *porque* a
  verificação de token está falhando. O portão é a senha de acesso (comparação de tempo
  constante), e **sem senha configurada a rota se recusa a responder** em vez de responder a
  qualquer um.
- **Nada de segredo na resposta**: só os Client IDs (públicos), os 4 últimos caracteres de
  cada chave e um booleano. O token nunca sai do processo.

O `testar-chave.ps1` foi reescrito: a versão anterior perguntava à Shopify por
`client_credentials` e não servia — app de instalação gerenciada não aceita esse tipo de
pedido, e a resposta era recusada antes de a chave ser olhada.

10 testes novos da memória de recusas (inclusive TTL, limite e um app não responder pelo token
de outro) e 15 provas dirigindo o servidor construído no cenário exato da Snevy: chave errada
guardada, token bom chegando, 401, veredito `ERRADA`, candidata certa reconhecida antes de ser
gravada, e o portão recusando `GET` e `POST` sem senha.

### A revisão adversarial derrubou metade do que eu tinha acabado de escrever

Rodei 25 agentes sobre a conferência de chave, em cinco lentes independentes, com cada achado
passando por um verificador instruído a **refutá-lo**. Sobreviveram 13 de 20 — e os dois piores
eram meus, de uma hora antes:

**1. A rota estava na internet, sem freio.** O Caddy faz `reverse_proxy` do domínio inteiro, sem
matcher de caminho: `GET https://dominio/api/chave?senha=…` respondia para o mundo. Sem contagem
de tentativas — enquanto o `/liberar`, que é o **outro portão da mesma senha**, exige ID token da
Shopify *e* conta 5 tentativas antes de 5 minutos de espera. Eu tinha tirado as duas travas de
uma vez, numa senha digitada à mão. Conserto: de fora a rota **não existe** (404 antes de a senha
ser olhada — um servidor com senha e um sem não podem ser distinguíveis dali), porque o Caddy
carimba `X-Forwarded-For` em tudo que passa por ele e os dois scripts chamam direto o
`127.0.0.1`; mais o mesmo `AttemptLimiter` do `/liberar`, para o dia em que não houver proxy.

**2. Qualquer um escolhia o token contra o qual a chave era julgada.** A escrita acontece no
caminho de recusa do `requireShop`, que é aberto, e eu indexava pelo `aud` que o **token
declara**. Com um slot por app e o mais novo vencendo, um estranho mandava um JWT com `aud` de um
app real e assinatura de lixo e a chave **certa** passava a ler `ERRADA` — a ferramenta feita
para acabar com a caça ao erro virava a que começava uma. E com 8 `aud` inventados dava para
esvaziar a memória inteira. Conserto em três partes: o índice é o app que o **servidor** resolveu
(nunca a palavra do token), o que limita a memória ao número de apps reais; um anel por app em
vez de um slot; e o veredito passa a ser *"esta chave assina **algum** dos tokens lembrados"* —
**positivo inforjável**, porque produzir um token que a chave certa assina exige a chave certa.
Ruído entra ao lado da prova boa e nunca mais por cima dela.

Mais três, menores e reais: a senha viajava na **query**, e o filtro do log do Caddy apaga
`id_token`/`session`/`hmac` mas não `senha` (agora vai no corpo, e o filtro ganhou a linha);
o `ConferirChave` falhava **aberto e calado**, então uma conferência que não aconteceu parecia uma
que passou (agora sempre diz o motivo); e o `testar-chave` engolia as mensagens que a própria rota
sabia dar, porque o PowerShell 5.1 lança em qualquer não-2xx e o corpo só sai do `catch`.

E uma que eu mesmo tinha plantado antes: a tela pública de recusa **enumerava todos os Client IDs**
da instalação. Agora diz quantos, não quais.

33 testes do módulo (incluindo os dois ataques) e 20 provas dirigindo o servidor construído: token
forjado não vira `ERRADA`, `aud` inventado não expulsa nada, de fora dá 404 mesmo com a senha
certa, e o freio entra e segura até a senha certa.

### 37 caracteres

A conferência de chave respondeu na primeira vez que foi usada, e a resposta tinha o defeito
escrito nela:

```
== dbcdc8e59f6506e9f9385bfbf801322a
   chave guardada: 37 caracteres, terminando em ...b632
   ERRADA - esta chave NAO assina o token que a Shopify mandou (nenhum dos 3 tokens lembrados).
```

As outras duas linhas do mesmo relatório diziam **38**. Uma chave da Shopify é `shpss_` + 32
caracteres = 38. A da terceira loja tinha 37: a colagem perdeu um caractere, e nada no caminho
disse nada — o `.env` aceita qualquer texto, o app sobe, e quem descobre é a loja, dias depois,
com `ID token recusado (assinatura)`.

Contar caracteres é a checagem mais barata que existe e pega justamente o erro que nenhuma
leitura no olho pega. O `adicionar-app.ps1` agora recusa na hora da colagem uma chave que
comece com `shpss_` e não tenha 38 caracteres, dizendo o número. Chave sem esse prefixo (as
antigas) continua sendo medida só por "não está vazia", porque o tamanho fixo é uma promessa do
formato novo, não uma regra nossa.

Vale registrar o que isso diz sobre a ferramenta: ela foi usada uma vez e já pagou a tarde
inteira que a antecedeu — e a informação que resolveu não foi o veredito `ERRADA`, foi o
**número ao lado dele**, que estava lá só porque a resposta traz o tamanho junto do fim da
chave.

### Dar nome às lojas — e por que o nome não basta

Com as três lojas no ar, o "Publicar em" listava `Magyarország`, `49e257-b3` e `01xmv2-7m`. Os
dois últimos são o próprio domínio: o nome que a Shopify devolve na instalação é um palpite, e
quando a consulta da loja falha ele vira o domínio. Ninguém publica com confiança numa caixa
chamada `01xmv2-7m`.

O pedido era só trocar os três nomes. O que foi feito foi diferente, de propósito: **uma seção
"Lojas" na tela de páginas, com o nome editável**. Fixar nome no código seria repetir em
miniatura o erro que custou a tarde anterior — três apps chamados `DVHub Application` em
organizações diferentes, indistinguíveis pelo nome.

E aqui o nome **não pode** distinguir: as duas lojas da Colômbia se chamam "Côlombia" as duas.
Então a regra não tenta impedir repetição — ela garante que o desempate esteja sempre na tela:
o domínio aparece embaixo do nome na seção "Lojas", ao lado do nome em cada linha do "Publicar
em", e dentro da frase de confirmação de produção ("Confirmo publicar também em Côlombia
(49e257-b3.myshopify.com)"). Nome vazio volta a ser o domínio, porque loja sem nome nenhum é
uma caixa de seleção sem alvo.

`storeLabelFrom` (em `app/app/lib/shared.ts`, com teste próprio) é a regra inteira: apara as
pontas, junta espaços repetidos, corta em 60 e cai no domínio quando sobra nada.

**O que o teste unitário não pegou e o navegador pegou.** A caixa de texto é não-controlada
(`defaultValue`), e o React não reescreve o DOM de uma dessas quando os dados do loader mudam.
Resultado: digitar `  Côlombia  ` e salvar gravava `Côlombia` no banco e deixava `  Côlombia  `
na tela; apagar o nome gravava `01xmv2-7m` e deixava **o campo vazio**. A tela mentindo sobre o
que acabou de gravar — exatamente o defeito que nenhum teste de função pura enxerga. Conserto:
`key={`${store.id}:${store.label}`}`, que remonta o campo quando o rótulo salvo muda.

Verificado dirigindo as duas telas com as três lojas de verdade (16 checagens, todas passando),
incluindo o caso dos dois nomes iguais e o de salvar sem mudar nada, que responde "os nomes já
estavam assim" em vez de fingir uma gravação.

### "O banco está se juntando" — a lista separada por loja

A queixa era exata: abrindo o app pela Hungria, a lista mostrava as páginas da Colômbia, e
vice-versa. Em `app._index.tsx` o loader chamava `requireShop` (que diz de qual loja você veio)
e em seguida `db.page.findMany()` sem filtro nenhum. E era de propósito — está escrito no
schema: *"a page deliberately does not belong to a store"*, a decisão que permite publicar a
mesma página em várias lojas. O efeito colateral é uma lista só, com tudo.

Decisão (do Miguel, com as duas opções na mesa): **a página continua podendo ser publicada em
várias lojas, mas a lista vem filtrada.** A alternativa — cada página presa a uma loja — daria
uma lista limpa ao custo de perder a publicação nas duas Colômbias de uma vez.

O que mudou:

- `Page.ownerStoreId` — a loja de cujo admin a página foi criada. **Regra de arquivamento,
  não de propriedade**: decide em qual lista a página aparece primeiro, e só. Criar, duplicar
  e importar arquivam na loja de onde o gesto veio (a cópia é arquivada onde foi FEITA, não
  onde o original mora — a variante húngara de uma página colombiana é húngara).
- A lista, por padrão, mostra o que é **desta loja**: criada aqui, ou publicada aqui. A aba
  "Todas as lojas" traz o resto, com a contagem escrita nela, e cada página de fora leva a
  pastilha da loja dona. Loja sem página nenhuma diz quantas há nas outras e abre a aba num
  clique — vazio que aponta o caminho, não vazio que esconde.
- Produtos vinculados contados **por loja**: uma página de produto com 2 produtos na
  Colômbia e 1 na Snevy mostrava "3" nas duas; agora mostra "2 nesta loja" / "1 nesta loja".
- **Página de antes da coluna e nunca publicada fica com dona nula e aparece em toda lista.**
  Perder uma página escrita antes disto existir seria pior do que mostrá-la demais.
- A migration faz o backfill: a dona é a loja da **primeira** publicação. `ON DELETE SET NULL`
  — apagar uma loja não pode levar as páginas escritas a partir dela.

Verificado em três lugares, porque cada um julga uma coisa diferente:

1. **Postgres 16 de verdade** (o SQLite não julga `UPDATE "Page" p SET` nem a FK): migrations
   antigas + dados de antes + a nova → `p-co → co` (publicada primeiro na Colômbia, depois na
   Hungria: ganhou a Colômbia), `p-hu → hu`, `p-nunca → NULL`; `DELETE` da loja → `p-co|NULL`,
   página viva. E `prisma migrate deploy` do zero, pelo `db-sync.mjs`, aplicou as 3.
   Primeira tentativa falhou com *"the URL must start with file:"*: o `schema.prisma` no disco
   estava gerado para SQLite — a armadilha do CLAUDE.md, repaga uma vez e anotada.
2. **Navegador** (15 checagens, 3 lojas, uma página publicada em duas, uma velha sem dona):
   Hungria não vê a Colômbia; "Todas" mostra 5 e marca as 3 de fora; a dupla aparece na Snevy
   por estar publicada lá sem ser dela; criar na Snevy aparece na Snevy e não na Hungria.
   Uma "falha" era conta minha errada (esperei 4, a lista mostrou os 3 certos).
3. **Print**: pastilha `Côlombia` `Côlombia` na coluna "Lojas" — duas iguais, sem dizer qual
   é qual. Domínio no tooltip das pastilhas, o mesmo desempate do resto da tela.

### O D&VFly está pesando na página do cliente? Medido: não

Relatório do PageSpeed da `snevy.co/products/mini-plancha` (celular): desempenho **96**, FCP
3,7 s, CLS 0, e `LCP: Error! NO_LCP`. A pergunta era se o app, por atender várias lojas,
pesava na página. Medição na página publicada de verdade:

| | |
|---|---|
| JavaScript nosso | **0 bytes** — nenhum script do D&VFly |
| Chamadas ao nosso servidor | **0** — nenhuma menção a dvfly/vercel/túnel no HTML |
| CSS nosso | 23,6 KB crus → **4,9 KB gzip** (HTML inteiro: 35,8 KB gzip) |
| DOM | 543 nós, 439 nossos — 543 é pouco; o Lighthouse reclama de verdade acima de ~800 |

A página publicada é HTML+CSS estático morando na Shopify e não conhece o servidor (invariante
I1/I4): 3 lojas ou 300, ela não muda um byte. O JavaScript ali é da Shopify, do tema e do app
EasySell COD (4 arquivos).

O que **está** pesando, e dois são nossos:

- **8 das 10 imagens apontam para `via.placeholder.com`, que está fora do ar** — não é o
  ambiente: `example.com` e `placehold.co` respondem 200 pelo mesmo proxy, e esse host não
  completa nem o TLS. São as imagens de exemplo do bloco que nunca foram trocadas. Oito
  pedidos que o celular tenta e só desiste no tempo limite — o tipo de lentidão que o
  Lighthouse não pontua (pedido que falha não pesa).
- **A imagem principal tem 250 KB na resolução cheia**, sem `?width=` (a Shopify redimensiona
  de graça) e sem `width`/`height` — as 10 estão sem. É o "Melhorar a entrega de imagens —
  122 KiB" do relatório, e é **conserto nosso, no compilador**. Próxima entrega.

**`NO_LCP` fica em aberto.** Achei que fossem as imagens mortas e testei: cópia local servida
com elas mortas e com elas respondendo — o LCP apareceu nos dois casos (em texto). A hipótese
estava errada e não vou substituí-la por outro palpite.

### Imagens: a primeira carrega antes de tudo, e o CDN entrega no tamanho da tela

O dado de campo (28 dias, Chrome de visitantes reais, não laboratório) da Mini Plancha:
**LCP 3,1 s, INP 277 ms — Core Web Vitals reprovadas**. É o que o Google usa no ranking. O
elemento do LCP era a nossa imagem principal: 250 KB na resolução cheia, sem `srcset`, sem
prioridade, sem `preload`, sem `width`/`height` — e os dois únicos `<link rel="preload">` da
página eram do app EasySell, para um SVG de desconto e um *spinner*. A Shopify escreve as
regras na própria documentação de desempenho de temas: nunca `lazy` na imagem do LCP,
`fetchpriority="high"` nela, `srcset`/`sizes` pelo redimensionador do CDN (`?width=`, que
nunca amplia), dimensões declaradas. Nenhuma dessas é tarefa do autor da página — são do
compilador. O PageFly expõe o conceito equivalente (tamanho por breakpoint, proporção fixa,
compressão) como opções do elemento de imagem; aqui é automático.

`packages/compiler/src/images.ts` (puro, com 17 testes próprios):

- **"Primeira imagem" é fato da página, não do bloco.** O `optimizeHtml` rodava por bloco e
  coroava a primeira imagem de CADA bloco de HTML como herói. Agora o `compile` conta as
  imagens em ordem de renderização, através de blocos de imagem e de HTML colado, e só a
  primeira da página ganha: sem `lazy`, `fetchpriority="high"`, e um
  `<link rel="preload" as="image" imagesrcset imagesizes>` no topo do fragmento (válido no
  corpo; o fragmento nunca tem `<head>`, mora numa seção do tema). Todas as outras: `lazy`.
  Nó oculto não conta. O bloco de imagem antes era `lazy` por padrão mesmo sendo o único
  da página — o teste que fixava isso foi reescrito com o motivo.
- **URL no CDN da Shopify** (as duas formas: `cdn.shopify.com/s/files/…` e
  `loja.com/cdn/shop/…`) sai com `?width=1080` no `src` e `srcset` de 360 a 2048, `sizes`
  `100vw`; com largura declarada, os candidatos param em 2× (retina) e o `sizes` diz o
  limite. URL que o autor já dimensionou (`width=`, `height=`, `crop=`) ou `srcset` próprio:
  intocados. Host que não é o CDN: nada a fazer, nada é feito.
- **Serviço de imagem de exemplo** (`via.placeholder.com` e mais nove) vira aviso de erro no
  editor, com o campo a corrigir. No ar, 8 das 10 imagens da Mini Plancha apontavam para um
  host morto.

No editor (`app.pages.$id.tsx`), dois componentes novos:

- `ImageFields`: ao colar a URL, o navegador carrega a imagem e escreve o tamanho real em
  largura/altura **se estiverem vazias** — tamanho digitado é do autor. Caixa "Carregar
  primeiro" (`eager`) para imagem acima da dobra que não é a primeira, com a explicação de
  que a primeira já carrega primeiro sozinha.
- `HtmlFields`: botão **"Medir imagens"** que diz antes do clique quantas tags estão sem
  tamanho, carrega cada uma e escreve `width`/`height` **na própria tag, por substituição de
  texto** — não por `DOMParser`, que moveria um `<style>` inicial para um `<head>` que o
  fragmento não tem. Só atributos entram; o que o autor colou continua igual.
- Barra de status: "N imagens, M no CDN da Shopify com tamanho por tela · a primeira carrega
  antes de tudo" — contado da página compilada.

**Prova real**: o HTML colado da própria Mini Plancha (extraído do que está no ar) pelo
compilador novo — preload do herói em `width=1080` com 9 candidatos, `fetchpriority="high"`
nele, 9 imagens lazy, as 2 do CDN responsivas, 8 avisos de placeholder. É o que vai ao ar na
próxima publicação dessa página. E 11 checagens no editor de verdade (Playwright): mede ao
colar, não sobrescreve tamanho digitado, o aviso aparece, "Medir imagens" mede 1 e conta as 2
que não carregam, o canvas mostra o preload.

**O que falhou primeiro**: o roteiro caiu com "não consegui carregar essa imagem" e a suspeita
foi CSP. Era o PNG de teste, escrito à mão em base64 e corrompido — o Chrome nunca terminava
de carregá-lo. Um PNG gerado por screenshot resolveu. Anotado para não culpar o CSP de novo.

**O que isto não resolve**: o INP de 277 ms é JavaScript, e JavaScript nosso na página é
zero — é do tema e do EasySell. E as 8 imagens de exemplo continuam lá até alguém trocar no
editor: o aviso agora grita, mas não troca sozinho.

### A LP da Mini Plancha, lida inteira — e três erros meus corrigidos

O Miguel colou o HTML completo da landing. Ler o código-fonte (e não só o que estava no ar)
respondeu o "redimensionando forte" e desmentiu três coisas que eu tinha dito:

1. **"JavaScript nosso é zero."** Do compilador, sim. Mas a LP traz um `<script>` próprio com
   `setInterval(fixEasySellColors, 300)` — a cada 300 ms, para sempre, `querySelectorAll` em
   todo botão da página + `getComputedStyle` em cada um — e um `MutationObserver` com
   `attributes: true, attributeFilter: ['style']` que dispara **nas próprias alterações de
   `style` que ele faz**: laço de reflow. É o "Reflow forçado", os 2,2 s de thread principal e
   boa parte do INP de 277 ms. Não é do tema nem do EasySell: está no HTML colado.
2. **"O `NO_LCP` fica em aberto."** Todo elemento do herói tinha `.reveal`, e
   `#mpp-lp.js .reveal { opacity: 0 }` até o script (no FIM do HTML) adicionar `.in`. No A/B
   local, o `h1` do original está com opacity **0,14** no evento `load` — ainda aparecendo. O
   Chrome não conta como LCP o que pinta com opacity 0. Hipótese forte; não é prova de campo.
3. **"O redimensionar são as imagens sem tamanho."** Era outra coisa: `.photo { height: 42dvh }`.
   `dvh` é a altura *dinâmica* — muda quando a barra do navegador do celular some ao rolar, e
   a foto do herói mudava de tamanho junto. No A/B: 328 px → 361 px ao "esconder a barra".

E um dado novo: o arquivo `clean-2_galeria….webp` é um **JPEG de 2027×2027** com nome `.webp`
(`file` não mente). Com `&width=720` o CDN devolve 67 KB em vez de 250 KB (−73%). O `srcset`
do compilador já pede exatamente isso.

**A LP editada** (`mini-plancha-lp.html`, entregue para colar no editor), cirúrgica:

- Fontes por `<link rel="preconnect">` ×2 + `<link rel="stylesheet">`, no lugar do `@import`
  (que só é descoberto depois de baixar e ler o CSS). Itálico 700 saiu: nenhum estilo usa.
- Herói sem `.reveal` — a primeira tela pinta sem esperar script. O resto da página continua
  animando.
- Foto do herói dimensionada pela **largura** da tela (`min(100%, 80vw, 480px)`), que não muda
  ao rolar. Primeiro tentei `42svh`; o Playwright não tem barra de URL, então `svh` e `dvh` se
  comportam igual na simulação e a medida saiu inconclusiva. Troquei por algo **mensurável**:
  330 px com e sem barra.
- `width`/`height` nas 10 imagens (2027×2027 medidos no arquivo) e `sizes` no herói e na oferta.
- As 8 imagens de `via.placeholder.com` viraram SVG inline (`data:`), marcadas
  `data-mpp-placeholder` e comentadas "trocar pela foto real": zero pedidos a host morto, e a
  página deixa de esperar por nada. **Continuam sendo placeholders** — só não travam mais.
- `href="javascript:void(0)"` → `href="#mpp-offer"` nos 3 CTAs (o "links não rastreáveis" do
  SEO; sem script, o link leva à oferta).
- JS do EasySell: sem `setInterval`, observer só em `childList`, uma execução por frame no
  máximo, escopo restrito ao popup, botão já pintado é pulado. A cor continua vindo da
  variável, lida no `#mpp-lp` (o `:root` vira `.dvf-page` no escopo, e o `#mpp-lp` herda).
- A descrição do look "Liso Sedoso" estava em português numa página em espanhol; traduzida.

**A/B no Chromium celular, mesma página, tudo externo abortado** (original × editada):
`h1` no load 0,14 × **1**; foto do herói ao crescer a janela 80 px: muda 33 px × **estável**;
pedidos a host morto 1 × **0**; tarefas longas em 4 s parado 52 ms × **0 ms**; LCP registrado
nos dois. Pelo compilador: preload do herói com `imagesizes` do autor, 9 lazy, 10/10 com
tamanho, **0 avisos** além do `contains-script`.

**O que ainda não está provado**: tudo acima é laboratório local; o campo (28 dias) só muda
depois de publicar e esperar. E as 8 fotos reais continuam faltando.

### Depois de publicar: 57 no celular, LCP 10,5 s — e o que isso diz

O Miguel publicou a LP editada e rodou o PageSpeed: celular **57**, FCP 5,4 s, **LCP 10,5 s**,
TBT 170 ms, CLS 0. Antes: 96 com `NO_LCP`. Leitura honesta: o 96 era calculado **sem** LCP,
porque o herói estava invisível para a medição; agora o herói pinta de cara, o Lighthouse mede,
e o número que aparece é o problema que existia o tempo todo. Não é consolo — é o diagnóstico
que faltava. O FCP piorar (3,8 → 5,4 s) é o que precisa de explicação.

O que foi possível medir daqui (a API do PageSpeed estourou a cota do dia e o Chromium do
sandbox não abre a snevy.co):

- No ar está a LP nova (8 `data-mpp-placeholder`, 0 `via.placeholder`, herói com `srcset` +
  `fetchpriority` + `preload`, 9 lazy, 10/10 com tamanho). O compilador novo foi aplicado.
- **Todo CSS do tema e do EasySell carrega com `media` (não bloqueia) e todo JS é `defer`.**
  O único recurso que bloqueia a renderização da página é o `<link rel="stylesheet">` das
  fontes do Google que a LP editada colocou no `body` — em Chrome, isso segura tudo que vem
  depois dele até o Google responder. Em 4G lento, 1–2 s de tela em branco. O `@import`
  antigo também bloqueava, mas de onde estava; a troca não piorou, só não ajudou.
- O herói que o celular escolhe é o candidato de 900 px = **95 KB** (era 250 KB). Ok.
- A duplicação que suspeitei (3 preloads, um `42dvh` sobrando) não existia: dois preloads são
  do EasySell, e o `42dvh` estava num **comentário meu** dentro do `<style>`.

**Correção na LP** (`docs/lps/mini-plancha-lp.html`, `47d172b`): fontes com
`media="print" onload="this.media='all'"` + `<noscript>` (o mesmo truque do Dawn) e
`display=optional` — se a fonte não chega em ~100 ms, esta visita usa Georgia/system-ui e a
próxima usa a fonte; **nunca** a troca tardia que re-renderiza o título e joga o LCP para 10 s.
Custo: a primeira visita em rede lenta vê a fonte reserva. Comentários de CSS saíram do
`<style>`.

**Defeito do compilador achado pela LP**: `scopeCss` não pulava comentários — um comentário
antes de um seletor era lido como parte da lista de seletores, quebrado nas vírgulas e
prefixado com `.dvf-page`; um `{` dentro dele desalinharia o contador de blocos para o resto
da folha. Agora os comentários caem antes do escopo (a única reescrita que não muda nada do
que o visitante vê), com teste.

**O que não sei e não vou chutar**: qual é o elemento do LCP de 10,5 s e em que fase o tempo
vai (TTFB / atraso de carregamento / carregamento / atraso de renderização). O relatório do
PageSpeed mostra isso em "Largest Contentful Paint element". Pedido ao Miguel.

### Modo leve: a LP sozinha, sem o layout do tema (22/09)

O Miguel cortou a discussão certa: "o problema não é o HTML da LP, é a configuração aonde leva
a LP — o sistema nosso". Tinha razão no que dá para medir daqui: a página de produto "sem
cabeçalho e rodapé" continua no layout do tema (`theme.dvfly-product` = o `theme.liquid` da
loja menos header/footer), e esse layout carrega em toda página **9 pedidos e ~21 KB gzip** de
CSS/JS do tema (global.js, base.css, animations, search-form, details-*, pubsub, cart-items)
mais ~10 KB de CSS inline — para uma LP que não usa nada disso. Isso era escolha nossa, não
do tema: as seções de produto do tema precisam desse layout, mas a LP não tem seção do tema.

**Feito**: `Page.bareLayout` ("Modo leve — só a página, sem o tema", Configurações da página,
só no tipo produto). Publicar grava o template como `{ layout: "theme.dvfly", sections:
{ dvfly }, order: ["dvfly"] }` e garante o `layout/theme.dvfly.liquid` mínimo no tema (o
mesmo das páginas normais sem cabeçalho). O `content_for_header` fica, então pixels e apps
embutidos (o formulário COD) continuam. Detalhe em `docs/MODELOS_DE_TEMA.md`.

- Ligado, "Posição do conteúdo" e "Mostrar cabeçalho e rodapé" ficam cinza com o motivo
  escrito (não somem); o canvas tira os espaços do tema porque nada do tema vai ser
  publicado. Desligar recompõe do `product.json` do tema.
- Exportar/importar e duplicar levam a configuração. Migração
  `20260922100000_pagina_leve`, aplicada num Postgres 16 real (4/4 migrações num banco novo)
  e no SQLite.
- Verificado dirigindo o editor (Playwright, 15/15): liga → controles desabilitados com
  motivo → pedido de preview sem chrome nem seções → canvas sem `[data-dvf-chrome]` → salva →
  recarrega e continua ligado → exportação com `bareLayout: true` → cópia leve → desliga e
  os controles e o canvas voltam. Testes: compilador 74, Shopify 46 (+1: compose leve),
  app 38. Typecheck e build limpos.

**O que não está provado**: a publicação numa loja real com o modo ligado (não há loja
alcançável do sandbox). A composição do template é testada; o `themeFilesUpsert` do layout
mínimo é o mesmo caminho que as páginas normais sem cabeçalho já usam em produção. O próximo
PageSpeed na Mini Plancha com o modo leve ligado é a medida que decide.

**Limite honesto**: o `<head>` da Shopify continua (é dela, não nosso), e o EasySell entra por
app embed — os 53 KB de script inline que não são nossos continuam vindo por ali. O que sai é
tudo o que o tema carregava.

### Leve por padrão, em toda página — e o que mais o guia da Shopify e o web.dev mandam (22/09)

Pedido: "modo leve em todas as páginas já embutido; TODAS as páginas o mais leves possível, em
todo celular/aparelho/internet; leia documentos que ajudem". Lidos: o guia de desempenho de
temas da Shopify e os artigos do web.dev sobre LCP, INP e `content-visibility`. O que cada um
manda, o que já fazíamos e o que passou a ser feito está em `docs/DESEMPENHO.md` (novo).

**Feito** (`packages/compiler`, `packages/shopify`, `app`):

- **Padrão invertido**: `showChrome=false` e `bareLayout=true` no schema; migração
  `20260922130000_leve_por_padrao` muda os defaults e **vira as páginas existentes** (produto →
  leve; todas → sem cabeçalho/rodapé), como pedido. Criar, duplicar e importar seguem o
  padrão; um arquivo exportado que pede o tema é respeitado. O texto de cada opção diz
  "(padrão)" e quando ligar o contrário. Verificado em Postgres 16 real com linhas pré-existentes
  (`p1 regular true/false → false/false`, `p2 product true/false → false/true`).
- **`preconnect` ao `cdn.shopify.com`** no layout mínimo, antes do `content_for_header`, sem
  `crossorigin` (imagem não é CORS — um preconnect CORS abriria uma conexão que a imagem não usa).
- **Animação nunca esconde o que já está na tela**: o runtime `reveal` só põe o pré-estado em
  elemento fora da janela. Regra literal da Shopify ("don't hide the LCP image behind
  animations") — e a causa do `NO_LCP` de 21/09, agora impossível em página feita de blocos.
  Achado no caminho: o pré-estado tinha transição, e dentro de uma seção ainda não renderizada a
  transição ficava pendente — voltaria a rodar (um mergulho para transparente) bem na hora em
  que a seção entra na tela. Pré-estado sem transição; só a entrada anima. Medido quadro a
  quadro no Chromium: `0 0 0.01 0.03 … 0.99 1` (fade de verdade, sem mergulho).
- **`content-visibility:auto`** (`.dvf-below`) nas seções de topo depois do primeiro bloco,
  com `contain-intrinsic-size:auto 600px`. Bancada: relayout completo de 120 seções num
  viewport de celular, **115 ms → 2,6 ms**. O primeiro bloco nunca recebe (é a dobra, seja o
  que for — um bloco de HTML com uma LP inteira incluído).
- **Avisos novos no editor**, com o conserto dentro: `html/blocking-stylesheet` (`<link>` de
  folha sem `media` de adiamento, ou `@import` num `<style>`) e `html/blocking-script`
  (`<script src>` sem `defer`/`async`/`module`). O `<noscript>` do padrão não é acusado.
  Nunca reescreve: a ordem em que os scripts do autor rodam é contrato dele.

**Verificado**: compilador 76, Shopify 47, app 38; typecheck e build limpos; editor dirigido
(20/20: liga/desliga, salva, recarrega, exporta, duplica, página nova nasce leve, virar
produto nasce leve, importação antiga nasce leve e arquivo com tema é respeitado); runtime
no Chromium (7/7).

**O que não consegui provar**: que o Chrome de fato PULA a renderização das seções marcadas
(ele as renderiza de forma proativa quando fica ocioso — `checkVisibility` dizia "renderizada"
50 ms depois do load). A bancada mede o que importa (o custo do relayout) e o padrão é o
recomendado pelo web.dev; a prova final é o TBT/INP no PageSpeed de uma página longa de
blocos.

**A medição que chegou no meio (PageSpeed celular, 22/09 09:13 BRT)**: 68 · FCP 3,2 s · LCP
3,6 s · TBT 420 ms · CLS 0,135 · SI 3,2 s. Lido contra o HTML no ar (`curl`):

1. **A página no ar ainda está no layout do tema** (`base.css`, `global.js`, `animations.js`…
   presentes). O modo leve não foi publicado ainda — a versão nova do app precisa subir
   (`PUBLICAR-DVFLY`) e a página ser republicada.
2. **A LP no ar é a versão ANTERIOR ao conserto das fontes**: `display=swap`, `<link>` de
   folha sem `media="print"`, sem `<noscript>`. O repositório tem a corrigida (`47d172b`), mas
   ela não foi colada. Consequências que batem com os números: o `<link>` bloqueante é o FCP
   de 3,2 s; o `swap` é o **CLS 0,135 que não existia** (o título troca de fonte e reflui).
   O aviso novo `html/blocking-stylesheet` acusaria isto no editor.
3. O herói agora é uma foto real (webp do CDN, `srcset`, `preload`, `fetchpriority`) — a LCP
   caiu de 10,5 s para 3,6 s. Os outros 8 placeholders continuam.
4. TBT 420 ms: JS de terceiros (tema + EasySell) — o tema sai com o modo leve; o EasySell não.

### 95 no celular (22/09 09:28 BRT) — e o que sobrou do FCP

Modo leve publicado e LP corrigida colada: **95** · FCP 2,3 s · LCP 2,4 s · TBT 10 ms · CLS 0.
Acessibilidade 95, boas práticas 96, SEO 92. Ontem à noite era 57 com LCP 10,5 s.

O HTML no ar, medido por `curl`: 32 KB na rede (125 KB abertos). Nada do tema (`base.css`,
`global.js`: 0). O que vem ANTES do nosso conteúdo, e por isso segura o FCP:

| Trecho | Tamanho | De quem |
|---|---|---|
| `<head>` da Shopify (`content_for_header`) | 15,7 KB | Shopify |
| JS inline no `<head>` que roda antes de tudo (EasySell + Shopify) | 51,9 KB | EasySell (19,5 KB só do bloco dele) + Shopify |
| `accelerated-checkout-backwards-compat.css`, a única folha que bloqueia a renderização | 1,5 KB, 1 pedido | Shopify (injeta em todo modelo de produto) |
| Nossa seção (LP inteira, CSS incluído) | 26,8 KB | nós |

O FCP de 2,3 s em 4G lento com CPU 4× mais lenta é: TTFB emulado (~0,6 s) + baixar 32 KB +
executar 52 KB de JS inline antes de chegar no nosso conteúdo + um pedido bloqueante da
Shopify. A nossa parte já é a mínima possível para uma seção de tema. O que ainda move o FCP
está nas mãos de quem controla os apps embutidos.

**Insight "Reflow forçado" do PageSpeed**: era do script da LP — o laço dos `.reveal` lia
`getBoundingClientRect` e escrevia classe no mesmo elemento, alternado; e a pintura do popup
do EasySell lia `getComputedStyle` de um botão depois de pintar o anterior. Consertado nas
duas: ler tudo, depois escrever tudo (`docs/lps/mini-plancha-lp.html`). Precisa colar de novo.
**"Mais de quatro preconnect"**: no HTML há 3 (o nosso ao CDN e os 2 das fontes da LP) + 1
`dns-prefetch` da Shopify; os demais são inseridos por script de terceiros.

### Auditoria por agentes: o que no D&VFly ainda pesava (22/09)

Dois agentes leram o código inteiro em paralelo — um o caminho da página publicada, outro o
editor — com a ordem de apontar `arquivo:linha`, custo e conserto mínimo, e de dizer o que é
desprezível. O que passou no filtro e foi feito:

**Página publicada** (`packages/compiler`):
- **A imagem principal não é "a primeira", é a primeira grande.** A regra antiga coroava a
  primeira `<img>` do documento como LCP: um logotipo ou selo antes do herói ficava com
  `fetchpriority` e o herói de verdade ia de `loading="lazy"` — a falha de campo de 21/09 de
  novo, em silêncio. Agora: a primeira imagem com largura ≥ 300 px (ou sem largura declarada)
  que não seja `data:` é o herói; o que vem antes dela é acima da dobra (nunca lazy, sem
  prioridade); o que vem depois espera. Uma decisão para a página inteira, blocos e HTML
  colado juntos (`claimImage` passa do compilador para o otimizador de HTML).
- **SVG e GIF do CDN sem `srcset`**: o CDN não redimensiona nenhum dos dois; eram nove URLs
  do mesmo arquivo por imagem.
- **Barra de status avisa "pesada para celular"** acima de 100 KB brutos — o teto da Shopify
  (256 KB) não é o do visitante, e a barra só falava dele.
- Correção pequena: a regra `.dvf-tab-panel[hidden]` nunca casava (o painel tem
  `data-dvf-tab-panel`, não a classe).
- Verificado limpo, sem mudança: zero resíduo de editor na página no ar, preload e `<img>`
  com os mesmos candidatos (sem download duplo), `fetchpriority` em exatamente uma imagem,
  layout mínimo sem nada bloqueante. Fica anotado para quando o bloco for usado: o YouTube
  ainda carrega o embed inteiro ao rolar (fachada com poster é o próximo passo).

**Editor** (`app/`):
- **"Pré-visualizar" abria aba em branco e a página aparecia dentro do admin** (relato do
  Miguel, 09:47). Causa: `window.open('', '_blank', 'noopener')` devolve **null** por
  definição quando `noopener` está presente — a aba nunca recebia o endereço, e o fallback
  navegava o frame do próprio app. Conserto: abrir sem `noopener` e cortar o `opener` à mão;
  sem aba (bloqueador), dentro do admin tenta outra aba e **nunca** navega o frame do app.
- **Pré-visualização**: o pedido anterior é abortado quando vem uma tecla nova (antes só era
  ignorado: cada pausa subia o documento inteiro); HTML grande (> 30 KB) espera 600 ms em vez
  de 250; a primeira escrita do canvas espera o CSS do tema (até 1,5 s) para não construir a
  página duas vezes.
- **Salvar não recarrega o loader do editor** (`shouldRevalidate`): eram 3 consultas, uma
  compilação e o documento inteiro de novo a cada Ctrl+S. Publicar continua recarregando.
- **Lista sem os documentos** (`omit: { doc: true }`): 30 páginas × 60 KB era ~2 MB em
  cada abertura da lista. Consultas independentes em paralelo no loader do editor e da lista.
- **Polaris (100 KB gzip) só na tela de erro**, único lugar que o usa. Era carregado em toda
  página, competindo com o editor no celular.
- Não feito, anotado: o canvas ainda é reconstruído com `document.write` a cada pausa
  (tema + página + bridge); trocar por substituição do conteúdo exigiria reexecutar scripts
  do autor sem acumular listeners — mudança grande, para outra entrega. E **o editor não tem
  modo celular** (grade fixa de 52/300/1fr/340 px): num celular ele transborda; essa é a
  causa de "lentidão" ao editar no celular, e é UX, não bytes.

**Verificado**: compilador 79, Shopify 47, app 38; typecheck e build limpos; editor dirigido
(9/9: aba de pré-visualização com token e o app parado no lugar, Polaris ausente, salvar sem
recarregar o loader, 8 teclas num HTML grande = 1 pedido de preview, aviso de peso, lista
sem documentos) + o roteiro do modo leve (20/20) de novo.

**A medição de 64 (09:49)**: FCP 3,9 s · LCP 6,1 s · TBT 20 ms · CLS 0,135. O HTML no ar
comparado byte a byte com o de 09:28 (o 95): **a nossa parte é idêntica**; mudou um script
que a própria Shopify passou a injetar no início do `<head>` (`event_observer.bootstrap`) e o
id do pedido. A LP colada ainda é a de antes do conserto do reflow (`naTela` ausente). Três
quadros em branco no filmstrip = o servidor demorou nessa rodada (TTFB medido daqui em 5
pedidos seguidos: 0,16 s a 0,48 s — varia 3×). O laboratório do PageSpeed varia com o
momento; a regra passa a ser rodar 3 vezes e olhar a mediana, e o dado de campo (CrUX)
quando houver. O CLS 0,135 apareceu com `display=optional` no ar, então não é a fonte:
precisa do item "Causas da troca de layout" aberto para dizer qual elemento.

### "Mais agentes em cada coisinha" — o relatório de 88 lido por dentro (22/09, tarde)

PageSpeed celular: 88 · FCP 2,4 s · LCP 3,2 s · TBT 150 ms · CLS 0. Campo (28 dias, inclui
as versões velhas): LCP 3,2 s, INP 305 ms, CLS 0, TTFB 1,3 s. Três agentes, cada um com uma
pergunta fechada:

**1. O "reflow forçado" de 238 ms na linha 1047, coluna 33.** É `window.scrollY` na primeira
chamada de `onScroll()` do script da LP, logo depois de `root.className += ' js'` e das
escritas de preço: a leitura obriga o navegador a calcular estilo e layout dos 445 elementos
da seção dentro do script. Conserto na LP (`c6993a2`): a barra fixa lê o scroll dois quadros
depois (`requestAnimationFrame` duplo) e os `.reveal` confiam na primeira chamada do
IntersectionObserver, que entrega a visibilidade inicial sem leitura nenhuma. Provado com
trace CDP no Chromium: **zero eventos de Layout dentro de script no carregamento**, reveals
e barra fixa funcionando. Regra entrou no prompt do gerador (item 9) e em `DESEMPENHO.md`.

**2. `GTM-000000` = pixel de exemplo nas configurações do EasySell** (linha 127 do HTML,
`"pixels":[{"label":"GTM","type":"gtag","value":"GTM-000000"}]`; o `easysell.js` monta
`googletagmanager.com/gtag/js?id=GTM-000000` a partir daí). São 88 KB comprimidos de JS do
Google carregados para um contêiner que não existe — os "86 KB, 54 não usados" do relatório.
Não é pixel da Shopify (o `webPixelsConfigList` está vazio) nem do tema (não há tema nesta
página). Conserto é do lojista: Apps → EasySell → Configurações → Pixels → apagar a entrada
"GTM" ou pôr o id real. Os ~20 pedaços ESM da árvore de dependência são a sincronização de
carrinho do canal Shop (Canais de vendas → Shop). Lista completa em `DESEMPENHO.md` §3.

**3. Animações da LP**: as quatro (`mpp-scroll`, `mpp-pulse`, `mpp-in`, `mpp-fade`) animam
só `transform`/`opacity` — compositor, fora da thread principal; `prefers-reduced-motion`
desliga tudo. Os 594 ms de "Style & Layout" não vêm delas: 238 são o reflow acima, o resto
é `easysell.css` (628 regras chegando depois e reestilizando o documento) e o EasySell
montando o formulário. **O compilador ganhou a checagem** (`html/animation-repaints`,
`html/expensive-effects`): keyframes tocado por alguma regra que anime propriedade de layout
ou pintura (width, box-shadow, background…) é aviso com o conserto, pior se `infinite` sem
`prefers-reduced-motion`; transição em propriedade de layout ou `all`, `backdrop-filter`,
desfoque grande e `will-change` espalhado são informação. Nunca reescreve. Na Mini Plancha
apontou duas transições (`.time-bar-fill` em `width`, que nunca rodava, e `.look-tab` em
`all`) — trocadas. Achado no caminho: `scopeCss` deixava passar **sem escopo** a regra que
vinha depois de um `@import …;` na mesma folha; corrigido com teste.

**Nossa fatia da página**: 67 KB dos 132 KB (51%); 54 KB de JS inline no `<head>` antes do
nosso conteúdo (EasySell 23 KB, Shopify 18 KB) — é isso que segura o FCP. Dos 5
`preconnect` que o relatório conta (3 no HTML + 2 no cabeçalho HTTP da Shopify), os 2 das
fontes do Google são nossos: hospedar as duas fontes como arquivos da loja tira os dois e o
CSS de terceiro.

Testes: compilador 84, Shopify 47, app 38; typecheck limpo.

### "Mesmo código, 95 no PageFly e 68 no D&VFly" — o que os agentes acharam, e o defeito nosso (22/09, noite)

A mesma LP publicada nas duas ferramentas, medida à mesma hora: 95 estável lá
(ofertascolombianas.shop), 68 aqui (snevy.co). Três agentes, três perguntas fechadas, e a
resposta honesta é: **duas das três diferenças não são nossas; a terceira era.**

**1. O 95 dela é do tema, não da ferramenta.** No `<head>` da loja do PageFly há um
`<div id="fv-loading-icon">` com um glifo de 190vw e `opacity:0.0001`: para o Lighthouse ele
é o maior elemento pintado, e pinta junto com o primeiro texto — LCP = FCP, sempre. Os
scripts empacotados do tema ainda reconhecem o user-agent do Lighthouse e se desligam no
laboratório. Reproduzido no Chromium daqui: **sem** o chamariz, a página dela dá FCP 1,8 s e
LCP 3,2 s — pior que a nossa. Não copiamos isso (é o 96 com `NO_LCP` de 21/09 com outra
roupa: uma nota que o visitante não sente).

**2. `preload` + `fetchpriority` do herói: hipótese testada e rejeitada.** Um agente mediu as
quatro combinações; em todas o herói termina 0,3–0,65 s depois do FCP (a rede é a fila, não
a prioridade), e `preload` sem `fetchpriority` cai para prioridade Low e piora. Fica como
está: preload com `fetchpriority="high"`, nunca um sem o outro.

**3. A oscilação (95 → 64 com o mesmo HTML) é do laboratório**: simulação Lantern sobre uma
observação sem limite, mais o que a Shopify injeta por loja e por hora (wpm, trekkie,
perf-kit, EasySell, sincronização do canal Shop). Regra: mediana de 3 corridas.

**O defeito nosso: a base do `rem`.** O compilador convertia cada `rem` do HTML colado a
16 px (a raiz do navegador). O tema da loja diz `html{font-size:calc(var(--font-body-scale)
* 62.5%)}` — 1rem = 10 px — e foi nesse tema que a LP foi desenhada e aprovada. Resultado
medido em 412 px de largura: h1 com 60,8 px em vez de 38, herói começando em 423 px em vez
de 265, **preço e botão de comprar fora da primeira tela**. Tudo 1,6× maior que o aprovado.
Conserto:

- `themeRootPx(sources)` lê a raiz do tema (variáveis coletadas de todas as fontes,
  `calc(var(--x) * 62.5%)` resolvido; sem declaração, 16); `authorRootPx(css, fallback)`
  continua dando a vez ao autor que declara `html{font-size:…}`.
- `readThemeStyle` passou a baixar as folhas do tema (paralelo, 6 s, 256 KB cada, uma vez a
  cada 10 min) e devolve `rootPx`; o editor manda esse número no pedido de preview
  (`/api/preview` aceita 4–64, fora disso ignora), o loader, o `/preview/:id` e a publicação
  compilam com o mesmo `readThemeStyle(storeForThemeStyle(loja aberta))` (I1). Barra de
  status: "1 rem = 10 px, como no tema da loja", só quando há `rem` convertido e a raiz não
  é 16.
- Prompt do gerador ganhou a regra (item 17): tamanhos em px; se usar rem, declare a raiz.

Dirigido contra a loja de verdade (`drive-rem.mjs`, rede real pelo proxy): `/api/theme-style`
lê 4 folhas de snevy.co e responde `rootPx: 10`; o SSR do editor, o pedido de preview, a
barra de status e o `/preview/:id` saem com 38 px; no canvas, com o tema por cima, o h1 mede
38 px e o parágrafo 16 px; autor com `html{font-size:20px}` ganha (2rem = 40 px); `rootPx:
1000` cai no 16. 8/8. Testes: compilador 89, Shopify 47, app 38; typecheck limpo.

O que continua na mão do lojista para a nota subir de verdade: apagar o pixel `GTM-000000`
no EasySell, colar a LP mais nova, trocar os 7 placeholders por foto real, publicar e medir
3× no celular.

### O visual de antes era o certo — a base do `rem` vira escolha da página (22/09, noite)

Publicada com a base do tema, a LP deu **92** no celular (FCP 2,4 s · LCP 2,9 s · TBT 10 ms ·
CLS 0), e o Miguel disse o que eu tinha invertido: "o jeito da LP que estava antes estava
melhor". Eu tinha decidido pelo compilador que o tamanho "certo" era o do tema; o dono da
página achava o de 16 px mais bonito, e a nota não é argumento para tirar isso dele.

- `Page.remFromTheme` (migration `20260922160000_rem_do_tema`), **desligado por padrão**:
  cada `rem` do HTML colado vale 16 px, e a página publicada fica igual ao arquivo aberto
  sozinho no navegador. Ligado ("Configurações da página → Tamanho do texto no HTML colado →
  Seguir o tamanho de texto do tema"), a raiz do tema (10 px) manda, com o valor lido na
  nota. Editor, `/preview/:id`, publicação, exportação, duplicação e importação carregam a
  opção; arquivo antigo nasce desligado. O status "1 rem = 10 px, como no tema da loja" só
  aparece com a opção ligada.
- Dirigido (`drive-rem.mjs`, loja de verdade): padrão a 60,8 px em SSR, canvas com o tema,
  `/preview/:id` e pedido de preview sem `rootPx`; ligando a caixa, tudo passa a 38 px, salva,
  recarrega, exporta `remFromTheme: true`; cópia segue, importação antiga não. 19/19. Modo leve
  20/20. A sequência do ATUALIZAR da VM (install, build, migrate, servidor em produção com
  Postgres) repetida aqui: `/healthz` ok, `remFromTheme` com default `false` no banco.

Sobre a nota com o visual de 16 px: a LP inteira acima da dobra é a mesma (título, foto,
preço abaixo); o que muda entre 68 e 95 continua sendo o laboratório e os scripts da loja,
não o tamanho da fonte. Vale a regra: mediana de 3 corridas.

### "Não tem lógica, mesmo código" — a perícia da loja do PageFly (22/09, noite)

Depois do 68 com o visual de 16 px, o Miguel recusou tirar o `GTM-000000` e a sincronização
do Shop ("sem chance") e pediu pesquisa: docs do PageFly, o que for. Dois agentes, um lendo
documentação (PageFly, Shopify, Lighthouse, GemPages, Replo, Shogun) e um fazendo perícia dos
dois HTMLs ao vivo (`b-ofertascolombianas.shop.html` × `live-68.html`), com cada script
externo baixado e os empacotados desempacotados.

**A loja do PageFly não tem menos terceiros — tem mais.** Mesmo EasySell (mesmo build), mesmo
`"pixels":[{"type":"gtag","value":"GTM-000000"}]`, mesmo Shop cart sync, wpm, trekkie,
perf-kit, `preloads.js`. E ainda: Firebase síncrono ×2 (checagem de licença do tema), 329 KB
de `base.css` bloqueante + 89 KB de line-awesome, 527 KB de JS inline no `<head>` (379 KB só
de ofertas de quantidade do EasySell), 141 KB de `main.js`, tracker de afiliado injetado por
um worker, 9 helpers do PageFly. HTML de 646 KB (98 KB gzip) contra 134 KB (35 KB gzip) nosso;
DOM 733 × 529; 3 CSS bloqueantes + 2 scripts síncronos × 1 CSS bloqueante e 0 scripts.

**O 95 estável é o tema dela trapaceando o teste**, não o PageFly (o PageFly tem até uma chave
`forceByPassGoogleLightHouse`, desligada nessa página):

1. Script empacotado (`eval(function(p,a,c,k,e,r)…)`) no `<head>` do tema: se
   `navigator.platform == "Linux x86_64"` e o UA não tem `CrOS` — que é o robô do PageSpeed,
   porque o Lighthouse troca o user-agent mas não o `platform` (confirmado no Chromium daqui
   com emulação de celular) — instala um `MutationObserver` no `documentElement` que, para
   **cada `<script>`** que o parser insere, tira o `src` e põe `type="text/lazyload"`. No
   laboratório, depois do byte ~9 KB **nenhum JavaScript roda**: nem Shopify, nem EasySell, nem
   gtag, nem tema. Variável chamada `__isPSA`. TBT 0, 44 pedidos contra 194 da nossa, variância
   zero. Testei o mecanismo: três scripts de prova não executaram. Efeito colateral: visitante
   de Linux desktop recebe a página morta (sem formulário de pedido). Um segundo empacotado faz
   o mesmo para o GTmetrix (`X11` + `GTmetrix`, strings ofuscadas).
2. `<div id="fv-loading-icon">` no `<head>`, glifo «Γ» de 190vw, 99vw×99vh, `opacity:0.0001`
   (0 o Chrome exclui; 0,0001 passa): abre o body antes do CSS e vira o LCP no primeiro
   paint. Medido: LCP 768 ms com ele; 3.180 ms sem ele, na imagem — que lá é pior que a nossa
   (sem `srcset`, sem preload, 256 KB do original 2027×2027; a nossa baixa 67 KB).

Nada disso é replicável honestamente, e eu não vou replicar: é conteúdo invisível para a
métrica e detecção do robô — o Lighthouse tem issue aberta por um arquiteto da própria
Shopify sobre exatamente isso (#15829), o Google ranqueia pelo CrUX (campo), e a página fica
quebrada para gente de verdade.

**A oscilação nossa também tem nome.** Relato na comunidade Shopify (09/2026) com teste de
duas páginas idênticas, uma sem `content_for_header`: com a tag, o PSI segura o primeiro
frame 1,1–2,2 s em ⅓ a ½ das corridas — "91 a 95 nas normais, 63 a 68 nas seguradas". Issue
#17230 no Lighthouse, sem resposta. Os números são os nossos. Não reproduz no Lighthouse
local, e não há parâmetro de página que elimine.

**O que era legítimo e faltava, feito**: a Shopify transmite a resposta em duas partes
cortadas no `content_for_header` e converte os `<link rel="preload">` da primeira em
cabeçalhos `Link` e 103 Early Hints (doc de desempenho de plataforma). O nosso preload do
herói estava no corpo (uma seção não alcança o `<head>`), depois de 60 KB de head da Shopify.
Agora `compile()` devolve `headHints` (o mesmo preload) e a página leve com herói ganha
`layout/theme.dvfly-<página>.liquid`: o layout mínimo com o preload antes da tag, em
`{% raw %}`, gravado antes do template e apagado com ele. Testes: compilador 90, Shopify 50,
app 38. O que a doc diz mais e fica anotado: hospedar as fontes no CDN da Shopify em vez do
Google Fonts (tira 2 origens), e nada mais do nosso lado move a nota — o resto é (b) da
loja ou (c) trapaça.

Não consegui rodar o PSI hoje (cota diária). A prova de que o preload chega como Early Hint
é a próxima publicação: `curl -sI https://snevy.co/products/mini-plancha | grep -i '^link'`
tem que listar o `.webp` do herói.

### "Na hora do 95 você fez algo que deu certo e depois tirou" — julgado com provas (22/09, noite)

Hipótese do Miguel, levada a sério: workflow com quatro peças de prova em paralelo (medição
sequencial das cinco versões da nossa seção no mesmo teste; diff forense das seções das
quatro fotos do dia; fragmento publicável recompilado em cada um dos 11 commits, um worktree
por commit; linha do tempo lida dos prints do PageSpeed + diff do documento inteiro) e dois
juízes independentes, um advogado da hipótese e um cético. **Os dois concluíram que ela não
se sustenta.** As provas:

- **A seção do 95 (09:28) e a do 64 (09:50) são byte-idênticas** (md5 `f8ef5e36…`, 67.748
  bytes, mesmo id de template), o `<body>` inteiro é idêntico e o `themeCityHash` é o mesmo:
  31 pontos de queda com zero bytes nossos mudados. A única diferença estava no `<head>`: um
  `shopify.event_observer.bootstrap` que a Shopify injeta por amostragem de pedido.
- De 95 → 88 → 68 → agora, a nossa seção só **ganhou** coisas: leitura de layout em lote
  (8c80785), sem leitura no load + `.reveal` só pelo IntersectionObserver (c6993a2), duas
  `transition` estreitadas (5a6611f). Preload, `fetchpriority`, `lazy`, fontes, CSS e
  tamanhos de texto: idênticos nas quatro fotos e nos 11 fragmentos recompilados. O herói
  nunca teve `.reveal` (o primeiro está na 2ª seção), então nada da primeira tela passou a
  depender de JS.
- A **única** coisa que existiu numa nota 90+ e foi tirada é a base `rem` = 10 px do 92 das
  11:13 (46 regras de `font-size`, nada mais), revertida a pedido dele ("o jeito de antes
  estava melhor").
- Medição controlada (mesma cabeça da Shopify, fila simulada, CPU 4×, 4 rodadas por versão):
  LCP das versões 95/88/68/agora = 1366/1372/1368/1366 ms (Δ 6 ms, ruído 8–20); FCP Δ 118 ms
  entre versões, menor que o ruído dentro de cada uma; long tasks ~200 ms **menores** nas
  versões novas (o reflow forçado saiu). Os long tasks grandes são iguais em todas: wpm
  234–327 ms, perf-kit 131–182, gtag `GTM-000000` 88–142, trekkie 77–154.
- O que o 95 teve "a mais" foi sorte de corrida, visível nos prints: no 95 e no 88 o título
  está na **fonte de reserva** (5 linhas, preço fora da tela) — o run foi rápido, a Playfair
  não chegou a tempo do `display=optional` e o LCP foi o texto do primeiro quadro (FCP = LCP
  = 2,4 s). Nos 68 a Playfair renderizou (3 linhas), o título ficou menor que a foto, e o LCP
  passou a ser a **imagem**, que na simulação chega atrás dos ~12 scripts de terceiros na
  fila (5,7 s). Mesmo CSS, dois LCPs diferentes.
- **A variante `head-early`** (o preload do herói no `<head>`, cd541ad, ainda não publicada)
  foi a única que moveu o ponteiro: LCP 892–904 ms em 3 rodadas de 4 contra 1360–1380 das
  outras (−34 %). Ataca exatamente o caso lento. Na 4ª rodada a imagem caiu atrás dos
  scripts na fila FIFO simulada — o Early Hint de verdade (que a simulação não faz) é para
  isso.
- Achado colateral: o segundo bloco HTML da página (rodapé) está no ar com placeholders
  literais — `{{ nome_loja }}`, `{{ email_suporte }}`, `{{ endereco_fisico }}` — nas quatro
  fotos. Não é nota; é texto errado para o visitante.

Ressalvas: n = 4 por versão; medição da nossa seção sob a nossa simulação, não a nota do
PSI (cota esgotada hoje). Arquivos em `scratchpad/psi/analise/` (não versionados).

### 🔴 Dívida técnica aberta, antes de qualquer loja de produção

Detalhada com desenho em `docs/CONFIGURACAO_E_MECANISMOS.md` §5:

1. **Ciclo de instalação dentro do admin real** — implementado e testado com tokens assinados
   pelo segredo real; a prova final é instalar numa loja de verdade ao hospedar.
2. **Access token das lojas em texto claro no SQLite** — cifrar em repouso antes de sair da
   loja de teste (P1).
3. **`application_url` real no `shopify.app.toml`** + `shopify app deploy` ao hospedar.

## Fase 4 — Recursos P1 ⬜

Não iniciada. Escopo: os **54 itens P1**.
