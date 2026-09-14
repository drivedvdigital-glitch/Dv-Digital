# `@dvfly/shopify`

Cliente da Admin API, publicação de páginas e **deploy multi-loja**.

## Por que client credentials

O D&VFly age só em lojas da própria organização, e a Shopify tem um grant exatamente para isso:

```
POST https://{loja}.myshopify.com/admin/oauth/access_token
  grant_type=client_credentials, client_id, client_secret
→ { access_token, expires_in }
```

Com ele **não existe token no admin da Shopify** — pede-se um de curta duração quando precisa. É o
que torna o multi-loja simples: uma instância guarda credenciais de N lojas e publica em todas, sem
OAuth e sem armazenamento de sessão.

O `ShopifyClient` cacheia o token e renova um minuto antes de expirar. Chamadas concorrentes
compartilham a mesma requisição em voo — publicar dispara várias queries de uma vez, e sem isso
cada uma criaria o próprio token.

## Deploy multi-loja

É a operação que o negócio realmente faz: constrói uma vez, valida na loja de teste, manda para as
de produção.

```ts
const result = await deployPage(lojas, { title, handle, body: fragmento }, {
  publish: false,          // padrão: cai como rascunho
  allowProduction: false,  // trava obrigatória, ver abaixo
});
```

Três decisões dentro disso:

| Decisão | Porquê |
|---|---|
| **Lojas são independentes** | Uma falhar não impede as outras, e o resultado diz exatamente quais passaram |
| **Upsert por handle** | Publicar duas vezes gera **uma** página, não duas. A duplicação do concorrente (pesquisa 3.3) é a ausência disso |
| **Produção exige `allowProduction: true`** | "Publicar em todas" nunca fica a um clique distraído de distância |

## Verificado contra loja real

| O quê | Resultado |
|---|---|
| Smoke ponta a ponta — HTML do autor → compilador → página na Shopify | ✓ 3,7 KB publicados em ~1 s |
| Idempotência — dois deploys do mesmo handle | ✓ mesmo id, não duplicou |

```sh
cd packages/shopify
SHOP=... CLIENT_ID=... CLIENT_SECRET=... npm run smoke
```

O smoke publica como **rascunho** e apaga o que criou (`KEEP=1` para manter).

## Arquivos

```
src/client.ts   Token via client credentials, cache, GraphQL, erros tipados
src/pages.ts    pageCreate/Update/Delete/get/findByHandle/upsert
src/deploy.ts   Deploy multi-loja, com trava de produção
bin/smoke.ts    Teste ponta a ponta contra loja real
```

## Nota sobre TypeScript

O Node roda estes arquivos com remoção de tipos, que **não suporta parameter properties**
(`constructor(private x)`). Campos são declarados e atribuídos explicitamente.
