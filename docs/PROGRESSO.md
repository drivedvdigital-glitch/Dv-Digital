# D&VFly — Progresso

Page builder visual para Shopify, app privado. Interface em pt-BR, código e comentários em inglês.

## Status geral

| Fase | Descrição | Status |
|---|---|---|
| 1 | Pesquisa de mercado (referência: PageFly) | ✅ Concluída — verificada em fontes primárias |
| 2 | Arquitetura | ⏳ Aguardando aprovação do plano |
| 3 | MVP | ⬜ Não iniciada |
| 4 | Recursos P1 | ⬜ Não iniciada |

---

## Fase 1 — Pesquisa ✅

**Entregue:** `docs/PESQUISA_PAGEFLY.md`

### Passada 1 — levantamento inicial

Inventário funcional por categoria, linha do tempo das atualizações, reclamações de usuários
mapeadas para oportunidades, e tabela de priorização com 106 itens (43 P0 / 37 P1 / 26 P2).
Feito **por busca web**, porque o ambiente daquela sessão tinha egresso bloqueado para
`help.pagefly.io`, `pagefly.io`, `apps.shopify.com` e `shopify.dev`. Tudo que ficou incerto foi
marcado com ⚠️.

### Passada 2 — verificação por leitura direta

Este ambiente tem acesso pleno à rede. As fontes foram **lidas**, não resumidas por busca.

**O que foi lido**

- **Central de ajuda do PageFly** — árvore completa mapeada pelo `sitemap-pages.xml` e pelo
  índice `llms.txt`; **as 241 páginas em inglês foram baixadas em Markdown e lidas**.
- **Shopify App Store** — listagem do app e a aba de reviews com filtro de 1, 2 e 3 estrelas
  (**85 depoimentos lidos na íntegra**).
- **pagefly.io** — página de preços, páginas de produto (AI page builder, heatmap) e o post de
  release 4.20.0.
- **Trustpilot** — ficha do produto.
- **shopify.dev** — Admin GraphQL (páginas, temas, produtos, coleções, arquivos, metafields),
  arquitetura de templates de tema, theme app extensions, access scopes, apps customizados
  criados pelo admin, e o status da REST Admin API. Versão de API `2026-07`.

**O que foi corrigido em relação à passada 1**

| Item | Antes | Agora |
|---|---|---|
| Integrações | "130+" | **210 apps** em 20 categorias, contados na listagem oficial |
| Preços | 3 planos (Free / PAYG ~US$ 24 / Unlimited US$ 99, com opção anual) | **5 planos self-serve** (Free · Builder US$ 24 · Optimize US$ 39 · Accelerate US$ 99 · Power US$ 199) + 3 tiers enterprise (US$ 299/499/999). **Não há plano anual** |
| Avaliações | "~4,9 com ~6.000 avaliações" | **4,9 / 5 com 5.899**, distribuição completa (70 de 1★, 21 de 2★, 27 de 3★) |
| Desinstalação | "dados apagados com janela de ~24 h" | **Exclusão imediata e irreversível**, sem carência e sem backup do fornecedor |
| Página de produto/coleção | "substitui o template" | **Dois modos** — anexa conteúdo ao nativo *ou* substitui; quem decide é a composição do template JSON |
| Galeria de imagens | listada como elemento | **Não existe** como elemento; monta-se com Content List ou Slideshow |
| Mídia 3D | listada como elemento | É um **tipo de mídia** dentro do bloco de produto |
| Sombra | "box-shadow e text-shadow" | **Só box-shadow** |
| Estrutura do editor | Seção → Linha → Coluna → Elemento | **Dois motores**: Legacy (linha/coluna) e **Gen 2** (flex, desde a 4.23.0) |
| Total de itens priorizados | 106 (43/37/26) | **145 (56 P0 / 54 P1 / 35 P2)**, contados nas tabelas |

**O que foi confirmado (⚠️ removidos)**

- Histórico de versões: **50 salvamentos manuais**; autosaves não entram.
- Créditos de IA do plano free: **10 por mês**.
- Imagem de compartilhamento social: **é campo nativo**, exclusivo de páginas Regular.
- Limites técnicos: **256 KB por página** (limite da Shopify), 20 MB por imagem, **1.000 templates
  JSON por tema** — acima disso o app cai para template Liquid.
- Publicação: tudo sai como **template JSON**, em temas OS 1.0 e OS 2.0.
- Ausência de agendamento de publicação de página (só o início de teste A/B é agendável).

**O que a leitura direta revelou e não estava mapeado**

- **Editor Gen 2** (versão 4.23.0): flex sections e blocks, sem linha/coluna, exclusivo dos planos
  por slot. É a mudança arquitetural mais profunda do concorrente no período.
- **Universal Elements**: conversão de tipo de elemento (texto estático ↔ dado dinâmico) como
  propriedade do modelo de dados.
- **Cart Drawer**: superfície inteira nova, com Reward Ladder e Bundle Offers rodando como
  **Shopify Functions** e exigindo scopes de `cart_transforms` e `discounts`.
- **CRO Center**: section insights com engagement score, sales funnel, heatmaps por seção,
  A/B bayesiano com agendamento, co-piloto de analytics com detecção de anomalia.
- **AEO Optimizer** e **conector MCP** — o ciclo "agentic" de 2026.
- **Market localization** por Shopify Market.
- Elementos não mapeados: checkout dinâmico, indicador de estoque, sticky bar de produto,
  app block do OS 2.0, comparador de imagens, formulário de busca, vendor.

**Seção 3 (reclamações) — aprofundada com os depoimentos reais**

A minoria negativa é pequena mas consistente, e vem **desproporcionalmente de contas antigas e
lojas grandes** — são falhas que aparecem com escala e com o tempo. Os padrões, em ordem de
frequência, e a decisão de arquitetura que cada um gera:

1. **O editor não bate com a página publicada** → um motor de renderização só; o preview é o
   output do próprio compilador.
2. **Atualizações do app quebram páginas prontas** → o publish congela o output; versionar o
   compilador junto com a página; nunca migrar o usuário à força.
3. **O app suja o tema, e a sujeira escala** (o guia oficial de desinstalação manda o lojista
   apagar arquivos Liquid, código no `theme.liquid` e um bloco no `en.default.json` **à mão**;
   houve caso relatado de 3.000+ páginas duplicadas após backup de tema) → pegada mínima e
   inventário auditável.
4. **Lock-in** (export `.pagefly` sem HTML e sem imagens) → export estático, JSON aberto,
   conteúdo que vive no Shopify.
5. **Instabilidade** (perda de acesso ao console, editor degradando perto do teto de 256 KB) →
   o storefront nunca pode depender do nosso backend.
6. **Suporte** que edita o tema do cliente direto e já publicou página inacabada no ar →
   publicar é sempre explícito e reversível.
7. **Performance e SEO** (Lighthouse 23 no template básico do próprio fornecedor, enquanto o
   artigo oficial nega qualquer impacto) → performance como critério de aceite.
8. **Responsividade dá trabalho dobrado** → herança de breakpoint explícita e visível.
9. **Slots e preço** → irrelevante para nós, e essa é a vantagem.
10. **Curva de aprendizado e HTML incorreto** (links de produto são handlers de clique, não
    `<a href>`) → HTML semântico correto por padrão.
11. **Dependência do app para editar** → gerar seção Liquid real com `schema`.

**Novo Apêndice A — APIs da Shopify (destrava a Fase 2)**

Documentado a partir de `shopify.dev`, versão `2026-07`:

- **A.1 Páginas:** `pageCreate` / `pageUpdate` / `pageDelete` e o shape completo dos inputs.
  Publicar/despublicar é o campo `isPublished`; `publishDate` dá **agendamento nativo**;
  `redirectNewHandle` preserva links ao renomear; `body` aceita HTML — encaixe exato da nossa
  arquitetura de compilar para HTML.
- **A.2 Templates alternativos:** os dois passos (escrever `templates/<tipo>.<sufixo>.json` com
  `themeFilesUpsert`, depois apontar o recurso com `templateSuffix` em `productUpdate` /
  `collectionUpdate` / `pageUpdate`), mais os limites de 1.000 templates JSON, os tipos que não
  podem ser JSON, e os templates contextuais por mercado.
- **A.3 Theme App Extensions:** app blocks vs. app embeds comparados em declaração, posição,
  ativação, acesso a dados dinâmicos e caso de uso; os limites validados no deploy (10 MB, 30
  blocks, 100 KB de Liquid); as restrições (não renderizam no checkout, sem
  `content_for_layout`); e o **deep linking**, que insere um bloco no template sem escrever no tema.
- **A.4 Scopes** para o `shopify.app.toml`, por etapa.
- **A.5 REST:** legada desde 01/10/2024; GraphQL obrigatória para novos apps públicos desde
  01/04/2025. O recurso Asset tem restrição própria e mais antiga.
- **A.6** Todas as URLs consultadas.

**O que permanece incerto — e por quê**

| Item | Motivo |
|---|---|
| Datas das versões anteriores à 4.20.0 | O PageFly **removeu do ar** as notas de release: só a 4.20.0 (20/01/2025) ainda responde; as demais dão 404 ou redirecionam para o índice do blog. O Internet Archive está bloqueado neste ambiente |
| Versões acima da 4.20.0 | O PageFly **parou de publicar release notes**. Não há changelog. O conteúdo das versões novas foi recuperado dos blocos "Version Update" dentro dos artigos da documentação, mas **sem datas** |
| Reviews em G2 e Capterra | 403/404 por proteção anti-bot |
| Contagem exata de templates | Todas as fontes do fornecedor dizem "320+"; não há listagem pública para conferir |
| Detalhes internos de renderização do concorrente | Não são documentados publicamente; só instalando o app e inspecionando o output |
| **Se `write_themes` exige isenção da Shopify para app privado** | **A documentação da Shopify se contradiz** — ver abaixo |

### ⚠️ Risco a resolver antes de fechar a Fase 2

A documentação da Shopify diz duas coisas incompatíveis sobre escrita em arquivos de tema:

1. As mutations `themeFilesUpsert` / `themeFilesDelete` / `themeFilesCopy` / `themeCreate` /
   `themePublish` afirmam, sem ressalva, que é preciso `write_themes` **e uma isenção concedida
   pela Shopify**.
2. A página que explica a restrição limita seu alcance a apps **distribuídos na App Store**, e a
   página de apps customizados criados pelo admin lista `read_themes`/`write_themes` como scopes
   **atribuíveis normalmente pelo lojista**, sem menção a isenção.

O D&VFly é app privado, não distribuído. A documentação não resolve o caso, e o documento de
pesquisa **não preencheu a lacuna com suposição**.

**Encaminhamento (em ordem):**

1. **Testar empiricamente** — criar o app no admin, atribuir `write_themes` e tentar um
   `themeFilesUpsert` em tema de desenvolvimento. Uma tarde de trabalho responde melhor que
   qualquer leitura.
2. **Plano B pronto** — app blocks + deep linking (Apêndice A.3), que não exige isenção nenhuma,
   e ainda responde à reclamação de "conteúdo não editável no editor de tema".
3. **O MVP não depende disso.** Páginas avulsas via `pageCreate` seguem independentemente. Só a
   trilha de produto/coleção/home depende — e ela já está classificada como P1, não P0,
   justamente por causa deste risco.

**Propriedade intelectual:** nenhum código, CSS, HTML, ícone, imagem, texto de interface ou
template do concorrente foi copiado para o repositório. As páginas de documentação baixadas para
leitura ficaram em diretório temporário fora do repositório e não foram versionadas. A marca do
concorrente aparece apenas neste material interno de pesquisa competitiva, nunca no produto.

---

## Fase 2 — Arquitetura ⏳

**Pendente:** `docs/ARQUITETURA.md` — a escrever após aprovação do plano da fase.

Escopo previsto: stack (Shopify CLI + Remix + Prisma), escolha do motor do editor visual,
estratégia de publicação (Admin GraphQL para páginas avulsas; template alternativo do tema **ou**
app blocks + deep linking para produto/coleção/home — a decidir com o teste do item 1 acima),
estratégia de performance do output, modelo de dados (Page, Version, Element, Template) e scopes
do `shopify.app.toml`.

**As decisões que a Fase 1 já entrega prontas para a Fase 2:**

1. O editor produz um **documento de dados** (árvore JSON de blocos), não HTML.
2. **Um compilador só**, `árvore → HTML + CSS`, usado tanto no preview quanto no publish.
3. **O publish congela o output** — atualizar o builder nunca altera página publicada.
4. **Nascer flex**, sem linha/coluna.
5. **Pegada mínima e auditável no tema**, com remoção completa.
6. **O storefront nunca depende do nosso backend.**
7. **`Page` nasce com o conceito de variante**, para que A/B seja UI depois, não migração.

---

## Fase 3 — MVP ⬜

Não iniciada. Depende da aprovação da Fase 2. Escopo: os **56 itens P0** da seção 4 da pesquisa.

## Fase 4 — Recursos P1 ⬜

Não iniciada. Escopo: os **54 itens P1**.
