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
| `/app` | **Páginas** — lista, criar, duplicar, excluir. Mostra em quais lojas cada página está |
| `/app/pages/:id` | **Editor** — HTML à esquerda, preview à direita, publicação multi-loja embaixo |
| `/app/stores` | **Lojas** — registro com credencial por loja |
| `/api/preview/:id` | Compila markup para o preview |

## Três decisões que valem explicar

**O preview chama o mesmo `compile()` do publish.** Não existe um segundo renderizador. É o
invariante I1 virado fronteira de módulo: `app/lib/compiler.server.ts` é o único caminho, e tanto o
iframe do editor quanto o deploy passam por ele. A reclamação nº 1 sobre o concorrente é o editor
não bater com a página publicada; aqui não há como divergir.

**Salvar sempre grava uma versão, com a versão do compilador junto.** É o invariante I2 como
coluna: atualizar o compilador nunca reescreve o que já foi publicado.

**Cadastrar loja testa a credencial antes de salvar.** A falha aparece enquanto a pessoa está
olhando o formulário, não depois, na hora de publicar.

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

- **Embedding de verdade.** O App Bridge já é carregado no `root.tsx`, mas a verificação da
  requisição (session token / HMAC) ainda não existe. Antes de qualquer loja de produção, isso
  precisa entrar.
- **Canvas visual.** Hoje o editor é textarea + preview. O canvas em iframe com seleção e
  drag-and-drop é a etapa 5 da Fase 3.
- **Credenciais em texto claro** no banco. Cifrar antes de sair da loja de teste.
