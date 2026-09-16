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

### 🔴 Dívida técnica aberta, antes de qualquer loja de produção

Detalhada com desenho em `docs/CONFIGURACAO_E_MECANISMOS.md` §5:

1. **Ciclo de instalação dentro do admin real** — implementado e testado com tokens assinados
   pelo segredo real; a prova final é instalar numa loja de verdade ao hospedar.
2. **Access token das lojas em texto claro no SQLite** — cifrar em repouso antes de sair da
   loja de teste (P1).
3. **`application_url` real no `shopify.app.toml`** + `shopify app deploy` ao hospedar.

## Fase 4 — Recursos P1 ⬜

Não iniciada. Escopo: os **54 itens P1**.
