# RELATÓRIO 02 — Pagefly Shopify Page Builder Tutorial (2026) ★ REFERÊNCIA-BASE

**Canal:** How to Easy · 7:19 · ID `f2QkWNnvCcA` · frames de 17-18/07/2026, lidos com zoom
(cada rótulo entre aspas foi lido na tela). **Onde divergir do relatório 01, este vale**
— o 01 descreve uma geração anterior do produto.

## O que muda o desenho (em ordem de peso)

1. **O editor é parte do admin da Shopify** (URL admin.shopify.com/.../apps/pagefly/editor;
   menu do app na sidebar: Pages, Sections, Analytics, Extra functions, Preferences). O
   produto declara na tela: "A PageFly page works as a section in your Shopify theme."
   **Header/footer são placeholders cinza não editáveis** no canvas; visibilidade em
   Page settings > Theme sections; edição real só no theme editor.
2. **IA = FlyMate**, difusa em 4 lugares (onboarding tipo+nicho, painel lateral com 5
   suggest actions, barra flutuante "Ask for quick changes...", botão ✦ no texto rico),
   medida por Credits usage sempre visível; falha por falta de crédito no plano grátis.
3. **Fricção proporcional**: aplicar template = modal "This can't be undone" + checkbox
   "I understand what I'm doing" + Confirm — a ÚNICA ação com esse gesto extra.
4. **Desabilitar em vez de esconder**: "View live" cinza até publicar; dispositivos e
   Preview cinza com drawer aberto; "Go to theme editor" cinza.

## Estrutura do editor (frames)

- Barra 1: logo+nome | Publish escuro + ×. **Com mudança pendente vira**: ⚠ "Unsaved
  changes" | "Discard" fantasma + "Save" escuro (Publish some).
- Barra 2: 🏠 nome da página ("Untitled") · badge "Unpublished" · Flymate · 4 ícones de
  dispositivo · indicador **"1440px, 58%"** (breakpoint + zoom juntos) · ajustar zoom ·
  desfazer/refazer (cinza sem histórico) · 👁 Preview · 🖥 View live (desabilitado sem publicar).
- Trilho vertical ~11 ícones: Page content, Elements, (Sections), Page templates,
  (3rd party), (Page settings), engrenagem + globo, `</>` CSS/JS, suporte.
- Page content: busca na árvore; aviso azul "Add a section to make this template visible
  to customers"; grupos Header→Theme header e Footer→Theme footer; hover na linha revela
  "⋯" e olho.
- Canvas: faixa "No element selected" / breadcrumb; placeholders cinza de header/footer;
  estado vazio: "This page is empty" + "+ Add element" e "✦ Prompt with AI" + links
  "Add a section" / "Select a page template"; seleção = contorno azul + mini-toolbar +
  barra IA flutuante.
- Inspetor: abas General | Styling + lupa + nota; vazio explica a fronteira builder/tema
  com "Go to theme editor" esmaecido + lista de atalhos (hold ctrl multi, ctrl+shift+S
  salvar&publicar, ctrl+S, ctrl+shift+Z — resto abaixo da dobra).
- Elements: 3 colunas — catálogo com pílulas **"PageFly 31" / "Shopify 40"** (contagem),
  badges `New` (Popup, Image Comparison), grupo Media (Image Comparison, Image, YouTube,
  Vimeo, HTML video, Soundcloud); variantes com frações (1/2 1/2, 1/3 ×3, 2/3 1/3);
  coluna explicativa (PageFly = blocos originais; Shopify = dados reais da loja).
- Fontes: dropdown "Shopify theme fonts" com tokens (type-body-font, type-subheading-font,
  type-heading-font, type-accent-font) + valor resolvido + Font size slider+num+unidade.
- Imagem: Source Type; Image source com miniatura, nome de arquivo, "Type: JPG",
  "Optimize", "Change ⌄".
- Botão: callout redirecionador "If you want to have a purchasing button, use the 'Add to
  cart' element instead" + Button type "Text only" + texto rico 2 fileiras (✦ B I U cor,
  tachado, sobre/subscrito, borracha).
- Templates (drawer): busca, Sort, 5 filtros (Type/Industry/Style/Feature/Collection),
  "128 of 129 templates", cards com **"Used on N pages"**, hover → Preview/Select,
  "This drawer is only for managing"; modal destrutivo (item 3 acima).
- Instagram: OAuth externo, o app do consentimento NÃO se chama PageFly (decisão de
  confiança a considerar).

## Padrões observados

- Estado vazio instrutivo com a ação que resolve; consequência dita antes ("visible to
  customers") no lugar onde se resolve.
- Contadores honestos: pílulas com contagem, "128 of 129", barra de créditos permanente,
  "AI can make mistake, double-check the outputs" fixo no rodapé.
- Geração interrompível ("Stop") com progresso granular ("section 3 of 9").
- Callout redireciona sem bloquear; drawer declara o próprio limite.

## Valores padrão vistos

Página "Untitled" / "Unpublished"; botão "Button Text", tipo "Text only"; variantes
"Blank"; font size 14px; zoom inicial 58% @1440px; créditos 0%.
