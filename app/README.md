# `@dvfly/app`

A tela do D&VFly: lista de páginas, editor e publicação multi-loja.

## Rodar

Os dois comandos rodam **na raiz do repositório**, não dentro de `app/`:

```sh
npm run setup
npm run dev
```

Sobe em `http://localhost:5173`.

**Por que na raiz.** O app importa o compilador pelo código-fonte, por caminho relativo. Quando
`packages/compiler/src/html-optimize.ts` pede `node-html-parser`, o Node resolve a partir da pasta
*do compilador* e sobe — nunca olha dentro de `app/node_modules`. Por isso o repositório é um npm
workspace: um `npm install` na raiz instala as dependências dos três pacotes e as iça para
`node_modules/` da raiz, que é onde o compilador consegue enxergá-las.

Rodar `npm install` dentro de `app/` instala **só** aquele workspace, e o app sobe mas quebra na
primeira compilação, com `Cannot find module 'node-html-parser'`.

## As telas

| Rota | O quê |
|---|---|
| `/` | Entrada. A Shopify abre o app aqui com `?shop=&host=`; redireciona para `/app` preservando os parâmetros |
| `/app` | **Páginas** — lista própria (tokens `--dv-*`, claro/escuro): criar, importar, duplicar, excluir (dois cliques; despublica nas lojas antes), publicar/despublicar por linha e em massa |
| `/app/pages/:id` | **Editor** — tela cheia: estrutura à esquerda, canvas com larguras de dispositivo no centro, inspetor (Geral/Estilo) e publicação à direita |
| `/api/preview/:id` | Compila o documento para o canvas (mesmo `compile()` do publish, com ids e dicas de editor) |
| `/api/theme-fonts?shop=` | Fontes reais do tema da loja (lidas da vitrine, cache 10 min por loja) |
| `/api/products?storeId=&q=` | Busca de produtos de uma loja (painel "Produtos vinculados") |
| `/api/pages/:id/export` | Documento em JSON aberto (reimportável, com tipo e configurações da página) |
| `/preview/:id` | A página compilada, sem editor |
| `/bounce` | Pede o ID token ao App Bridge e volta para onde a navegação ia (mesma origem só) |
| `/webhooks/app`, `/webhooks/compliance` | Webhooks da Shopify, HMAC do corpo bruto |

**Configuração** vive em `app/lib/config.server.ts` — todas as variáveis, defaults e
validação num lugar (`.env.example` documenta cada uma). Em produção o app recusa subir sem
`SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` no ambiente. Constantes que um componente de rota
lê vêm de `app/lib/shared.ts` (módulos `.server.ts` não entram no bundle do cliente).

**Não existe tela de lojas.** Uma loja que abre o app se registra sozinha. O caminho normal
(qualquer loja) é a **instalação gerenciada pela Shopify**: a loja instala o app, o admin abre
o App URL com um ID token, `requireShop` verifica o token com o client secret, e na primeira
vez `installStore` troca esse token por um **access token offline** da loja (token exchange),
gravado em `Store.accessToken`. O caminho de desenvolvimento (`DVFLY_AUTH=off`, só fora de
produção) usa o client credentials grant, que vale apenas para lojas da nossa própria
organização. Loja nova entra como **produção** por padrão — publicar nela exige a confirmação
extra do editor. Guia completo de instalação em `docs/INSTALACAO.md`.

**Toda rota autentica** (`app/lib/auth.server.ts`): dados com `Authorization: Bearer` (o App
Bridge põe sozinho no `fetch`), documento com `?id_token=`; sem token, uma página inteira vai
pelo `/bounce` (pede o token ao App Bridge e volta) e uma chamada de dados leva 401 com
`X-Shopify-Retry-Invalid-Session-Request`. Links que abrem nova aba (pré-visualizar, exportar)
buscam o token antes de abrir (`app/ui/embedded.ts`). Webhooks em `/webhooks/app` e
`/webhooks/compliance`, com HMAC do corpo bruto.

## Três decisões que valem explicar

**O preview chama o mesmo `compile()` do publish.** Não existe um segundo renderizador. É o
invariante I1 virado fronteira de módulo: `app/lib/compiler.server.ts` é o único caminho, e tanto o
iframe do editor quanto o deploy passam por ele. A reclamação nº 1 sobre o concorrente é o editor
não bater com a página publicada; aqui não há como divergir.

**Salvar sempre grava uma versão, com a versão do compilador junto.** É o invariante I2 como
coluna: atualizar o compilador nunca reescreve o que já foi publicado.

**Registrar loja prova a credencial antes de gravar.** Nenhuma linha entra no banco sem um
`shop { name }` respondido pela própria loja — uma loja nunca registra "meio funcionando".

## Polaris web components — o que foi aprendido no navegador, não na doc

A interface usa os componentes `s-*` que a própria Shopify serve por CDN. Três armadilhas reais,
todas encontradas rodando e olhando, e que valem para qualquer código novo aqui:

1. **`disabled={false}` desabilita.** React 18 escreve props desconhecidas de custom elements como
   atributo; `false` vira a *string* `"false"`, e atributo presente é atributo ligado. Todo booleano
   condicional precisa ser `disabled={x || undefined}`.
2. **`defaultvalue` não existe.** Os elementos observam `value` e `checked` (minúsculo, direto).
   `defaultValue`/`defaultChecked` são propriedades JS que atributo nenhum alimenta — usar
   `value={...}` e deixar o componente gerir a edição.
3. **Botões não carregam `name`/`value`.** `s-button type="submit"` submete o form, mas o intent
   não pode morar no botão — vai via `useSubmit` com o campo `intent` carimbado no FormData.

Os tipos em `app/polaris.d.ts` foram extraídos dos `observedAttributes` do bundle real, não
transcritos de documentação.

## Verificado contra loja real

Todo o fluxo foi exercitado pelas próprias rotas, não só por teste unitário:

| Passo | Resultado |
|---|---|
| Cadastrar loja | ✓ credencial validada ao vivo antes de gravar |
| Criar página | ✓ |
| Preview | ✓ mesmo compilador; 2 estilos iguais → 1 regra |
| Publicar | ✓ `Publicado em 1 loja` |
| Conferir na loja | ✓ **zero estilo inline** no nosso bloco, CSS escopado em `.dvf-page`, link `<a href>` real |

## O que falta

- **Prova dentro do admin real.** Toda a autenticação foi testada com tokens assinados pelo
  segredo real e webhooks com HMAC real; o ciclo completo só se prova instalando numa loja
  ao hospedar (`docs/INSTALACAO.md` diz o que observar).
- **Access token das lojas em texto claro no SQLite.** Cifrar em repouso antes de sair da
  loja de teste (`docs/CONFIGURACAO_E_MECANISMOS.md` §5, P1).
- **Inventário dos arquivos escritos no tema** (os três `dvfly-solo`; os modelos de produto
  já são removidos ao excluir a página) e o webhook `themes/publish` (P1).

Em produção, `npm start` sobe `app/server.mjs` — um servidor Express próprio, porque o
`react-router-serve` não aceita `trust proxy`: atrás de qualquer proxy TLS o CSRF do React
Router recusaria toda action com 400. O log de acesso imprime só o caminho (a primeira
carga traz `?id_token=`).
