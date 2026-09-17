# Configuração e mecanismos — código × Shopify × PageFly

> **Auditoria de 15/09/2026.** Três levantamentos cruzados num documento só: (1) leitura de
> **todo o código** do repositório, arquivo por arquivo; (2) a documentação oficial da
> Shopify em `shopify.dev`, na versão de setembro de 2026; (3) as 241 páginas da central de
> ajuda do PageFly, lidas de novo com a pergunta "que mecanismo está por trás disto?".
> Objetivo: configurar o app da melhor forma antes de ele sair da loja de teste.
>
> Complementa `PESQUISA_PAGEFLY.md` (funcionalidades) e `ARQUITETURA.md` (decisões). Onde os
> dois estavam desatualizados em relação ao código, está dito aqui — e no ARQUITETURA há um
> aviso apontando para cá.

---

## 0. Resumo executivo

**O que a auditoria encontrou de mais grave** (todos com arquivo:linha na seção 3):

1. **Nenhuma rota autentica.** O app embutido carrega o App Bridge mas não verifica o ID
   token. Quem tiver a URL do túnel tem um admin de todas as lojas registradas. Hoje o que
   protege é a URL aleatória e efêmera do `trycloudflare` — e só isso.
2. **O segredo do app era copiado em texto puro em cada linha de `Store`**, e servia de
   fonte primária de credenciais (qualquer `dev.db` = publicar em todas as lojas).
3. **O `.env` só chegava ao processo por efeito colateral** do cliente Prisma gerado.
4. **Publicar buscava a página por handle**: renomear a URL criava uma segunda página no
   ar e o app esquecia a primeira. Excluir na lista deixava a página viva na loja.
5. **A versão da API estava fixa no código** (`2026-07`) sem forma de trocar — e a Shopify
   aposenta cada versão ~12 meses depois; a `2025-10` morre em 16/10/2026.
6. Sem tratamento de limite de requisições (429/THROTTLED), sem `build`/`start` na raiz
   (caminho de produção nunca rodado), `allowedActionOrigins` com curinga indo pro build.

**O que foi corrigido** (seção 4 + entrega seguinte no mesmo dia): **todos os seis**. O item 1
virou a camada de instalação (`app/app/lib/auth.server.ts` + `packages/shopify/src/session.ts`):
ID token verificado em toda rota, instalação gerenciada pela Shopify com token exchange,
`/bounce`, webhooks com HMAC, `shopify.app.toml` — passo a passo em `docs/INSTALACAO.md`.
O que resta é o teste do ciclo completo **dentro do admin real** ao hospedar (o que se prova
daqui é com tokens assinados pelo segredo real — flow21).

**As duas descobertas de plataforma que mudam configuração:**

- A Shopify documenta o `themeFilesUpsert` como exigindo **"write_themes e uma isenção
  concedida pela Shopify"**. Para nós funciona porque o app é da própria organização (provado
  ao vivo em 14/09), mas é risco de plataforma registrado — o caminho sancionado (theme app
  extension com app block) fica como plano B documentado.
- **Um único app no Dev Dashboard serve todas as lojas da organização** com o client
  credentials grant; os scopes vêm da **versão do app** publicada por `shopify app deploy`
  (arquivo `shopify.app.toml`), não do pedido de token. O arquivo está na raiz do
  repositório desde 15/09 (`docs/INSTALACAO.md` diz como publicá-lo).

**Do PageFly, o que mais vale**: eles precisam de uma **Theme App Extension obrigatória**
(app embed) para o JS dos elementos funcionar, escrevem `layout/theme.pagefly.liquid` e um
bloco `pagefly` no `locales/en.default.json`, e ao trocar de tema **republicam tudo em
segundo plano**. Nós não temos nada disso por construção: o runtime sai inline com a página,
só quando um bloco pede; a página vive em `page.body`. Continua sendo a vantagem estrutural.

---

## 1. Como o PageFly funciona por dentro — e o que isso decide para nós

Lido nas 241 páginas da central de ajuda (fonte: `help.pagefly.io/*.md`). Só mecanismos; nada
de código ou texto deles entra no produto.

### 1.1 Modelo de publicação por tipo

| Tipo | Objeto na Shopify | Mecanismo |
|---|---|---|
| Regular | `Page` + template `page.pf-xxxx` | URL sempre `/pages/…`; URL editável |
| Home | substitui o `index` do tema | despublicar devolve a home do tema |
| Produto / Coleção | template `product.pf-xxxx` / `collection.pf-xxxx` atribuído | **"Todos os produtos" = sobrescreve o template padrão do tema** (a desinstalação manda restaurar `product.liquid` de "versões anteriores"); **"Custom" = `templateSuffix` por produto** |
| Blog post | `Article` + template | handle único por artigo; SEO/autor/tags editados no artigo da Shopify |
| Password | template de senha do tema | não esconde header/footer |
| Saved section | app block "PageFly section" no editor de temas | instâncias sincronizadas; "Unsynced section" solta uma cópia |

- Todas as páginas saem como **template JSON**; a partir do 1.001º (limite da Shopify), como
  Liquid. O "Nome do modelo" `pf-<pageId>` é o sufixo — é o que o relatório 13 viu.
- Estados: só **Publicado / Despublicado**. Salvar grava no banco deles; publicar empurra.
  "Ver ao vivo" cinza = não publicada.
- Excluir vai para a **Lixeira por 30 dias**. Auto Backup (não salvo) fica **no navegador**;
  o histórico de versões guarda **50 salvamentos manuais**.

### 1.2 O que eles escrevem no tema (documentado nas páginas de erro e desinstalação)

- `layout/theme.pagefly.liquid` (layout "simplificado" — o equivalente do nosso
  `theme.dvfly.liquid`);
- bloco `"pagefly": {…}` em `locales/en.default.json` (strings dos elementos Shopify
  renderizadas via `| t`);
- templates JSON por página; arquivos Liquid com `pagefly` no nome; e, no legado, código
  dentro do `theme.liquid`;
- imagens de seção salva como arquivo `…-PF_DO_NOT_DELETE` em Files;
- **Theme App Extension obrigatória** ("PageFly Theme Extension"): sem ela, Accordion/Tabs
  não funcionam — o runtime vem do app embed, não da página. Publicar liga a extensão
  sozinho; **trocar de tema exige reativar** e dispara uma **republicação em segundo plano**
  de todas as páginas (com aviso de que "muitas páginas podem bater no limite da API").
- Só o **tema publicado** carrega as páginas; preview de tema não funciona.

**Nós:** três arquivos fixos e idempotentes (`layout/theme.dvfly.liquid`,
`sections/dvfly-page.liquid`, `templates/page.dvfly-solo.json`), escritos só quando uma
página desliga o cabeçalho/rodapé; conteúdo em `page.body`; runtime inline e só quando
usado. O que falta do nosso lado é o **inventário** desses arquivos (I3) e a remoção —
seção 5.

### 1.3 Elementos que dependem da Shopify — como eles fazem

- Tudo é **Liquid no servidor + AJAX de carrinho + formulários nativos**; nenhuma Storefront
  API documentada. Product Details renderiza um `{% form 'product' %}`; Add to cart usa
  `/cart/add.js` e precisa de um "hook" no tema para a gaveta atualizar (o "Theme Helper");
  Contact form = `/contact`; Customer form = cadastro nativo com tags; Search = `/search`.
- **Product source Auto/Custom** (Auto = produto do contexto do template; em página Regular
  é forçado a Custom); "só funciona ao vivo" para paginação, Liquid, sticky, parallax.
- **Product list: 50 por carga**, limite nomeado como da Shopify — o mesmo que já adotamos.
- Analytics deles = **Web Pixel** da Shopify (`write_pixels` + `read_customer_events`),
  sem script no tema. A/B = **redirect no cliente** (`pf_prevent_redirecting` para o dono),
  variante num arquivo de tema separado. Localização por mercado = **um arquivo com
  roteamento por mercado dentro** (e por isso não convive com A/B).
- Mídia: uploads vão para **Files da Shopify** (20 MB; 2 MB no upload do editor);
  fontes próprias viram WOFF2 em Files e só entram via Global Styles.
- **"Override Theme Styling"** por elemento = `!important` em todas as declarações. É a
  resposta deles ao conflito com o CSS do tema; a nossa é o escopo `dvf-` + canvas com as
  variáveis reais do tema.

### 1.4 Tabela eles × nós

| Mecanismo | PageFly | D&VFly | Estado |
|---|---|---|---|
| Vínculo página↔loja | template `pf-xxxx` + suffix | `page.body` (regular) / template por página (produto, plano) | ✅ / 🔨 |
| Runtime JS | app embed obrigatório | inline, só quando um bloco pede | ✅ |
| Header/rodapé off | `theme.pagefly.liquid` | `theme.dvfly.liquid` + suffix `dvfly-solo` | ✅ provado ao vivo |
| Troca de tema | republicação em massa em background | `page.body` não depende do tema; só o `dvfly-solo` precisa reescrita | ⬜ webhook `themes/publish` |
| Limite de tamanho | 256 KB (template) | 64 KB (body da `Page`) e 256 KB — **verificados no publish** | ✅ hoje |
| Renomear URL | erro "handle já usado" | atualiza a mesma página por id, redirect automático | ✅ hoje |
| Excluir | lixeira 30 dias | tira do ar nas lojas, rascunho fica na Shopify | ✅ hoje (sem lixeira) |
| Limite de API | "muitas páginas podem falhar" | retry com espera calculada (429 / THROTTLED) | ✅ hoje |
| Analytics | Web Pixel | ❌ decidido | — |
| Mídia | Files da Shopify | por URL; biblioteca via `stagedUploadsCreate`+`fileCreate` na fila | ⬜ |
| SEO | no artigo/página da Shopify | metafields `global.title_tag/description_tag` na fila | ⬜ |
| Imagem social | campo nativo (Regular) | `page` não tem imagem: metafield + `og:image` na seção | ⬜ |

---

## 2. O que a Shopify exige e oferece (docs oficiais, set/2026)

### 2.1 Versão da API
- Trimestral (`AAAA-MM`), cada versão vale **≥12 meses**. Hoje: `2025-10` (expira
  **16/10/2026**), `2026-01`, `2026-04`, **`2026-07` (latest)**, `2026-10` (candidata).
- Versão aposentada: a Shopify **"cai para frente"** e responde com a mais antiga
  suportada — o único sinal é o header `X-Shopify-API-Version`. **O cliente agora compara e
  avisa** (`packages/shopify/src/client.ts`).
- Configuração: `SHOPIFY_API_VERSION` no `.env` (validada no formato), default `2026-07`.

### 2.2 Client credentials grant
- `POST /admin/oauth/access_token` com `grant_type=client_credentials`; `expires_in` **sempre
  86399** (24 h); **não há refresh token** — pede outro. Só para **apps do Dev Dashboard**
  sobre lojas **da mesma organização** (`shop_not_permitted` fora disso).
- **Os scopes não vão no pedido**: vêm da versão do app publicada (`shopify app deploy` a
  partir do `shopify.app.toml`, chaves `client_id`, `application_url`, `embedded`,
  `[access_scopes] scopes`, `[auth] redirect_urls`, `[webhooks]`).
- Rotação de segredo existe no Dev Dashboard; o antigo continua válido até ser revogado.
- Consequência: **uma credencial só para todas as lojas** — guardar o par por loja é
  redundância, não necessidade.

### 2.3 App embutido
- Autenticação = **ID token** (`shopify.idToken()`, vale **1 minuto**), verificado no backend
  com **HS256 e o client secret**, claims `exp` futuro, `nbf` passado, `aud` = client id,
  `iss`/`dest` mesmo host da loja. O interceptor de `fetch` do App Bridge põe o header
  `Authorization` sozinho em chamadas ao próprio domínio.
- App Bridge: `<meta name="shopify-api-key">` + script **antes de qualquer outro**
  (adicionado o meta hoje; o `data-api-key` continua). CSP `frame-ancestors` dinâmico por loja
  (já fazemos). Embutir **não é obrigatório** para app da própria organização.

### 2.4 Webhooks
- Compliance (`customers/data_request`, `customers/redact`, `shop/redact`) **só é
  obrigatório para apps da App Store**. Recomendado mesmo assim, junto com
  `app/uninstalled` (e `themes/publish` para o nosso caso do `dvfly-solo`).
- HMAC-SHA256 do **corpo bruto** com o client secret, header `X-Shopify-Hmac-SHA256`; 401 se
  falhar; responder em <5 s; assinatura no TOML (`[[webhooks.subscriptions]]`).

### 2.5 Páginas, artigos, produtos
- `pageCreate/pageUpdate`: `title`, `body` (HTML), `handle`, `isPublished`, `publishDate`,
  `templateSuffix`, `metafields`, `redirectNewHandle`. **`body` ≤ 64 KB** (coluna TEXT do
  MySQL — "Description can't be larger than 64 kilobytes").
- SEO: metafields `global.title_tag` / `global.description_tag` (`single_line_text_field`).
- `articleCreate` exige `author`; `blogId`; `templateSuffix` em artigos e blogs.
  `productUpdate.templateSuffix`, `CollectionInput.templateSuffix` — o plano de produto está
  correto.

### 2.6 Temas
- `themeFilesUpsert`: **"requer write_themes e uma isenção da Shopify"** (texto da doc);
  a página legada restringe a isenção a apps da App Store. Funciona para nós (app da
  organização) — risco registrado. Máx. **50 arquivos por chamada**; Liquid ≤ 256 KB; JSON
  template ≤ 512 KB; **um layout precisa de `content_for_header` e `content_for_layout`**
  (o nosso tem). JSON template: até 25 seções; `layout: false` = **não editável no editor de
  temas** (por isso usamos layout próprio, não `false`). Máx. 1.000 templates JSON.
- Caminho sancionado sem escrever no tema: **theme app extension** (app blocks, 30 blocks,
  100 KB de Liquid) — não substitui layout, então "sem cabeçalho" continua exigindo arquivo.
- `{% raw %}` para HTML de autor com `{{`/`{%` dentro de seção Liquid (plano de produto).

### 2.7 Limite de requisições
- Leaky bucket: **100 pontos/s** (Standard), 200 (Advanced), 1.000 (Plus); mutation = 10;
  **≤ 1.000 pontos por consulta**. Estouro = HTTP 429 ou 200 com `errors[].extensions.code =
  "THROTTLED"` e `extensions.cost.throttleStatus`. **Implementado hoje** no cliente: retry
  com espera = pontos que faltam ÷ taxa (ou `Retry-After`), no máximo 3 tentativas.

### 2.8 Mídia e imagem social
- Biblioteca: `stagedUploadsCreate` → upload → `fileCreate` (`write_files`); `fileStatus`
  assíncrono; ler `image { url width height }` depois de `READY`.
- O objeto Liquid `page` **não tem imagem**; `page_image` cai na imagem social da loja.
  og:image por página = metafield próprio + `<meta property="og:image">` na nossa seção.

---

## 3. O que o código faz de verdade — auditoria (resumo dos 30 pontos)

Estado: ✅ corrigido nesta entrega · 🟡 parcial · ⬜ pendente (ver seção 5).

| # | Achado | Onde | Estado |
|---|---|---|---|
| 1 | Nenhuma rota verifica ID token/HMAC; `?shop=` sozinho dispara pedido de token para qualquer domínio myshopify | todas as rotas; `app.tsx:30` | ✅ `requireShop` em toda rota; instalação por token exchange; `/bounce`; webhooks HMAC (docs/INSTALACAO.md) |
| 2 | Segredo do app copiado em cada `Store`, banco como fonte primária | `schema.prisma:17-18`, `shopify.server.ts` | ✅ colunas opcionais; a instalação por token guarda só o access token offline da loja; o caminho de dev (client credentials) só copia o par quando o `.env` não o tem |
| 3 | `.env` carregado só pelo Prisma gerado | — | ✅ `config.server.ts` carrega e valida |
| 4 | Versão da API fixa `2026-07`, sem forma de trocar; sem checagem do header servido | `client.ts:16` | ✅ `SHOPIFY_API_VERSION` + aviso de fall-forward |
| 5 | `allowedActionOrigins: ['*.trycloudflare.com']` incondicional | `react-router.config.ts` | ✅ só fora de produção / `DVFLY_DEV_ORIGINS` |
| 6 | Sem tratamento de 429/THROTTLED; `JSON.parse` sem try | `client.ts` | ✅ |
| 7 | Cliente e token novos a cada requisição (N lojas × M páginas no lote) | `shopify.server.ts`, `deploy.ts` | ✅ cache por loja, fábrica no deploy |
| 8 | Publicar busca por handle → renomear duplica; `shopifyGid` guardado nunca usado | `pages.ts`, editor action | ✅ publica por id, handle é fallback, `first:5` exato |
| 9 | Excluir na lista deixa a página no ar | `app._index.tsx` | ✅ despublica antes; rascunho fica na Shopify |
| 10 | Lista publica em loja de produção sem a confirmação que o editor exige | `app._index.tsx` | ✅ recusa com o caminho |
| 11 | Teto de 256 KB só no CLI; body de 64 KB não conhecido | `bin/build.ts` | ✅ `limits.ts` + checagem no publish + barra de status |
| 12 | Fontes do tema sempre da primeira loja; resposta sem teto | `api.theme-style.tsx` | ✅ por `?shop=`, cache por loja, 512 KB |
| 13 | `publishedAt` nunca atualiza ao republicar | editor action | ✅ |
| 14 | `postMessage` sem checar `event.source` nos dois lados | editor + bridge | ✅ |
| 15 | Preview compila entrada sem limite | `api.preview.$id.tsx` | ✅ 413 acima de 2 MB |
| 16 | ErrorBoundary imprime stack em qualquer ambiente | `root.tsx` | ✅ só fora de produção |
| 17 | Sem `build`/`start`/`typecheck` na raiz; build nunca rodado | `package.json` | ✅ scripts + build verificado |
| 18 | `dvfly-solo` e regex de domínio duplicados; `SOLO_SUFFIX` num módulo com o client | vários | ✅ `constants.ts`, `shared.ts`, `SHOP_DOMAIN` exportado |
| 19 | Pacote shopify sem nenhum teste | `packages/shopify` | ✅ 42 testes (token, retry, versão, upsert por id, deploy isolado, sessão/HMAC, templates de produto) |
| 20 | Arquivos do tema escritos sem inventário nem remoção (I3) | `templates.ts` | 🟡 o modelo de produto é removido ao excluir a página e ao trocar de tipo; falta o inventário e a remoção dos 3 arquivos `dvfly-solo` (P1) |
| 21 | Sem webhook `app/uninstalled` (loja desinstalada continua registrada) | — | ✅ `/webhooks/app` + `/webhooks/compliance` |
| 22 | `Page.handle` não é único; `freeHandle` só no import | `schema.prisma` | ⬜ P1 |
| 23 | Sem `shopify.app.toml` — scopes só no painel | — | ✅ na raiz; `shopify app deploy` (docs/INSTALACAO.md) |
| 24 | Sem migrations (`db push` a cada start); provider sqlite fixo | `app/package.json`, schema | ⬜ P1 (hospedagem) |
| 25 | `INICIAR-DVFLY.cmd` faz `git pull` sem `--rebase` nem checar a branch; `start.mjs` duplica chaves no `.env` | scripts | ✅ checkout da branch + `pull --rebase` com erro explicado; chaves substituídas no lugar |
| 26 | `audit()` exportado e nunca usado no editor | `compiler.server.ts` | ⬜ P2 |
| 27 | Valores do vocabulário de estilo saem sem escape no `<style>` (`}` fecha o bloco) | `css.ts` | ⬜ P2 (mesma fronteira de confiança do bloco HTML) |
| 28 | `COMPILER_VERSION` '0.1.0' × `package.json` 0.0.0 | — | ⬜ P2 |
| 29 | Docs desatualizados (ARQUITETURA: dnd-kit, Postgres, `@shopify/shopify-app-react-router`, modelo de dados; READMEs) | `docs/`, `app/README.md` | 🟡 aviso no ARQUITETURA; README do app atualizado |
| 30 | `getPage`, `DeployTarget.accessDenied`, `Version.label` sem uso (`Page.pageType` passou a decidir o tipo de publicação) | vários | ⬜ P2 |

**Revisão geral de 15/09 (noite)** — quatro revisões independentes (segurança, publicação,
telas, docs × código) sobre tudo o que foi feito no dia. O que elas acharam e o que foi
corrigido, com a verificação, está em `docs/PROGRESSO.md` ("Revisão geral"). Os achados
que viraram linha aqui:

| # | Achado | Onde | Estado |
|---|---|---|---|
| 31 | `/bounce` aceitava `to=/\evil.com` (o parser de URL lê `/\` como `//`) e `</script>` no destino: redirect aberto que entregava o ID token, XSS refletido | `bounce.tsx` | ✅ destino parseado como URL e aceito só na mesma origem; JSON com `<` escapado; CSP `frame-ancestors`; marca `dv_bounced` (um salto, sem loop) |
| 32 | 401 lançado na lista/editor chegava ao App Bridge **sem** `X-Shopify-Retry-Invalid-Session-Request` (rotas sem `headers` export) — token expirado quebrava o salvar em vez de repetir | `app._index.tsx`, `app.pages.$id.tsx` | ✅ `passHeaders` (`lib/headers.ts`) nas três rotas |
| 33 | Loja desinstalada continuava alvo: `toStore` caía nas credenciais do app e a loja reaparecia em "Publicar em"; `storeUsable` sem uso | `shopify.server.ts`, telas | ✅ `clientFor` recusa com o motivo; checkbox e vínculo desabilitados explicando; lista marca "sem acesso" |
| 34 | `npm start` (`react-router-serve`) sem `trust proxy`: atrás de proxy TLS toda action daria 400 (CSRF do React Router); log imprimia `?id_token=` | `app/package.json` | ✅ `app/server.mjs` (`@react-router/express`, `trust proxy`, log só com o caminho); `DVFLY_DEV_ORIGINS` documentado como valor de **build** |
| 35 | Token na URL seguia em todo `Link` e em recargas; `expiresIn` do token ignorado (apps com token expirável quebrariam em 1 h) | `embedded.ts`, `auth.server.ts` | ✅ `shopSearch` mantém só `shop/host`; `forgetUrlToken` limpa a barra; `Store.tokenExpiresAt` + renovação ao abrir |
| 36 | Página publicada como Normal e trocada para Produto (ou o inverso) deixava a versão antiga no ar; `template:` ia para `pageUpdate` | `publish.server.ts`, editor | ✅ `deploymentKind` por deployment; `retireOtherKind` antes de publicar (depois do teto e da confirmação de produção); lojas retiradas nomeadas na mensagem |
| 37 | Um produto excluído entre vincular e publicar derrubava a loja inteira depois de escrever o tema (modelo órfão que o app não via) | `deploy.ts` | ✅ vínculo por produto tolerante; a loja registra o deployment e a mensagem nomeia o produto recusado |
| 38 | `stripJsonComments` apagava vírgulas **dentro de strings** ("Related, ]" virava "Related ]"); nome da seção partia emoji ao cortar em 25 | `templates.ts` | ✅ scanner que respeita strings; corte por code point |
| 39 | Republicar recompunha o modelo do `product.json` do tema, apagando o que o lojista tinha reordenado/ocultado no editor de temas (contra a promessa da tela) | `templates.ts` | ✅ o modelo existente é a base; só a nossa seção é garantida (muda de ponta quando "acima/abaixo" muda; posição no meio é do lojista) |
| 40 | Qualquer `input` no formulário do editor marcava "não salvo" — marcar uma loja em "Publicar em" **escondia o Publicar**; preview com erro (413) derrubava o editor com o trabalho não salvo | editor | ✅ sujo só para título e `[data-settings]`; resposta de preview sem `stats` vira aviso; publicação recusada depois de salvar avisa `saved` |
| 41 | Tokens/segredos das lojas iam inteiros no payload dos loaders (lista e editor) | `app._index.tsx`, `app.pages.$id.tsx` | ✅ loaders devolvem só `id/label/isProduction/unusable` |

---

## 4. O que esta entrega mudou (verificado)

- **`app/app/lib/config.server.ts`** — carrega `app/.env` explicitamente (`process.loadEnvFile`,
  sem dependência), valida `SHOPIFY_API_VERSION`, exige credenciais em produção, calcula as
  origens de dev.
- **`packages/shopify/src/client.ts`** — retry em 429 e THROTTLED com espera calculada;
  resposta não-JSON vira `ShopifyError`; aviso único quando a Shopify serve outra versão;
  `isNotFound`.
- **`packages/shopify/src/pages.ts` / `deploy.ts`** — `upsertPage(client, input, existingId)`
  atualiza pela id lembrada (fallback por handle, busca `first:5` com match exato);
  `deployPage` aceita `existingIds` e `clientFor` (fábrica com cache).
- **Editor** — passa as ids das publicações anteriores; recusa publicar acima de **64 KB**
  (o menor dos dois tetos) nomeando o limite; `publishedAt` atualiza; `postMessage` só do
  canvas; fontes do tema da loja aberta.
- **Lista** — excluir despublica nas lojas antes (rascunho fica na Shopify); publicar em massa
  em loja de produção é recusado com o caminho certo.
- **Raiz** — `npm run build`, `npm start`, `npm run typecheck`; `npm test` roda compilador +
  shopify (**66 testes**).
- **`.env.example`** documenta `SHOPIFY_API_VERSION`, `DVFLY_DEV_ORIGINS`, `NODE_ENV/PORT/HOST`.
- Verificação: typecheck limpo; 52 + 14 testes; flow18 8/8 (ciclo real em massa na loja,
  agora pela publicação por id) + flow17 7/7 + flow6 13/13 + flow14 + flow16; build de
  produção gerado; página ao vivo conferida (HTTP 200 + conteúdo) depois de tudo.

---

## 5. Plano de configuração

### P0 — antes de registrar qualquer loja de produção

**P0.1 Autenticação por ID token (App Bridge).** Desenho:
1. `root.tsx` já carrega o App Bridge com o client id (meta + `data-api-key`).
2. Novo `app/app/lib/auth.server.ts`: `requireShop(request)` lê `Authorization: Bearer
   <jwt>` (chamadas `fetch`/`useSubmit` — o App Bridge injeta) ou `?id_token=` (primeira
   navegação), verifica HS256 com o client secret e as claims (`exp`, `nbf`, `aud`, `iss`
   × `dest`), devolve o domínio da loja. 401 em qualquer falha.
3. Chamado em `app.tsx` (loader), nas actions/loaders de `app._index`, `app.pages.$id`,
   `api.preview.$id`, `api.theme-style`, `api.pages.$id.export`, `preview.$id`.
4. `ensureStore(shop)` passa a receber o domínio **verificado**, não o `?shop=`.
5. Navegações internas (`Link`) dentro do admin: o App Bridge reescreve para manter o token
   na primeira carga; a partir daí as chamadas de dados vão por `fetch` com header.
6. `DVFLY_AUTH=off` **só fora de produção**, para os fluxos Playwright e para abrir o app
   pelo túnel sem admin. Em produção a chave não existe.
   **Feito** (mesmo dia): `requireShop`/`installStore`, `/bounce`, `openWithToken` para
   links de nova aba, `DVFLY_AUTH=off` só fora de produção. Falta o teste dentro do admin
   real ao hospedar — `docs/INSTALACAO.md` diz o que observar.

**P0.2 Credenciais.** **Feito**: `clientId/clientSecret` viraram opcionais; lojas instaladas
guardam só o **access token offline delas** (`Store.accessToken`, com `tokenExpiresAt` quando
a Shopify o der expirável). O caminho de dev só copia o par para a linha quando o `.env` não
o tem. **Fechado em 16/09**: o token e o client secret vão para o banco **criptografados**
(AES-256-GCM, `secrets.server.ts`, chave em `DVFLY_TOKEN_KEY`), como a documentação de
hospedagem da Shopify exige; em produção o app não sobe sem a chave. Linhas antigas em texto
puro continuam sendo lidas e são re-lacradas na próxima instalação.

**P0.3 `shopify.app.toml` + `shopify app deploy`.** **Feito**: arquivo na raiz com
`client_id`, `embedded`, `[access_scopes] scopes = "write_content,write_themes,write_products"`
(write ⊃ read), `[auth] redirect_urls`, webhooks `app/*` e de compliance com URIs relativas.
Falta só o endereço público real antes do `shopify app deploy` (`docs/INSTALACAO.md`).

### P1 — antes de operar no dia a dia em várias lojas

- **P1.1 Webhook `themes/publish`**: tema publicado → reescrever `dvfly-solo` e os modelos
  de produto nas páginas que os usam. (`app/uninstalled` já existe: esquece o token e marca
  a loja como desinstalada; a linha e os deployments ficam, porque a página continua no ar
  na Shopify; entregas atrasadas anteriores a uma reinstalação são ignoradas.)
- **P1.2 Inventário do tema (I3)**: tabela `ThemeFile { storeId, themeId, path }` gravada
  em `ensureSoloTemplate`; `themeFilesDelete` na desinstalação/limpeza (já provado no
  `shopify-probe.ts`).
- **P1.3 `Page.handle` único** (`@@unique`) + `freeHandle` no editor.
- **P1.4 Hospedagem**: `NODE_ENV=production`, `PORT`, `HOST`, `DATABASE_URL` absoluto,
  `prisma migrate` em vez de `db push`, `node_modules` da raiz presente ao lado de `app/`
  (imports relativos entre pacotes). Postgres exige trocar o `provider` no schema (não é
  env). Log do servidor persistido (o ErrorBoundary já não mostra stack em produção).
- **P1.5 Documentação**: reescrever as seções 2, 4, 6 e 7 do `ARQUITETURA.md` para o que
  o código faz (sem dnd-kit, sem `@shopify/shopify-app-*`, modelo de dados
  Store/Page/Version/Deployment, `write_themes` na trilha A quando `showChrome=false`).

### P2 — higiene

`audit()` no editor; escape dos valores de estilo no `<style>`; `COMPILER_VERSION` lido do
`package.json` do compilador; remover `getPage`/campos sem uso ou usá-los (`accessDenied` na
mensagem de publicação); comitar os fluxos Playwright; o olho da árvore fora do `<button>` da
linha (HTML inválido: interativo dentro de interativo); testar arrastar linhas `<button
draggable>` no Firefox.

---

## 6. Variáveis de ambiente (estado final)

| Variável | Lida em | Obrigatória? | Default |
|---|---|---|---|
| `DATABASE_URL` | Prisma, `app/scripts/prisma-schema.mjs` | sim | `file:./dev.db` (relativo a `app/prisma/`). `postgres://…` no servidor — o provider do schema é escolhido por este valor |
| `DATABASE_URL_DIRECT` | `app/scripts/prisma-schema.mjs` (vira `directUrl`) | não | endereço direto do Postgres, para as migrations quando a conexão principal é por pooler (Neon, Supabase) |
| `DVFLY_TOKEN_KEY` | `config.server.ts` → `secrets.server.ts` | **sim em produção** | 32 bytes em base64 (`npm run gerar-chave`); criptografa `Store.accessToken` e `Store.clientSecret` em repouso (AES-256-GCM) |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | `config.server.ts` | **sim em produção**; em dev cai para a primeira `Store` | — |
| `SHOPIFY_API_VERSION` | `config.server.ts` (validada `AAAA-MM`) | não | `2026-07` |
| `DVFLY_DEV_ORIGINS` | `react-router.config.ts` — **no build**, não em tempo de execução | não | `*.trycloudflare.com` fora de produção; vazio em produção |
| `DVFLY_AUTH` | `config.server.ts` | não | `off` desliga o ID token **só fora de produção** (Playwright, localhost) |
| `DVFLY_ALLOWED_SHOPS` | `config.server.ts` | não | vazio = qualquer loja que a Shopify deixe instalar; lista de domínios `myshopify.com` separados por vírgula restringe `requireShop` (403) |
| `DVFLY_ACCESS_KEY` | `config.server.ts` → `access.server.ts` | não | senha de acesso: a loja instalada só usa o app depois que alguém digitar isto em `/liberar`; vale para aquela loja para sempre (`Store.authorizedAt`). Vazio = sem trava. Cinco erros por loja = pausa de 5 min |
| `NODE_ENV` | `db.server.ts`, config, RR config | `production` no host | — |
| `PORT` / `HOST` | `app/server.mjs` (`npm start`) | não | 3000 / todas |

Scripts (`SHOP`, `CLIENT_ID`, `CLIENT_SECRET`, `ADMIN_TOKEN`, `KEEP`) continuam com nomes
próprios em `packages/*/bin` — só para sondagem manual.

---

## 7. Fontes

- Shopify: `shopify.dev/docs/api/usage/versioning`, `…/usage/limits`,
  `…/apps/build/authentication-authorization/access-tokens/client-credentials-grant`,
  `…/authentication-authorization/session-tokens`, `…/security/set-up-iframe-protection`,
  `…/compliance/privacy-law-compliance`, `…/webhooks/subscribe/https`,
  `…/cli-for-apps/app-configuration`, `…/api/admin-graphql/latest/mutations/{pageCreate,
  pageUpdate, themeFilesUpsert, fileCreate, stagedUploadsCreate, productUpdate}`,
  `…/storefronts/themes/architecture/{templates/json-templates, layouts, limits}`,
  `…/storefronts/themes/troubleshooting/fix-64-kilobyte-limit-errors`,
  `…/apps/build/online-store/theme-app-extensions`, `…/apps/launch/distribution`.
- PageFly: `help.pagefly.io` — page-settings, what-type-of-pages, json-template-with-pagefly,
  switch-theme-process, cant-create-theme-pagefly-liquid, cant-create-locales-file,
  what-happens-if-i-uninstall-pagefly, saved-section, shopify-elements-* (product details,
  list, variant, add to cart, contact/customer form), enable-pagefly-analytics,
  how-to-create-a-b-testing-page, market-localization, page-size-limit,
  use-image-manager-to-upload-media-files, how-to-add-custom-font, global-styling-feature,
  elements-style-settings, cart-drawer-does-not-automatically-update.
- Código: leitura integral de `app/`, `packages/shopify/src`, `packages/compiler/src`,
  scripts e configs em 15/09/2026.
