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
| `/api/pages/:id/export` | Documento em JSON aberto (reimportável) |
| `/preview/:id` | A página compilada, sem editor |

**Configuração** vive em `app/lib/config.server.ts` — todas as variáveis, defaults e
validação num lugar (`.env.example` documenta cada uma). Em produção o app recusa subir sem
`SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` no ambiente. Constantes que um componente de rota
lê vêm de `app/lib/shared.ts` (módulos `.server.ts` não entram no bundle do cliente).

**Não existe tela de lojas.** Uma loja que abre o app se registra sozinha (`ensureStore`): o
`?shop=` chega na URL, as credenciais do app valem para qualquer loja que o instalou (é o mesmo
app, o grant de client credentials é por domínio), e a linha só é gravada depois de provada com um
`shop { name }` real. Loja nova entra como **produção** por padrão — publicar nela exige a
confirmação extra do editor.

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

- **Embedding de verdade.** O App Bridge já é carregado no `root.tsx`, mas a verificação do
  ID token ainda não existe. Antes de qualquer loja de produção, isso precisa entrar — o
  desenho está em `docs/CONFIGURACAO_E_MECANISMOS.md` §5 (P0.1).
- **Credenciais por loja no banco.** O ambiente já é a fonte primária (e a única em
  produção); falta remover as colunas ou cifrá-las (P0.2).
- **`shopify.app.toml`** para versionar scopes e webhooks (P0.3); webhook `app/uninstalled`
  e inventário dos arquivos escritos no tema (P1).
