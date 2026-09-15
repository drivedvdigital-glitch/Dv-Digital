# Instalar o D&VFly numa loja Shopify

> Guia de 15/09/2026, escrito a partir da documentação oficial em `shopify.dev` (lida na
> fonte, versão de setembro de 2026) e do que o código faz. Onde a doc é omissa, está dito.

## O que muda em relação a antes

Até aqui o app falava com as lojas pelo **client credentials grant** — que só funciona para
lojas **da nossa própria organização** no Dev Dashboard. Agora o app é **instalável**: a loja
instala pelo link, a Shopify pede as permissões, o app se configura sozinho na primeira
abertura. Nenhuma tela de "cadastrar loja", nenhuma credencial colada.

Como funciona por dentro (é o que o PageFly e todo app moderno fazem):

1. A Shopify abre o App URL dentro do admin com um **ID token** (`?id_token=`, JWT de 1 minuto
   assinado com o client secret do app).
2. O app verifica o token (assinatura HS256 + `exp`, `nbf`, `aud`, `iss`/`dest`) e sabe qual loja
   é — sem confiar em nenhum parâmetro solto.
3. Na primeira vez, troca esse ID token por um **access token offline** da loja
   (`POST /admin/oauth/access_token`, `grant_type=…token-exchange`) e grava em `Store`.
4. Toda chamada seguinte do navegador traz o token no header `Authorization` (o App Bridge
   faz isso sozinho no `fetch`); toda chamada à Admin API usa o access token da loja.
5. Desinstalou → webhook `app/uninstalled` → o app esquece o token.

## Passo a passo

### 1. O app no Dev Dashboard

Em `dev.shopify.com` → **Apps** → o app D&VFly (client id `90c1e96f…`, o mesmo do `.env`).

- **Versions → New version** (ou pelo CLI, abaixo): **App URL** = endereço público HTTPS
  onde o app roda (sem caminho, ex.: `https://dvfly.suaempresa.com`); **Embedded** ligado;
  **Scopes** = `write_content, write_themes, write_products`; **Webhooks API version** =
  `2026-07`; **Release**.
- **Distribution**: escolha **Custom distribution** (não dá para trocar depois). Informe o
  domínio `.myshopify.com` da loja; deixe marcado **Allow multi-store installs for one Plus
  organization** se as lojas forem de uma organização Plus; **Generate link** → é o **link de
  instalação**.

> **Limite honesto da Shopify:** distribuição custom vale para **uma loja**, ou para as lojas
> de **uma organização Plus**, ou para dev stores. Para instalar em lojas de terceiros sem
> relação entre si, cada uma precisa de um app custom próprio — ou o app vai para a **App
> Store** (revisão da Shopify, listagem, política de privacidade; sem cobrança obrigatória
> se o app é grátis). O código já cumpre os requisitos técnicos da App Store (ID tokens,
> App Bridge como primeiro script, CSP `frame-ancestors` por loja, webhooks de compliance
> com HMAC), com uma exceção registrada abaixo.

### 2. O `shopify.app.toml` (recomendado, com o Shopify CLI)

O arquivo na raiz do repositório é a configuração do app em texto: escopos, webhooks, URL.
Com o CLI, ele vira a versão do app:

```sh
npm install -g @shopify/cli@latest      # Node 22.12+
shopify app config link                 # liga o arquivo ao app do Dashboard (login no navegador)
# edite application_url e redirect_urls com o endereço público real
shopify app deploy                      # cria e libera a versão: escopos + webhooks valem em todas as lojas
```

Sem o CLI, tudo menos o `handle` pode ser feito na aba **Versions** do Dashboard (App URL,
escopos, versão dos webhooks); os webhooks de compliance também têm tela própria. Os
webhooks `app/uninstalled` e `app/scopes_update` só entram pelo TOML.

### 3. Hospedar o app

Requisitos da Shopify: **HTTPS público** com certificado válido (o admin abre o app num
iframe). Do nosso lado (`docs/CONFIGURACAO_E_MECANISMOS.md` §6):

```
NODE_ENV=production
SHOPIFY_CLIENT_ID=…          # obrigatórios em produção
SHOPIFY_CLIENT_SECRET=…
SHOPIFY_API_VERSION=2026-07  # opcional (default)
DATABASE_URL=file:/caminho/absoluto/dvfly.db
PORT=3000
```

```sh
npm run setup && npm run build && npm start
```

`npm start` sobe `app/server.mjs` (Express com `trust proxy`): atrás de qualquer proxy TLS o
servidor vê `http://` enquanto o navegador manda `Origin: https://…`, e sem isso o CSRF do
React Router recusaria toda action com 400. Opcional: `DVFLY_ALLOWED_SHOPS` (domínios
`myshopify.com` separados por vírgula) restringe quem pode abrir o app, além do que a
distribuição custom já restringe. `DVFLY_DEV_ORIGINS` é lido no **build**, não no host.

Toda tela exige o ID token em produção (`DVFLY_AUTH` é ignorado). Se o endereço público
mudar: edite `application_url` e `redirect_urls` no TOML e rode `shopify app deploy` de
novo — as URIs dos webhooks são relativas e seguem sozinhas.

### 4. Instalar na loja

Abra o **link de instalação** logado no admin da loja. A Shopify mostra as permissões
(`write_content`, `write_themes`, `write_products`) → **Instalar**. O admin abre o D&VFly;
nesse primeiro carregamento o app troca o ID token pelo access token da loja e a registra
(`Store.accessToken`, `installedAt`). A loja aparece em **Publicar em** no editor, como
**produção** (publicar nela pede a confirmação extra).

Para checar: a tela abre com a lista de páginas; o banco tem a linha em `Store` com
`accessToken` preenchido; publicar uma página de teste funciona.

### 5. Várias lojas

Cada loja instala pelo seu link (mesma organização Plus → mesmo link). O app é um só: as
páginas são autorais e publicam em N lojas de uma vez — é o fluxo de "validar na loja de
teste, mandar para as outras". Lojas da **nossa** organização continuam podendo ser
registradas pelo caminho antigo (client credentials) em desenvolvimento.

### 6. Desinstalar

Desinstalar pelo admin dispara `app/uninstalled`: o app esquece o token e marca a loja como
desinstalada; **nada é apagado na loja** — páginas continuam na Shopify, no ar se estavam no
ar (invariante I4), e é assim que as telas as mostram, com a loja marcada "sem acesso" (o
checkbox de "Publicar em" e o vínculo de produtos ficam desabilitados com o motivo) até
reinstalar. 48 h depois chega `shop/redact`, e a linha da loja é removida. A Shopify tenta
entregar um webhook por até 48 h: uma entrega atrasada de antes de uma reinstalação é
ignorada (comparação com `installedAt`).

## O que fica registrado como pendente

- **Teste com token real da Shopify.** A verificação do token, a troca e os webhooks foram
  testados com tokens assinados pelo segredo real e requisições HMAC reais (flow21), mas
  o ciclo completo *dentro do admin* só se prova instalando numa loja de verdade — é o
  primeiro passo ao hospedar. O que observar: a tela abre sem pedir nada; `Store` ganha
  `accessToken`; ao recarregar dentro do admin, a página passa pelo `/bounce` e volta.
- **Token offline expirável.** Apps **públicos** (App Store) são obrigados a usar token
  offline expirável até 01/01/2027; apps custom não. Se o app for configurado assim, o
  código já guarda `Store.tokenExpiresAt` e refaz a troca de token na próxima abertura pelo
  admin (com 1 h de antecedência); o que não existe é renovação sem ninguém abrir o app.
- **App Store × `write_themes`.** A política 5.1.1 da App Store exige que apps alterem o
  tema só por *theme app extensions*. Nosso "sem cabeçalho/rodapé" e as páginas de produto
  escrevem arquivos no tema. Para distribuição custom não há restrição; para a App Store
  seria preciso a alternativa por app blocks (registrada em `ARQUITETURA.md` A.3).
- **Fluxo local.** O `INICIAR-DVFLY.cmd` continua igual: sobe o túnel, você cola o endereço
  no App URL e abre o app **pelo admin** (é de lá que vem o token). Abrir `localhost`
  direto só com `DVFLY_AUTH="off"` no `app/.env`.

## Fontes

`shopify.dev/docs/apps/build/authentication-authorization` (visão geral, `cli-app-authentication`,
`access-tokens`, `implement-token-exchange`, `id-tokens`, `manage-access-scopes`),
`…/apps/build/cli-for-apps/app-configuration`, `…/api/shopify-cli/app/app-deploy`,
`…/apps/launch/distribution/select-distribution-method`, `…/apps/launch/shopify-app-store/
app-store-requirements`, `…/apps/build/webhooks/{delivery-structure,verify-deliveries}`,
`…/apps/build/compliance/privacy-law-compliance`, `…/api/usage/access-scopes`,
`…/api/app-home/latest/apis/authentication-and-data/{resource-fetching-api,id-token-api}`.
