# Modelos de tema: cabeçalho/rodapé, páginas de produto e de blog

Pesquisa pedida em 15/09/2026 ("isso você tem que pesquisar, ir a fundo"). Tudo abaixo foi
**experimentado de verdade na loja de teste** (tf1vp1-fd → megakciok.shop), não lido de
documentação e assumido.

## O que já está provado e EM PRODUÇÃO no app

### Esconder cabeçalho e rodapé (Configurações da página → Seções do tema)

O cabeçalho e o rodapé moram no *layout* do tema (`layout/theme.liquid`), não na página.
Esconder por CSS seria desonesto (os bytes continuariam lá). O caminho real:

1. `themeFilesUpsert` grava três arquivos no tema principal (idempotente, mesmos nomes):
   - `layout/theme.dvfly.liquid` — layout mínimo: html + `{{ content_for_header }}` (os
     scripts da Shopify — analytics, consentimento, checkout — têm que sobreviver) +
     `{{ content_for_layout }}`. Sem grupos de header/footer.
   - `sections/dvfly-page.liquid` — só `{{ page.content }}` (a seção `main-page` do tema
     imprime o título como H1 de novo; a nossa não).
   - `templates/page.dvfly-solo.json` — aponta `layout: "theme.dvfly"` e a seção acima.
2. `pageUpdate(templateSuffix: "dvfly-solo")` liga a página ao modelo; `null` devolve ao
   padrão do tema.

**Verificado no ar (15/09)**: com o modelo, a página em `megakciok.shop/pages/…` não tem
header/footer e mantém o head da Shopify; removendo, o tema volta. Ida e volta, 4/4.

## Confirmação externa do modelo (relatório 13, 15/09)

A gravação própria do PageFly em produção (fonte nº 1, `docs/videos/13-gravacao-propria.md`)
mostrou o mecanismo deles por dentro: **eles não criam páginas soltas — criam templates
de tema nomeados** (`pf-4f4ffdfa`) e os **atribuem a recursos da loja** via
`templateSuffix`. Página de produto tem a URL do próprio produto; o "Nome do modelo" é
copiável porque é ele que aparece no seletor de templates do editor de temas
("Atribuído a 1 produto"). É exatamente o desenho abaixo — decisão confirmada antes de
escrever o bloco de produtos. Detalhes a adotar quando o tipo produto sair: nome do
modelo visível e copiável nas Configurações; "Ir para o editor de temas"
desabilitado-com-motivo até publicar; texto de ajuda explicando o vínculo.

## Página de produto — ✅ EM PRODUÇÃO no app (15/09, flow19 8/8 na loja real)

O plano abaixo foi montado como descrito, com dois ajustes descobertos ao construir:

- O `templates/product.json` do tema vem com um **bloco de comentário** na frente (o editor
  de temas escreve) — precisa ser removido antes do `JSON.parse` (`stripJsonComments`).
- O nome no `{% schema %}` da seção tem **limite de 25 caracteres** no editor de temas —
  `"D&VFly · <título>"` cortado.

Como ficou (`packages/shopify/src/templates.ts`, `products.ts`, `deploy.ts`;
`app/app/lib/publish.server.ts`):

1. **Vínculo por loja** (`ProductLink { pageId, storeId, productGid, productHandle,
   productTitle }`): produtos são diferentes em cada loja, então a lista de vinculados é por
   loja, com busca no catálogo (`/api/products?storeId&q`, `products(query:"status:active …")`).
   Um produto só pode pertencer a UMA página do D&VFly — vincular um produto já usado por
   outra página é recusado nomeando a página.
2. **Publicar** grava por loja: `sections/dvfly-p-<pageId>.liquid` (fragmento compilado dentro
   de `{% raw %}` + schema mínimo) e `templates/product.dvfly-<pageId>.json` = **todas as seções
   do `product.json` do tema** (preço, variantes, comprar continuam) + a nossa, **abaixo** por
   padrão ou **acima** (`Page.productContentAbove`). Depois, `productUpdate(templateSuffix:
   "dvfly-<pageId>")` em cada produto vinculado da loja.
3. **Vincular/desvincular com a página no ar vale na hora** (`applyLinkNow`); fora do ar,
   vale na próxima publicação — e a interface diz qual dos dois.
4. **Despublicar** = devolver os produtos ao modelo padrão (`releaseProducts`: só os que ainda
   apontam para o NOSSO sufixo — um produto que o lojista moveu para outro modelo não é
   tocado). Os arquivos ficam no tema; republicar é instantâneo.
5. **Excluir a página** = despublicar + `themeFilesDelete` do template e da seção (I3).
6. "Ver no ar" abre a URL do primeiro produto vinculado; sem produto vinculado numa página no
   ar, fica cinza com o motivo ("Vincule um produto…").
7. Canvas: placeholder "Seções de produto do tema" no lado escolhido, clicável para abrir as
   Configurações.

Verificado ao vivo em megakciok.shop (produto `pinkjuice`): a URL do produto passou a
renderizar nosso conteúdo **e** as seções do tema; desvincular devolveu o produto na hora;
no fim, `templateSuffix` null e zero arquivos `dvfly` no tema.

### Modo leve (Configurações da página → Modo leve) — 22/09

Terceiro jeito de publicar uma página de produto, feito para landing page que traz tudo o que
precisa (imagens, preço, botão de compra dentro do HTML): `Page.bareLayout`. O template vira
`{ layout: "theme.dvfly", sections: { dvfly }, order: ["dvfly"] }` — **só a nossa seção**, no
mesmo layout mínimo que as páginas normais sem cabeçalho já usam (`layout/theme.dvfly.liquid`:
`content_for_header` + `content_for_layout`, nada mais). Desde 22/09 à noite, uma página leve
**com herói** ganha um layout próprio, `layout/theme.dvfly-<id da página>.liquid`: o mesmo
layout mínimo com o `<link rel="preload">` do herói **antes** do `content_for_header` (a
Shopify transmite a resposta em duas partes cortadas nessa tag e transforma os preloads da
primeira em cabeçalhos `Link`/103 Early Hints — o herói começa a baixar antes do HTML chegar).
O layout é gravado antes do template que o nomeia (a Shopify valida o `layout` contra os
arquivos que o tema já tem) e sai junto com o template e a seção quando a página é
excluída. Nada do `product.json` do tema
sobrevive: nem as seções, nem o layout do tema, nem o CSS/JS que o `theme.liquid` carrega em
toda página. O que continua: o `<head>` da Shopify (pixels, apps embutidos como o formulário
COD, que entram pelo `content_for_header`).

Por que existe: medido na primeira LP no ar (snevy.co, 21/09), o layout do tema — mesmo sem
cabeçalho e rodapé — trazia **9 pedidos e ~21 KB gzip** de CSS/JS (global.js, base.css,
animations, search, modal…) mais ~10 KB de CSS inline, para uma página que não usava nada
disso. O modo "sem cabeçalho e rodapé" mantém esse custo de propósito (as seções de produto do
tema precisam dele); o modo leve não tem seções do tema, então não tem por que pagar.

Regras: só vale para o tipo produto (a publicação ignora o campo em página normal; o valor
fica gravado para a página que virar produto depois). Ligado, "Posição do conteúdo" e
"Mostrar cabeçalho e rodapé" ficam visíveis, cinza, com o motivo — não somem. Desligar de novo
recompõe a partir do `product.json` do tema (a cópia leve não tem seção do tema para
preservar). Exportar/importar e duplicar levam a configuração junto. Migração
`20260922100000_pagina_leve` (verificada em Postgres 16 de verdade e em SQLite).

**É o padrão desde 22/09** (`20260922130000_leve_por_padrao`): página de produto nasce leve e
página normal nasce sem cabeçalho/rodapé — e as que já existiam foram viradas também, a
pedido ("todas as páginas o mais leves possível"). Vale na próxima publicação de cada uma; o
editor mostra o estado, e cada página pode religar o tema na sua configuração. Importar um
arquivo antigo (sem os campos) nasce leve; um arquivo que diz `showChrome: true` ou
`bareLayout: false` é respeitado. Regras de desempenho de toda página: `docs/DESEMPENHO.md`.

Ainda na fila para o tipo produto: blocos que leem o produto do contexto (título, preço,
comprar — a seção é Liquid, então `{{ product.title }}` está ao alcance), "todos os produtos"
(sobrescrever o `product.json` padrão, como a referência faz), coleções (`collectionUpdate`)
e o webhook `themes/publish` para reescrever o template quando o tema muda.

### Pesquisa adicional sobre vínculo (15/09) — o que ficou confirmado e o que mudou

Fontes: as 241 páginas do PageFly (`help.pagefly.io`) + `shopify.dev` + Dawn/Horizon.

- **Referência (Page Assignment)**: ícone próprio no trilho, só em páginas de produto/coleção;
  modos "Todos os produtos" × "Custom" (busca exige o **título completo** do produto);
  contagem no dashboard com link; erro documentado **"A página precisa de ao menos 1 produto"**
  antes de salvar/pré-visualizar com fonte Auto; o editor deles renderiza o **primeiro**
  produto vinculado; "Custom product" num elemento não altera o vínculo. Nada documentado
  sobre um produto em duas páginas — a Shopify guarda UM sufixo por produto, então "a última
  publicada ganha" em silêncio. **Nós recusamos nomeando a página** (já implementado).
- **Composição deles**: por padrão o produto do tema fica **acima** do conteúdo deles; no OS 2.0
  o lojista esconde/reordena no editor de temas (o "produto em dobro" é conhecido). Nosso
  padrão é o mesmo (abaixo das seções do tema) com a opção "acima" — e a mesma liberdade no
  editor de temas.
- **Shopify — confirmado**: `templateSuffix` `null`/`""` = padrão; **template ausente cai no
  padrão, não dá 404** (404 só se o `product.json` padrão sumir); alternativos só existem no
  **tema publicado** (por isso escrevemos no MAIN); ids de seção no JSON só alfanuméricos e
  únicos **dentro** do template (`dvfly` ✓); `{% schema %}` fora do `{% raw %}` ✓; **sem
  `presets`** a seção não pode ser adicionada nem removida pelo editor de temas (só escondida)
  — é o que queremos; `enabled_on.templates:["product"]` + `limit:1` **aplicados agora**;
  JSON do tema pode ter **vírgula sobrando** (tolerado desde 2024-10) — parse ajustado.
- **Seção principal não é sempre `main-product`** (Horizon usa `product-information`) — por
  isso copiamos TODAS as seções em vez de procurar uma; grupos de header/footer moram no
  layout, não no `product.json` — vêm de graça.
- **SEO**: título, description e canonical saem do layout a partir do recurso — um template
  alternativo **não muda a URL nem o canonical** do produto.
- **Pré-visualizar sem vincular**: `/products/<qualquer>?view=<sufixo>` renderiza o template
  alternativo — candidato a "Pré-visualizar no tema" (fila).
- Sem confirmação oficial: teto de 25 caracteres do nome da seção (fonte terceira; mantido
  por segurança), comprimento máximo do sufixo (usamos o cuid minúsculo, sem pontos —
  pontos são reservados para templates contextuais).

## Página de produto — plano original (mantido como registro)

O que o dono descreveu: *"ao vincular, cria um modelo próprio para aquele produto, sem
danificar outros modelos"*. Em termos Shopify: um **template alternativo de produto** +
`templateSuffix` no produto.

Provado na loja: `products { templateSuffix }` lê normal (escopo ok); `themeFilesUpsert`
aceita qualquer `templates/product.*.json`.

Plano de implementação (próxima entrega):

1. Página com tipo **Produto** ganha, por loja, uma lista de produtos vinculados
   (`ProductLink { pageId, storeId, productGid, productTitle }` + busca de produtos na UI).
2. Publicar grava por loja:
   - `sections/dvfly-p-<pageId>.liquid` — o fragmento compilado da página, embrulhado em
     `{% raw %}` (o HTML do autor pode conter `{{ … }}`), com schema mínimo.
   - `templates/product.dvfly-<pageId>.json` — nossa seção em cima e a seção
     `main-product` DO TEMA embaixo, para a página continuar **comprável** (preço, variantes,
     comprar). Quando existirem blocos de produto no editor (preço, botão comprar), a seção
     do tema vira opcional.
3. `productUpdate(templateSuffix: "dvfly-<pageId>")` em cada produto vinculado; desvincular
   volta a `null`. Nenhum outro modelo do tema é tocado — exatamente o comportamento pedido.

Riscos conhecidos: HTML do autor contendo `{% endraw %}` quebraria a seção (recusar no
compilador com finding); temas sem seção `main-product` com esse nome (ler o
`templates/product.json` do tema e reaproveitar o tipo da seção principal).

## Postagem de blog — plano

Artigos têm `body` como páginas (`article.content`) e também `templateSuffix`. O blog
"Novidades" da loja está acessível pela API. Mesmo desenho da página normal:
`templates/article.dvfly-solo.json` + seção com `{{ article.content }}`. Fica depois do
tipo produto.

## Limitações honestas de hoje

- Imagem de compartilhamento social (og:image) e o toggle de carregamento preguiçoso ainda
  não estão nas Configurações — anotados como próximos itens.
- O modelo `dvfly-solo` é compartilhado por todas as páginas sem cabeçalho/rodapé (é um só
  por tema, de propósito — o conteúdo vem de `page.content`, então não precisa de um
  modelo por página).
