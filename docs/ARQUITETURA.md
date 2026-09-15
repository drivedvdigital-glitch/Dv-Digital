# Arquitetura do D&VFly

> **Documento da Fase 2.** Define stack, modelo de dados, motor do editor e estratégia de
> publicação. Cada decisão vem com o motivo; onde há dúvida real, está dito que há.
>
> Base: `docs/PESQUISA_PAGEFLY.md` (Fase 1) e o spike em `prototype/`.
>
> ⚠️ **Deriva registrada em 15/09/2026** (auditoria em `CONFIGURACAO_E_MECANISMOS.md` §3):
> o código construído difere deste documento em pontos que ainda não foram reescritos aqui —
> não há `@shopify/shopify-app-react-router` nem sessões (é client credentials puro), não há
> `dnd-kit` (arrasto nativo HTML5), o banco é SQLite fixo (Postgres exige trocar o provider),
> o modelo de dados real é `Store / Page / Version / Deployment` (sem `Publish`, `Variant`,
> `Asset`, `ThemeMark`), o breakpoint `xl` existe, e a trilha A já usa `write_themes` quando a
> página desliga o cabeçalho/rodapé. Os invariantes I1–I7 continuam valendo como estão.

---

## 0. Método

A Fase 1 entregou três coisas que este documento consome:

1. **Um mapa funcional** com 145 itens priorizados — o que construir e em que ordem.
2. **Onze padrões de reclamação** do líder de mercado, cada um virando um invariante de
   arquitetura aqui.
3. **Um apêndice de APIs** da Shopify, lido na fonte, com um ponto em aberto (o `write_themes`).

Antes de escrever este documento, o spike em `prototype/` foi construído e medido. Todo número
citado aqui saiu dele, não de estimativa. Isso importa: a tese central do projeto é uma afirmação
sobre bytes, e afirmação sobre bytes se verifica, não se argumenta.

---

## 1. Os invariantes

São sete, herdados da Fase 1. Não são metas — são regras que, se quebradas, exigem reescrever e
não corrigir. Tudo neste documento existe para sustentá-las.

| # | Invariante | Reclamação que responde |
|---|---|---|
| **I1** | **Um compilador só.** O canvas do editor mostra o output do mesmo compilador que publica. | 3.1 — o editor não bate com a página publicada |
| **I2** | **O publish congela o output.** Atualizar o builder nunca altera página já publicada. | 3.2 — atualizações quebram páginas prontas |
| **I3** | **Pegada mínima e auditável no tema.** Sabemos exatamente o que escrevemos, e removemos tudo. | 3.3 — o app suja o tema |
| **I4** | **O conteúdo sobrevive ao app.** HTML no Shopify, export estático, JSON aberto. | 3.4 — lock-in |
| **I5** | **O storefront nunca depende do nosso backend.** | 3.5 — instabilidade |
| **I6** | **HTML semântico correto por padrão.** | 3.10 — links que não são links |
| **I7** | **Performance é critério de aceite,** verificada no build. | 3.7 — output pesado |

---

## 2. Stack

### Decisão

| Camada | Escolha | Versão verificada |
|---|---|---|
| Framework do app | **React Router 7** (framework mode) | `react-router` 7.18.2 |
| Adaptador Shopify | **`@shopify/shopify-app-react-router`** | ^1.1.0 |
| Build | **Vite** | ^7.3.1 |
| Banco / ORM | **Prisma** + SQLite em dev, Postgres em produção | ^6.16.3 |
| Sessão | `@shopify/shopify-app-session-storage-prisma` | ^9.0.0 |
| UI do admin | **Polaris web components** via App Bridge | Polaris CDN 1.0 |
| Linguagem | **TypeScript** | ^5.9 |

### Por quê

**O `PROGRESSO.md` supunha Remix e Polaris React. As duas suposições estão desatualizadas**, e é
bom ter descoberto agora:

- O template oficial da Shopify é hoje o **`shopify-app-template-react-router`**, e a documentação
  de scaffolding diz explicitamente que é "o caminho recomendado para a maioria dos apps". O pacote
  `@shopify/shopify-app-remix` deu lugar a `@shopify/shopify-app-react-router`. Na prática a
  migração Remix → React Router 7 é quase renomeação (o Remix v2 virou React Router v7), mas o
  pacote de integração com a Shopify é outro, e é ele que resolve OAuth, webhooks e o cliente
  GraphQL autenticado.
- **Polaris React está oficialmente deprecado.** O pacote `@shopify/polaris` carrega aviso de
  depreciação no npm desde a última release (13.9.5, março de 2025), apontando para os **Polaris
  web components**. O template novo traz só `@shopify/polaris-types`. Construir a UI do admin em
  Polaris React hoje seria começar em cima de algo que a Shopify parou de manter.

Não há motivo para sair do caminho oficial. Um app privado não ganha nada com stack exótica, e
perde as atualizações de segurança e os exemplos que a Shopify mantém.

### Consequência para a UI do editor

Polaris web components servem para a **moldura administrativa** — listagem de páginas,
configurações, formulários, modais. O **canvas do editor não é Polaris**: é UI própria, porque
nenhum design system de admin tem canvas, réguas, alças de seleção e overlay de drop. Os dois
convivem: Polaris fora, componentes próprios dentro.

---

## 2.5 Multi-loja — e o que isso muda na decisão de stack

> **Registrado em 14/09/2026.** Até aqui todo o projeto dizia "app privado da **sua loja**",
> singular. É falso: são **várias lojas**, e o fluxo declarado é *validar numa loja de teste →
> mandar para as outras*. Isso reabre a decisão D1.

### A loja de desenvolvimento

`tf1vp1-fd.myshopify.com` ("Magyarország") existe só para o D&VFly ser desenvolvido e testado.
É onde a sonda do R1 rodou. As lojas de produção — a do vídeo, com badge "Colombia", e as outras —
só recebem o app depois que tudo estiver validado aqui.

### O que a operação real já dizia, e eu não juntei

Os indícios estavam na gravação: páginas nomeadas `250-CO-S-…` e `08-MX-S-…` (Colômbia, México),
admin em pt-BR, loja em espanhol, previews em "Brasil" e "Espanhol". É **uma operação, várias
lojas, os mesmos produtos por mercado.**

### A consequência: app embutido vs. app autônomo

| | **Embutido** (decisão D1 original) | **Autônomo** |
|---|---|---|
| Onde roda | Dentro do admin da Shopify, por loja | Fora, uma instância só |
| Autenticação | OAuth + session storage por loja | **Client credentials grant** por loja |
| Gerenciar N lojas | Instalar e alternar entre elas | **Uma tela, todas as lojas** |
| "Publicar esta página em 5 lojas" | Contra o modelo — o app instalado na loja A escrevendo na loja B | **É o fluxo natural** |
| Máquina necessária | Template completo, OAuth, sessões | Muito menos |

**Decisão: UI embutida no admin, backend multi-loja.** A tabela acima montou um falso dilema, e
foi corrigida no mesmo dia: **as duas colunas não são exclusivas.**

A UI roda embutida no admin da loja que você abrir — é o que dá as abas, a navegação e a sensação
de "app da Shopify", e é o que o concorrente faz. O **backend é nosso** e guarda credenciais de N
lojas via client credentials grant, então "publicar esta página em 5 lojas" continua sendo o fluxo
natural, disparado de dentro de qualquer uma delas.

O que o R1 destravou não foi "não precisa ser embutido" — foi "o backend não precisa de OAuth por
loja para falar com as outras". Embutido resolve a interface; client credentials resolve o
alcance.

### O que muda no modelo de dados

`Page.shop` já existia. Passa a existir também:

```
Store      id, domain, label, clientId, clientSecret(cifrado), isProduction, createdAt
Deployment id, pageId, versionId, storeId, shopifyGid, publishedAt, bytes
```

Uma **página** deixa de pertencer a uma loja e passa a ser **implantada em N lojas**. É a diferença
entre "exportar e importar" (o remendo do concorrente, seção 3.4 da pesquisa) e **publicar em
várias lojas como operação de primeira classe**.

### Novo item de prioridade

| Item | Prioridade | Porquê |
|---|---|---|
| **Publicar a mesma página em N lojas selecionadas** | **P0** | É o fluxo declarado da operação. Não estava nos 145 itens porque a premissa era loja única |
| Registro de lojas, com credencial por loja | **P0** | Pré-requisito do acima |
| Marcar loja como teste vs. produção | **P1** | Evita publicar em produção por engano |

---

## 3. Motor do editor visual

Esta é a decisão mais cara do projeto — a que mais dói mudar depois. Vale gastar espaço nela.

### Os candidatos, com os números

| Opção | Licença | Última release | Downloads/mês | Modelo |
|---|---|---|---|---|
| **GrapesJS** | BSD-3 | 0.23.6 (ago/2026) | 1,3 M | Edita **HTML/CSS** diretamente |
| **Puck** | MIT | 0.20.2 (set/2025) | 634 k | Edita dados; renderiza **componentes React** |
| **craft.js** | MIT | 0.2.12 (fev/2025) | 253 k | Edita dados; renderiza **componentes React** |
| **dnd-kit** | MIT | 6.3.1 (dez/2024) | 92,6 M | Não é editor — é primitivo de drag & drop |

### Decisão: **editor próprio, sobre `@dnd-kit/core`, com canvas em iframe renderizando o output real do compilador.**

### Por quê

Comece pelo invariante **I1**: o canvas tem de mostrar o que o publish emite. Agora teste cada
candidato contra ele.

- **GrapesJS edita HTML e CSS como modelo primário.** Isso colide de frente com a arquitetura:
  se o documento é markup, não existe etapa de compilação, e perdemos a capacidade de mudar o
  output depois sem reescrever todas as páginas salvas. Também é uma biblioteca grande, não-React,
  com gerência própria de DOM. Descartado por incompatibilidade conceitual, não por qualidade.
- **Puck e craft.js guardam dados e renderizam React.** Conceitualmente estão certos — o documento
  é JSON. Mas o *renderizador* deles é React. Adotá-los significa que o canvas renderiza árvore
  React e o publish renderiza HTML por outro caminho: **dois motores de renderização, que é
  exatamente a causa provável da reclamação nº 1 do concorrente.** Dá para usá-los só como casca
  de interação e renderizar nosso HTML dentro — mas aí estamos pagando a dependência e jogando
  fora o que ela tem de valor, enquanto brigamos com o modelo dela.
- **dnd-kit não é um editor** — e é por isso que serve. Ele resolve a parte cara e não
  diferenciante (sensores de ponteiro/teclado/toque, detecção de colisão, acessibilidade do
  arrasto, auto-scroll) e não opina sobre renderização. Com 92,6 M de downloads/mês é o primitivo
  de fato do ecossistema.

Nota sobre versões: `@dnd-kit/core` 6.3.1 é o estável (dez/2024, sem release desde então, o que
para um primitivo maduro é sinal de estabilidade e não de abandono). Existe uma próxima geração,
`@dnd-kit/react` 0.5.0 (jun/2026, 4,6 M/mês), ainda **pré-1.0** — anotada para reavaliação depois
do MVP, não adotada agora.

### Como o canvas funciona

```
┌─ Editor (React Router + React) ─────────────────────────┐
│                                                          │
│  Árvore de blocos (estado)                               │
│        │                                                 │
│        ├──► compile(doc) ──► html + css ──┐              │
│        │                                   ▼              │
│        │              ┌─ <iframe> ────────────────────┐  │
│        │              │  CSS do tema da loja          │  │
│        │              │  + output real do compilador  │  │
│        │              └───────────────────────────────┘  │
│        │                          │                       │
│        │        postMessage: bounding boxes, hover, click │
│        ▼                          ▼                       │
│  Painéis (dnd-kit)    Overlay de seleção e drop (fora)   │
└──────────────────────────────────────────────────────────┘
```

O iframe carrega o CSS do tema da loja e o output do compilador. Ele **não** tem JavaScript de
edição: apenas um script fino que reporta posições de elementos e eventos de ponteiro para a
janela pai. As alças de seleção, guias e indicadores de drop são desenhados **fora** do iframe,
sobrepostos, pelo React.

Isso dá três coisas de uma vez:

1. **I1 por construção.** O que você vê é literalmente o output, dentro do CSS do tema real. Não
   existe "divergência" porque não existe um segundo renderizador.
2. **Detecção precoce de conflito com o tema.** Se o CSS do tema quebra nosso bloco, isso aparece
   no editor, não em produção.
3. **Isolamento.** O CSS do tema não vaza para a interface do editor, e a interface do editor não
   vaza para o preview.

O padrão é o mesmo de editores visuais de mercado. A parte chata é conhecida e cabe num módulo:
coordenadas cruzam a fronteira do iframe e precisam ser convertidas.

### Isso é viável em performance?

Sim, e o spike responde: **~5 ms para compilar 78 nós.** Recompilar a cada edição está
confortavelmente dentro de um frame. Não é preciso renderização incremental no MVP; se algum dia
for, o compilador é puro e memoizar por subárvore é direto.

### O que estamos assumindo de custo

Honestamente: **a UI do editor é nossa.** dnd-kit dá o arrasto; painéis, inspector, árvore,
overlay e o protocolo do iframe são código nosso. É a maior fatia da Fase 3. A troca é consciente:
pagamos em UI para não pagar em divergência de renderização, que é o defeito que este produto
existe para não ter.

---

## 4. Modelo de dados

### O documento de blocos

Definido e em funcionamento em `prototype/src/schema.ts`. Resumo:

```
Doc    { version, tokens?, root: Node[] }
Node   { id, type, props?, style?, children? }
Style  { base?, md?, lg? }   // cada um um StyleProps
```

Três decisões dentro dele merecem justificativa:

**Vocabulário de estilo fechado.** `StyleProps` tem um conjunto fixo de propriedades — não aceita
CSS arbitrário. Vocabulário fechado se valida, se deduplica e se orça; CSS arbitrário não. O
escape hatch existe em dois lugares explícitos (CSS por elemento e por página), fora do caminho
normal.

**Breakpoints mobile-first com sobreposição.** `base` vale em toda largura; `md` (≥768) e `lg`
(≥1200) carregam **só o que difere**. Isso é a resposta direta à reclamação 3.8 ("precisa criar
dois ou três designs"): há **um** design e dois conjuntos de sobreposições. O editor mostra, em
cada campo, se o valor é herdado ou próprio, com um clique para limpar a sobreposição.

**O nó nunca carrega markup.** Markup é sempre derivado. É o que torna I2 possível.

### Persistência

```
Page      id, shop, title, handle, type, status, themeTemplate?, createdAt, updatedAt
Version   id, pageId, doc (JSON), compilerVersion, label?, createdAt, createdBy
Publish   id, pageId, versionId, target, shopifyGid?, html, css, js, bytes, publishedAt
Variant   id, pageId, key, doc (JSON)          -- prepara A/B sem migração futura
Asset     id, shop, shopifyGid, url, width, height, alt?
ThemeMark id, shop, themeId, kind, path        -- inventário do que escrevemos (I3)
```

Quatro observações:

- **`Version.compilerVersion`** é I2 em forma de coluna. Uma página publicada registra com qual
  compilador foi gerada; atualizar o builder não reescreve nada retroativamente.
- **`Publish` guarda o output**, não só a referência. É o que permite republicar idêntico,
  comparar versões e exportar sem recompilar com um compilador diferente.
- **`Variant` entra no MVP mesmo sem A/B test.** Custa uma tabela agora; custaria uma migração
  dolorosa depois. É o item P0 de 4.8 da pesquisa.
- **`ThemeMark` é o inventário de I3.** Todo arquivo e todo bloco que escrevemos no tema vira uma
  linha. A desinstalação lê essa tabela e remove exatamente aquilo — nada a mais, nada a menos.
  É a diferença entre um app que dá para desinstalar e um que prende.

### Histórico de versões

O concorrente guarda 50 salvamentos manuais. Sem custo de escala (app privado, uma loja), o
D&VFly guarda **todas as versões salvas**, com poda só quando passar de um limite generoso. O
histórico é o substituto do suporte que não existe: é ele que torna todo erro reversível.

---

## 5. O compilador

Já existe e está medido. `prototype/src/compile.ts`.

```ts
compile(doc: Doc): { html: string; css: string; js: string; stats: {...} }
```

**É uma função pura.** Mesmo documento entra, bytes idênticos saem — travado por teste. Pureza é o
que torna I1 e I2 aplicáveis em vez de aspiracionais: o editor e o publish só podem concordar se
chamarem a mesma função, e uma página só pode ser congelada se a função for determinística.

### Estratégia de CSS

Cada conjunto de declarações vira uma classe nomeada pelo **hash do próprio conjunto**. Estilos
iguais colapsam numa regra só. Resultado medido na landing de exemplo: **32 regras distintas para
107 pedidos de estilo — 3,3× de reúso.**

Esse número é a justificativa técnica de uma decisão de produto: **doze depoimentos com estilo
idêntico emitem uma regra, não doze.** É por isso que o repetidor genérico subiu para P0 na
pesquisa — ele encolhe o output em vez de aumentá-lo.

### Estratégia de JavaScript

**Zero por padrão.** Um bloco que precisa de comportamento declara um módulo de runtime, e só
então ele é emitido. Na landing de exemplo, um único bloco (o contador) pediu runtime: **0,3 KB**.

O accordion é a demonstração do princípio: `<details>/<summary>` entrega abrir/fechar, navegação
por teclado e busca na página **sem um byte de script**. Escrever um accordion em JavaScript custa
bytes e entrega menos.

### Resultado medido

Landing completa — hero, 6 cards, 12 depoimentos, contador, FAQ de 8 itens, 78 nós:

| | |
|---|---|
| HTML | 7,1 KB |
| CSS | 2,6 KB |
| JS | 0,3 KB |
| **Total** | **10,1 KB** |
| **Teto de template da Shopify** | 256 KB — **usando 3,9%** |

O concorrente documenta que páginas com muitos elementos aninhados estouram esse teto e orienta o
lojista a *remover elementos*. Compilando para HTML estático, uma landing completa usa um vigésimo
quinto do limite. **A tese está verificada.**

---

## 6. Publicação

### Duas trilhas

**Trilha A — páginas avulsas (Regular/landing). É o MVP.**

`pageCreate` / `pageUpdate` / `pageDelete` no Admin GraphQL. O campo `body` recebe o fragmento
compilado (`<style>` + HTML + `<script>` opcional). Publicar e despublicar é `isPublished`;
agendar é `publishDate`; renomear preserva links com `redirectNewHandle`.

Scope: `write_content`.

> Repare em I4 e I5 saindo de graça: o conteúdo passa a viver **dentro do Shopify**. Se o app sumir
> ou cair, a página continua no ar e continua vendendo.

**Trilha B — produto, coleção, home. É P1, e é a que tem risco.**

Dois passos: escrever `templates/<tipo>.<sufixo>.json` no tema com `themeFilesUpsert`, depois
apontar o recurso com `templateSuffix` em `productUpdate` / `collectionUpdate`.

Scopes: `write_themes` (ver risco abaixo) + `write_products`.

**Plano B da trilha B — app blocks + deep linking.** Empacotar os blocos numa Theme App Extension
e mandar o lojista para o editor de tema por deep link, com o bloco já posicionado. Não escreve
arquivo de tema nenhum, não precisa de isenção, e tem um efeito colateral bom: o conteúdo fica
editável no editor de tema da Shopify, que é a resposta à reclamação 3.11. O preço é o teto de
**30 blocks por extensão** e o conteúdo passando a morar nas settings do tema.

### Limites que a arquitetura precisa respeitar

| Limite | Valor | Consequência |
|---|---|---|
| Tamanho do template | 256 KB | Orçamento verificado no build; aviso no editor antes do teto |
| Templates JSON por tema | 1.000 | Irrelevante para uma loja só, mas a poda de templates órfãos entra na rotina |
| Blocks por theme app extension | 30 | Só importa se formos de plano B; obriga a agrupar blocos |
| Liquid somado na extensão | 100 KB | idem |

---

## 7. Pegada no tema e desinstalação

I3 e I4 viram três regras operacionais:

1. **Nada no storefront enquanto não houver página publicada.** Sem conteúdo nosso na loja, o
   tema não carrega um único byte nosso. O concorrente falha aqui — há relato de código global
   instalado com apenas uma página de teste criada.
2. **Todo write no tema vira uma linha em `ThemeMark`.** Caminho, tipo e tema. A desinstalação lê
   a tabela e remove exatamente aquilo.
3. **Idempotência sob cópia de tema.** O mapeamento página↔template é resolvido por chave estável,
   não por acumulação. Um backup do tema não pode multiplicar páginas — o concorrente tem relato
   de 3.000 páginas duplicadas exatamente por isso.

E o export, que é I4 explícito:

- **HTML + CSS estáticos** por página, colável direto no tema.
- **Documento de blocos em JSON**, formato aberto e documentado, reimportável.

Nada de formato proprietário que só serve dentro do próprio app.

---

## 8. Performance: orçamento verificado

I7 vira número, não intenção:

| Métrica | Orçamento | Onde é verificado |
|---|---|---|
| Total da página compilada | **< 100 KB** (teto duro: 256 KB) | build + teste |
| JS emitido | **0 bytes**, salvo bloco que declare runtime | teste |
| Módulo de runtime individual | < 512 bytes | teste |
| LCP / CLS / INP | < 2,5 s / < 0,1 / < 200 ms em 4G simulado | Lighthouse na Fase 3 |

Os três primeiros já rodam no spike. O quarto entra quando houver página publicada para medir.

Regras de emissão que sustentam o CLS: toda imagem sai com `width`, `height`, `loading="lazy"` e
`decoding="async"`, salvo quando marcada como `eager` (a imagem do hero). Travado por teste.

---

## 9. Segurança

Um builder é, por definição, uma máquina de injetar markup na loja. Três defesas:

- **Escape por padrão.** Todo texto de autor é escapado na emissão. A única exceção é o bloco
  `html`, que existe para ser exceção e está documentado como tal.
- **Destinos de link em lista de permissão.** Só `http(s):`, `mailto:`, `tel:` e caminhos da
  própria loja. Um `javascript:` colado no campo de URL vira um botão inerte, não um XSS
  armazenado. Travado por teste.
- **CSS escopado e prefixado.** Toda classe emitida começa com `dvf`. O tema não colide conosco e
  nós não vazamos para o tema. Travado por teste.

---

## 10. Riscos

### ✅ R1 — RESOLVIDO: `write_themes` **não** exige isenção neste caso

**Fechado em 14/09/2026 por teste empírico**, como este documento propunha. A sonda
(`packages/compiler/bin/shopify-probe.ts`) rodou contra uma loja real e passou 7/7, escrevendo
`sections/*.liquid` + `templates/page.*.json` num tema despublicado, sem isenção nenhuma.

**Consequências:** a trilha B (A.2) é o caminho principal e está liberada; o plano B (app blocks +
deep linking) deixa de ser necessário para desbloquear, mas continua desejável porque mantém o
conteúdo editável no editor de temas. A autenticação usa o **client credentials grant**, não um
token pré-gerado.

O texto original do risco fica abaixo, como registro do que estava em aberto e por quê.

#### Registro histórico — a ambiguidade que existia

**Era o único risco que bloqueava uma decisão.** A documentação da Shopify se contradiz: as mutations
de arquivo de tema exigem "`write_themes` e uma isenção", enquanto a página que explica a
restrição a limita a apps **distribuídos na App Store**, e a página de apps customizados lista
`write_themes` como atribuível normalmente pelo lojista. O D&VFly é privado. Detalhe: a lista de
casos elegíveis a isenção começa literalmente por "page builders".

**Encaminhamento:** rodar `prototype/bin/shopify-probe.ts` contra a loja. Ele testa as duas
trilhas e diz qual está liberada. O script não escreve no tema publicado, cria só rascunho e
limpa tudo que cria.

**Impacto se der negado:** nenhum no MVP — a trilha A não usa `write_themes`. A trilha B passa a
ser app blocks + deep linking, que já está desenhada.

### R2 — O editor é a maior fatia de trabalho da Fase 3

Consequência aceita da decisão da seção 3. Mitigação: dnd-kit cobre o arrasto; o canvas em iframe
é um módulo isolado e testável; e o compilador, que é o núcleo, já está pronto e medido.

### R3 — Coordenadas através da fronteira do iframe

Parte conhecidamente chata do canvas. Mitigação: isolar num único módulo com testes próprios, e
prototipar cedo na Fase 3 — antes de construir os painéis em volta.

### R4 — `@dnd-kit/core` sem release desde dez/2024

Para um primitivo maduro, estabilidade é mais provável que abandono, e 92,6 M de downloads/mês
garantem que um fork não ficaria órfão. Reavaliar `@dnd-kit/react` depois do MVP, quando sair do
pré-1.0.

---

## 11. O que a Fase 3 constrói

Os 56 itens P0 da pesquisa, nesta ordem — escolhida para que cada etapa produza algo verificável:

1. **App rodando.** Template React Router, autenticação, Prisma, uma página de listagem em
   Polaris web components.
2. **Sonda de permissões.** Rodar `shopify-probe.ts` e fechar R1.
3. **Compilador para dentro do app.** Mover `prototype/src/` para o app, com os testes junto.
4. **Publicação da trilha A.** `pageCreate`/`pageUpdate` com o fragmento compilado. A partir daqui
   existe uma página real no ar.
5. **Canvas em iframe.** Renderizar o output, reportar bounding boxes, desenhar seleção. O módulo
   mais arriscado, feito cedo.
6. **Painéis.** Árvore, biblioteca de blocos, inspector com herança de breakpoint visível.
7. **Blocos P0.** Começando pelo repetidor genérico, que substitui vários outros.
8. **Versionamento, autosave e restauração.**
9. **Auditoria estática no editor.** Já existe em `src/audit.ts`.
10. **Export estático e rotina de desinstalação.**

O ponto 4 é o marco que importa: é quando o projeto deixa de ser protótipo.

---

## 12. Decisões registradas

| # | Decisão | Alternativa descartada | Motivo |
|---|---|---|---|
| D1 | **UI embutida no admin + backend multi-loja** (ver 2.5) | App puramente autônomo | Embutido dá as abas e a navegação do admin; o client credentials grant dá o alcance multi-loja. Não são excludentes — a primeira versão de 2.5 tratava como se fossem |
| D1b | React Router 7 + Vite + Prisma + TypeScript | Remix | O Remix v2 virou React Router v7; a stack base continua valendo |
| D2 | Polaris web components | Polaris React | Polaris React está deprecado desde mar/2025 |
| D3 | Editor próprio sobre dnd-kit | Puck, craft.js | Ambos renderizam React, o que cria um segundo motor de renderização e viola I1 |
| D4 | — | GrapesJS | Edita HTML/CSS como modelo primário; incompatível com compilar a partir de dados |
| D5 | Canvas em iframe com output real | Canvas em componentes React espelhados | Espelhar é o que produz a divergência editor/produção |
| D6 | Vocabulário de estilo fechado | CSS livre por elemento | Vocabulário fechado se valida, deduplica e orça |
| D7 | Breakpoints mobile-first com sobreposição | Design independente por dispositivo | Um design com sobreposições, não três designs |
| D8 | `Variant` no schema desde o MVP | Adicionar junto com o A/B test | Uma tabela agora, uma migração dolorosa depois |
| D9 | Trilha A (Pages) no MVP, trilha B em P1 | As duas no MVP | A trilha B depende de R1, que ainda está aberto |
