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

## Página de produto — plano (provado por partes, falta montar)

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
