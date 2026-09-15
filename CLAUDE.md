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
| `npm test` | testes do compilador |
| `npm run fix:duplicados` | remove `node_modules` órfão (React duplicado) |

## Arquitetura em 30 segundos

- `packages/compiler/` — **o único renderizador** (invariante I1): documento de blocos → HTML+CSS
  deduplicado. Preview do editor e publicação chamam a MESMA função. Editor-only: `nodeIds`.
- `packages/shopify/` — client credentials grant (por loja), `upsertPage` idempotente por handle,
  deploy multi-loja com lojas independentes.
- `app/` — React Router 7 + Prisma/SQLite. Telas em Polaris web components (CDN); editor em tela
  cheia (árvore / canvas / inspetor). Loja se registra sozinha ao abrir o app (`ensureStore`).
- Decisões e porquês: `docs/ARQUITETURA.md` (invariantes I1–I7), `docs/UX_FLUXOS.md` (U1–U7),
  histórico honesto em `docs/PROGRESSO.md` — **atualizar a cada entrega**, incluindo o que falhou.

## Armadilhas já pagas (não repagar)

- Polaris + React 18: `disabled={false}` DESABILITA (usar `x || undefined`); `defaultvalue` não
  existe (usar `value`); botões não carregam `name`/`value` (intent via `useSubmit`). Ver
  `app/README.md`.
- Efeito colateral dentro de updater do `setState` corrompe em StrictMode (updaters rodam 2×).
- Túnel dev: origem `https` × servidor `http` dispara o CSRF do React Router →
  `allowedActionOrigins` em `app/react-router.config.ts`.
- Workspace npm: instalar dentro de `app/` quebra tudo (React duplicado). Sempre na raiz.

## Regras de interface (aprendidas da referência, adotadas como nossas)

- **Desabilitar explicando, nunca esconder**: controle indisponível fica visível, cinza,
  com o motivo escrito ao lado ("Disponível depois de publicar").
- Estado vazio sempre aponta a rota exata do conserto ("Geral → URL da imagem").
- Limite de plataforma é dito nomeando a origem ("limite da Shopify") — nunca escondido
  nem assumido como culpa nossa.
- Contagens exibidas vêm sempre de dados, nunca hardcoded.

## Cultura de verificação

Testar **dirigindo o app de verdade** (Playwright contra as rotas, cliques reais), não só teste
unitário. Página publicada nunca carrega resíduo do editor. Nunca declarar pronto sem ter visto
funcionar.
