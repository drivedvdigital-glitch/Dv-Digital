# RELATÓRIO 09 — Be Wiser Clips · Aba Shopify, Formulários, Terceiros

Vídeos `yiI1AuwoCA0` (contact form, 1:51) e `0zBxbI4_WRE` (Loox, 1:47). Catálogo
PageFly 28-29 / Shopify 37 — versão um pouco ANTERIOR (Winter '26, sem Popup; Basic
antes de Media). Hierarquia de confiança segue 02 > 03 > spec-08 > 04 > este.

## Aba Shopify (35 de 37 capturados), 4 grupos

- **Product (14):** list, details, media, title, vendor, price, description, variant,
  quantity, add to cart, metafield, variant metafield `New`, view details,
  Dynamic checkout `New`
- **Collection (6):** list, details, image, title, description, view details
- **Form (7):** customer form/field/button, contact form/field/button, search form
- **Blog Posts (8+):** list, details, image, title, tags `New`, comment `New`, content
  (+~2 cortados)

**Padrão que vale mais que a lista:** nome = `<Recurso> <Campo>`, e os três recursos
compartilham o esqueleto list/details/image/title/description/view-details. O catálogo
espelha o modelo de dados da Shopify — previsível, cresce sozinho, nunca inventa nome.
**Adotado como convenção nossa** para os futuros blocos de dados (Produto título,
Produto preço…).

## Formulários — a decisão deles e a NOSSA

Eles escolheram **composição**: form/field/button como 3 elementos soltos (liberdade
total, montagem por conta do usuário; painel de config só narrado — pós-envio com
mensagem de sucesso). Duas famílias (Customer × Contact) sem diferença explicada —
hipótese: cadastro × mensagem; verificar antes de replicar Customer.

**Decisão D&VFly (15/09): widget configurável, não composição.** Motivo: nosso produto
é para o dono das lojas, e a filosofia da casa é uma tarefa simples por vez — um
"Formulário de contato" pronto (nome/telefone opcionais, e-mail+mensagem fixos, botão e
mensagem de sucesso configuráveis) cobre o caso real sem cobrar montagem. Composição
fica como evolução se aparecer demanda de layout livre.

## Terceiros

- Pré-requisito escondido: o app parceiro precisa estar em **App embeds** no editor de
  temas; o PageFly avisa genérico ("Enable integrations first") mas NÃO detecta o
  estado — usuário descobre pelo resultado quebrado. **Fazer melhor quando tivermos
  integrações: detectar e avisar no próprio elemento.**
- Acerto deles: expor só o recorte contextual e delegar o resto ao app do parceiro
  ("go to the settings area of the Loox application") + "Get it here" para quem não
  instalou. Fronteira certa e barata.

## Confirmações

- Badge **"Published" verde + link "Unpublish"** ao lado; "View live" sai do cinza →
  par de estados completo (implementado: Despublicar no editor).
- Pílula de contagem: 3ª variação observada (28/37 → 31/40 → 32/40) — SEMPRE do servidor.
- Tooltip de gesto ("Please drag and drop to the page"), "?" por item, frações de
  layout (1/2, 1/3, 2/3…), nomes semânticos de seção (3ª confirmação), banner "UI
  optimization" recorrente.
