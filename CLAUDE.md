# D&VFly — regras do projeto

Construtor visual de páginas para Shopify (app privado, lojas próprias). O PageFly é a
**referência de funcionalidade**, nunca de código.

## Regras inegociáveis

- **NÃO copiar** código, CSS, HTML, JS, ícones, imagens, textos de interface ou templates do
  PageFly. Replicamos **conceitos e funcionalidades**, escritos do zero, com identidade D&VFly.
- **NÃO usar** nome, logo ou marca do PageFly no produto. Citar em `docs/` (pesquisa interna) é ok.
- **NÃO commitar segredos.** O GitHub bloqueia push com `shpss_…` — credenciais vivem só em
  `app/.env` (não versionado). O `.env.example` fica com valores vazios.
- Documentação e interface em **pt-BR**; código e comentários em **inglês**.
- Branch de trabalho: `claude/dvfly-pagefly-research-skqx9r`. `git pull --rebase` antes de push.
  **Não abrir pull request.**

## Comandos (sempre na raiz, nunca dentro de `app/`)

| Comando | O quê |
|---|---|
| `INICIAR-DVFLY.cmd` (Windows, duplo clique) | pull + setup + servidor + túnel, com o endereço público copiado |
| `npm run setup` | dependências dos 3 pacotes + `.env` + banco |
| `npm run dev` | servidor em `http://localhost:5173` |
| `npm test` | testes do compilador + do pacote Shopify |
| `npm run typecheck` | `tsc` do app |
| `npm run build` / `npm start` | build de produção e servidor próprio `app/server.mjs` (`trust proxy`; `NODE_ENV=production`, credenciais no ambiente) |
| `PUBLICAR-DVFLY.cmd` / `PUBLICAR-DVFLY-VM.cmd` | publica uma versão nova no servidor (Vercel / VM). O que está no ar só muda aqui |
| `npm run gerar-chave` | gera a `DVFLY_TOKEN_KEY` (criptografa o acesso das lojas no banco) |
| `npm run migrar-dados` | copia o banco local (SQLite) para o Postgres do servidor |
| `npm run fix:duplicados` | remove `node_modules` órfão (React duplicado) |

Configuração: toda variável de ambiente é lida em `app/app/lib/config.server.ts` (lista em
`docs/CONFIGURACAO_E_MECANISMOS.md` §6). Constante que um componente de rota usa vem de
`app/app/lib/shared.ts`, nunca de um módulo `.server.ts` (o Vite recusa o bundle).

## Arquitetura em 30 segundos

- `packages/compiler/` — **o único renderizador** (invariante I1): documento de blocos → HTML+CSS
  deduplicado. Preview do editor e publicação chamam a MESMA função. Editor-only: `nodeIds`,
  `editorHints`.
- `packages/shopify/` — instalação gerenciada + token exchange (`session.ts`; client credentials
  só para lojas da própria organização em dev), `upsertPage` pela id lembrada, deploy multi-loja
  com lojas independentes, templates de produto por página.
- `app/` — React Router 7 + Prisma (**SQLite na sua máquina, Postgres no servidor** — o
  provider sai de `DATABASE_URL` via `app/scripts/prisma-schema.mjs`; `prisma/schema.prisma`
  é gerado e não versionado, o template é a fonte). Hospedar: `docs/HOSPEDAGEM.md`.
  Telas próprias (tokens `--dv-*`, claro/escuro); editor
  em tela cheia (árvore / canvas / inspetor). **Toda rota de tela/dados chama `requireShop`**
  (ID token da Shopify; exceções por desenho: `/bounce`, webhooks com HMAC, `/` que só
  redireciona); a loja se instala sozinha ao abrir o app (`installStore`). `DVFLY_AUTH=off` só
  em dev. Loaders nunca devolvem token/segredo de loja ao cliente.
- Decisões e porquês: `docs/ARQUITETURA.md` (invariantes I1–I7), `docs/UX_FLUXOS.md` (U1–U7),
  histórico honesto em `docs/PROGRESSO.md` — **atualizar a cada entrega**, incluindo o que falhou.
  Estado real do código × plataforma × concorrente: `docs/CONFIGURACAO_E_MECANISMOS.md`
  (auditoria de 15/09, com o plano P0/P1/P2 antes de hospedar). Instalar numa loja:
  `docs/INSTALACAO.md` + `shopify.app.toml` na raiz.

## Armadilhas já pagas (não repagar)

- Polaris + React 18: `disabled={false}` DESABILITA (usar `x || undefined`); `defaultvalue` não
  existe (usar `value`); botões não carregam `name`/`value` (intent via `useSubmit`). Ver
  `app/README.md`.
- Efeito colateral dentro de updater do `setState` corrompe em StrictMode (updaters rodam 2×).
- **HTML colado é do autor**: nunca mover `style=""` para classe (a classe perde na cascata
  para o CSS do próprio autor e para o tema) nem deixar nosso reset alcançar o que está
  dentro de `[data-dvf-raw]`. Medir com o render comparado, não no olho.
- **Medir sempre COM o tema da loja por cima.** Documento nu mente: o tema tem
  `html{font-size:62.5%}` (todo `rem` do autor encolhe 37,5%), `body{letter-spacing;line-height}`
  que desce para tudo, e classes (`.price`) que colidem com as do autor. Isolar com
  especificidade de **uma classe** — ganha do tema, perde do autor. `all:revert` apaga
  também atributo de apresentação (`<img width>`, `<svg viewBox>`): esses elementos ficam de
  fora e são limpos propriedade a propriedade.
- **O canvas do editor tem que carregar o CSS do tema** (`api.theme-style` →
  `themeHead()`), senão o editor mostra Times New Roman e o visitante vê outra página.
- Túnel dev: origem `https` × servidor `http` dispara o CSRF do React Router →
  `allowedActionOrigins` em `app/react-router.config.ts`. O `react-router dev` copia o
  `app/.env` INTEIRO para `process.env` antes de ler esse arquivo: uma variável vazia
  (`X=""`) chega como string vazia, não como ausente — tratar com `|| padrão`, nunca `??`.
- Workspace npm: instalar dentro de `app/` quebra tudo (React duplicado). Sempre na raiz.
- **`import.meta.url === \`file://${process.argv[1]}\`` é FALSO no Windows** (lá o argumento
  é `C:\x\y.mjs` e a url é `file:///C:/x/y.mjs`): o script não roda, não fala nada e sai 0.
  Arquivo feito para ser executado não adivinha se está sendo executado — separe biblioteca
  de CLI (`prisma-schema.mjs` × `db-schema.mjs`).
- **npm 12 vai BLOQUEAR script de instalação** não aprovado (hoje só avisa): o campo
  `allowScripts` na raiz já aprova `prisma`, `@prisma/*` e `esbuild`. Dependência nova com
  postinstall entra ali, senão a VM para de compilar no dia em que o npm subir de versão.
- **Cliente do Prisma é gerado por provider**: um client gerado para SQLite não fala com
  Postgres (o `/healthz` acusa `banco: erro`). O `npm run build` regenera — buildar com a
  `DATABASE_URL` do destino, sempre.
- **Segredo de loja nunca em texto puro no banco** (exigência da doc de hospedagem da
  Shopify): entra por `seal()` e sai por `toStore()`/`appCredentials()`. Em produção o app
  se recusa a subir sem `DVFLY_TOKEN_KEY`.

## Regras de interface (aprendidas da referência, adotadas como nossas)

- **Linguagem visual = a do admin da Shopify**, desenhada por nós: tokens `--dv-*` em
  `app/app/ui/theme.tsx` (cinzas neutros, superfície branca com borda-fio, **um** botão
  primário escuro por tela, secundário branco com borda, `plain` em linhas de tabela), badges
  tintadas sem borda, rótulos em caixa normal (nunca VERSALETES), cor só onde há significado.
- **Ícone só de `app/app/ui/icons.tsx`** (grade 16, traço 1.5) — nunca emoji nem caractere
  tipográfico (⠿ ✕ ⧉ ↑) fazendo papel de ícone. Bloco novo ganha ícone em `BLOCK_ICONS`.
- Editor: trilho de ícones à esquerda com um painel por vez (Construir = Estrutura +
  Elementos; Configurações da página; Ajuda). Os dois primeiros ficam visíveis juntos de
  propósito — a inserção é relativa ao bloco selecionado.

- **Desabilitar explicando, nunca esconder**: controle indisponível fica visível, cinza,
  com o motivo escrito ao lado ("Disponível depois de publicar").
- Estado vazio sempre aponta a rota exata do conserto ("Geral → URL da imagem").
- Limite de plataforma é dito nomeando a origem ("limite da Shopify") — nunca escondido
  nem assumido como culpa nossa.
- Contagens exibidas vêm sempre de dados, nunca hardcoded.
- **Fricção proporcional à reversibilidade**: ação reversível (duplicar, excluir bloco)
  não pede confirmação — o Ctrl+Z cobre; ação destrutiva de página inteira pede gesto
  extra explícito.
- **Toda ação sobre um bloco tem três caminhos e um nome**: botões nomeados no inspetor
  ("↑ Subir", "✕ Excluir"), barra flutuante no canvas, menu do botão direito (árvore e
  canvas) — mais o atalho no tooltip. Ícone sozinho nunca é a única porta.
- Consequência reversível avisa o caminho de volta ("Bloco excluído · Ctrl+Z desfaz").
- Onde uma ação vai acontecer é dito antes do clique ("Entra dentro de «Seção»").

## Cultura de verificação

Testar **dirigindo o app de verdade** (Playwright contra as rotas, cliques reais), não só teste
unitário. Página publicada nunca carrega resíduo do editor. Nunca declarar pronto sem ter visto
funcionar.
