# D&VFly — Progresso

Page builder visual para Shopify, app privado. Interface em pt-BR, código e comentários em inglês.

## Status geral

| Fase | Descrição | Status |
|---|---|---|
| 1 | Pesquisa de mercado (referência: PageFly) | ✅ Concluída |
| 2 | Arquitetura | ⏳ Aguardando aprovação do plano |
| 3 | MVP | ⬜ Não iniciada |
| 4 | Recursos P1 | ⬜ Não iniciada |

---

## Fase 1 — Pesquisa ✅

**Entregue:** `docs/PESQUISA_PAGEFLY.md`

- Inventário funcional completo por categoria: tipos de página, elementos/blocos, seções e
  templates, controles de estilo e responsividade, integrações, SEO, analytics, A/B test,
  publicação e versionamento, recursos de IA, modelo comercial.
- Linha do tempo das atualizações (versões 1.2 → 4.20 e o ciclo IA/CRO de 2025–2026), com a
  leitura estratégica de como o produto evoluiu em quatro fases.
- Principais reclamações dos usuários mapeadas para oportunidades concretas do D&VFly:
  código inchado/lentidão, lock-in, modelo de slots, suporte, limites de customização,
  dependência do app para editar.
- Tabela de priorização com 106 itens: **43 P0**, **37 P1**, **26 P2**.
- Regras de propriedade intelectual registradas e aplicadas (nenhum código, asset, texto de UI
  ou template do concorrente foi copiado; a marca do concorrente não aparece no produto).

**Limitação registrada:** o proxy de egresso do ambiente bloqueia acesso HTTP direto a
`help.pagefly.io`, `pagefly.io`, `apps.shopify.com` e `shopify.dev`. A pesquisa foi feita via
busca web. Números exatos (contagem de elementos/templates, preços) estão marcados com ⚠️ no
documento e devem ser reconfirmados se forem usados fora do contexto interno.

**Impacto no plano:** o bloqueio a `shopify.dev` precisa ser resolvido antes da Fase 2 fechar,
já que a arquitetura depende de confirmar a API Admin GraphQL atual (mutations de Page, templates
de tema, scopes) em vez de assumir.

---

## Fase 2 — Arquitetura ⏳

**Pendente:** `docs/ARQUITETURA.md` — a escrever após aprovação do plano da fase.

Escopo previsto: stack (Shopify CLI + Remix + Prisma), escolha do motor do editor visual,
estratégia de publicação (Admin GraphQL API para páginas avulsas; template alternativo do tema
para produto/coleção/home), estratégia de performance do output, modelo de dados
(Page, Version, Element, Template) e scopes do `shopify.app.toml`.

---

## Fase 3 — MVP ⬜

Não iniciada. Depende da aprovação da Fase 2.

## Fase 4 — Recursos P1 ⬜

Não iniciada.
