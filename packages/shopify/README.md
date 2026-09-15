# `@dvfly/shopify`

Cliente da Admin API, sessão (ID token, token exchange, HMAC), publicação de páginas,
templates de produto e **deploy multi-loja**.

## Como o app entra numa loja

O caminho normal é a **instalação gerenciada pela Shopify**: a loja instala o app, o admin
abre o App URL com um **ID token** (JWT HS256 assinado com o client secret), e o app troca esse
token por um **access token offline** da loja:

```
POST https://{loja}.myshopify.com/admin/oauth/access_token
  grant_type=urn:ietf:params:oauth:grant-type:token-exchange
  subject_token=<ID token>, requested_token_type=…offline-access-token
→ { access_token, scope, expires_in? }
```

`session.ts` faz as três coisas: `verifySessionToken` (assinatura em tempo constante, `exp`,
`nbf`, `aud`, `iss` × `dest`, 10 s de tolerância), `exchangeToken` e `verifyWebhookHmac`
(HMAC-SHA256 do corpo bruto). O token offline vai para o banco do app (`Store.accessToken`) e
é o que o `ShopifyClient` usa dali em diante.

Para lojas da **própria organização**, em desenvolvimento, existe o **client credentials
grant** (`client_id` + `client_secret` → token de curta duração): o `ShopifyClient` o cacheia,
renova um minuto antes de expirar e compartilha a requisição em voo entre chamadas
concorrentes. Não vale para lojas de terceiros.

## Deploy multi-loja

É a operação que o negócio realmente faz: constrói uma vez, valida na loja de teste, manda para
as de produção.

```ts
const result = await deployPage(lojas, { title, handle, body: fragmento }, {
  publish: false,          // padrão: cai como rascunho
  allowProduction: false,  // trava obrigatória, ver abaixo
  existingIds,             // id lembrado por loja → renomear não duplica
});
```

| Decisão | Porquê |
|---|---|
| **Lojas são independentes** | Uma falhar não impede as outras, e o resultado diz exatamente quais passaram |
| **Upsert pela id lembrada** (handle só como fallback) | Publicar duas vezes gera **uma** página, não duas — mesmo depois de renomear a URL |
| **Produção exige `allowProduction: true`** | "Publicar em todas" nunca fica a um clique distraído de distância |

`deployProductPage` faz o mesmo para **páginas de produto**: escreve no tema principal um
modelo `templates/product.dvfly-<id>.json` (as seções do próprio tema + a nossa, acima ou
abaixo) e a seção `sections/dvfly-p-<id>.liquid`, e aponta cada produto vinculado
(`templateSuffix`). Um produto que recusa (excluído desde o vínculo) não derruba a loja: o
modelo fica, os outros produtos entram, e o recusado é nomeado. Ao republicar, a base é o
modelo **como o lojista o deixou** no editor de temas — só a nossa seção é garantida.

## Verificado contra loja real

| O quê | Resultado |
|---|---|
| Smoke ponta a ponta — HTML do autor → compilador → página na Shopify | ✓ 3,7 KB publicados em ~1 s |
| Idempotência — dois deploys do mesmo handle | ✓ mesmo id, não duplicou |
| Página de produto — modelo + seção + `templateSuffix`, e a limpeza ao excluir | ✓ (flow19/flow22 em `docs/PROGRESSO.md`) |

```sh
cd packages/shopify
SHOP=... CLIENT_ID=... CLIENT_SECRET=... npm run smoke
```

O smoke publica como **rascunho** e apaga o que criou (`KEEP=1` para manter).

## Arquivos

```
src/client.ts     GraphQL com access token ou client credentials, cache, retry em 429, aviso de versão, erros tipados
src/session.ts    ID token (verificar/assinar), token exchange, HMAC de webhook
src/pages.ts      pageCreate/Update/Delete/get/findByHandle/upsert por id
src/products.ts   busca de produtos, templateSuffix (vincular/soltar só o que é nosso)
src/templates.ts  templates do tema: dvfly-solo (sem cabeçalho/rodapé) e um modelo por página de produto
src/deploy.ts     Deploy multi-loja (páginas e modelos de produto), com trava de produção
src/constants.ts  Constantes que o cliente (browser) também pode importar
bin/smoke.ts      Teste ponta a ponta contra loja real
test/             42 testes (node:test): client, pages, session, templates
```

## Nota sobre TypeScript

O Node roda estes arquivos com remoção de tipos, que **não suporta parameter properties**
(`constructor(private x)`). Campos são declarados e atribuídos explicitamente.
