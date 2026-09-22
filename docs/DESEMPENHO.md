# Desempenho: o que toda página do D&VFly faz por padrão

Objetivo declarado pelo Miguel (22/09): **toda página o mais leve possível, em todo celular,
todo aparelho e toda internet** — sem o autor precisar saber nada disso. Este documento diz o
que o sistema garante sozinho, o que fica a cargo do autor (e como o editor avisa), e o que é
da Shopify e não está ao nosso alcance. As regras vêm de duas fontes lidas em 22/09, citadas
em cada linha: o guia de desempenho de temas da Shopify
(`shopify.dev/docs/storefronts/themes/best-practices/performance`) e os artigos do web.dev
sobre LCP, INP e `content-visibility`.

## 1. O que o sistema garante sozinho

| Regra | Onde | Fonte |
|---|---|---|
| **Layout mínimo por padrão.** Página normal nasce sem cabeçalho/rodapé; página de produto nasce no modo leve (só a nossa seção). O layout do tema — e os 9 pedidos / ~21 KB gz de CSS+JS que ele carrega em toda página — vira opção que se liga por página. | `Page.showChrome=false`, `Page.bareLayout=true`, `layout/theme.dvfly.liquid` | Shopify: "remove render-blocking app scripts", "minimize separate stylesheet links" — medido em `PROGRESSO.md` 21/09 |
| **Zero JS nosso** salvo bloco que precise (animação, abas, contagem, formulário), cada módulo < 512 bytes, `type="module"` (deferido). | `compile.ts`, `blocks.ts` `RUNTIME` | Shopify: "use defer on non-critical scripts" |
| **CSS inline, deduplicado, só o que a página usa.** Nada de `<link>` nosso. | `css.ts`, `toFragment` | web.dev LCP: "reduce or inline render-blocking stylesheets" |
| **A primeira imagem é o LCP**: nunca lazy, `fetchpriority="high"`, `<link rel="preload" imagesrcset imagesizes>`; as outras `loading="lazy"`; todas `decoding="async"`. | `images.ts`, `blocks.ts`, `html-optimize.ts` | Shopify: "never lazy-load the LCP image", "apply fetchpriority=high"; web.dev LCP: resource load delay |
| **Imagem do CDN entra no tamanho da tela**: `srcset` de 360 a 2048 px, `sizes` a partir da largura declarada, nunca acima de 2× dela. | `images.ts` `responsiveImage` | Shopify: "responsive images with srcset and sizes" |
| **Dimensão em toda imagem** (o editor mede sozinho ao colar a URL; no HTML colado, o botão "Medir imagens"). Sem dimensão = aviso. | `ImageFields`, `HtmlFields`, `html/image-missing-dimensions` | Shopify: "include width and height to prevent CLS" |
| **`preconnect` ao CDN da Shopify** antes do `content_for_header`, sem `crossorigin` (imagem não é CORS). | `LAYOUT` em `templates.ts` | Shopify: "use preconnect to warm up critical third-party domains" |
| **Animação nunca esconde o que já está na tela.** O runtime `reveal` só aplica o pré-estado (opacidade 0) ao que está fora da janela; o herói pinta de primeira. Pré-estado sem transição; só a entrada anima. | `blocks.ts` `RUNTIME.reveal`, `ANIMATION_CSS` | Shopify: "don't hide the LCP image behind animations"; o 96 com `NO_LCP` de 21/09 era exatamente isto |
| **Seções abaixo da dobra renderizam quando chegam perto** (`content-visibility:auto` + `contain-intrinsic-size:auto 600px`) — só as seções de topo depois do primeiro bloco. Medido: relayout completo de 120 seções, 115 ms → 2,6 ms. | `BELOW_FOLD_CSS`, `compile.ts` | web.dev `content-visibility`; web.dev INP: "use content-visibility for lazy rendering of off-screen elements" |
| **HTML colado sai sem comentários** (`comment:false` no parser) e com o CSS do autor sem comentários (`scopeCss`). | `html-optimize.ts` | bytes |
| **Bloco escondido não vai** (omissão, não `display:none`). | `compile.ts` `render` | bytes, DOM menor (web.dev INP: "reduce DOM size") |
| **Sem `<style>`/`<link>` em cascata sobre o tema**: o CSS do autor é escopado ao `.dvf-page`; o do tema não entra no `[data-dvf-raw]`. | `scopeCss`, `GEOMETRY_SAFE_RESET` | Shopify: "animate with transform/opacity" (não regra de peso, de correção) |

## 2. O que fica com o autor — e o aviso que o editor dá

| Situação | Aviso (código) | O conserto que o aviso já traz |
|---|---|---|
| `<link rel="stylesheet">` no HTML colado sem `media` de adiamento | `html/blocking-stylesheet` | `media="print" onload="this.media='all'"` + cópia em `<noscript>` |
| `@import` dentro de `<style>` | `html/blocking-stylesheet` | trocar por `<link>` com o padrão acima |
| `<script src>` sem `defer`/`async`/`type=module` | `html/blocking-script` | `defer` (ou `async` se independente) |
| Imagem de serviço de exemplo (`via.placeholder.com`…) | `html/image-placeholder` (erro) | trocar pela foto real |
| Imagem sem `width`/`height` | `html/image-missing-dimensions` | botão "Medir imagens" |
| Imagem sem `alt` | `html/image-missing-alt` (erro) | `alt=""` se decorativa |
| `onclick` navegando | `html/click-handler-instead-of-link` | `<a href>` |
| Fonte do Google Fonts | (dentro do aviso da folha) | `display=optional`: se a fonte não chega em ~100 ms, a visita usa a reserva e a próxima usa a fonte — nunca a troca tardia que re-renderiza o título (CLS) |

Regras de fonte que o autor decide (Shopify, "CSS & Fonts"): fonte do sistema é a mais rápida;
fonte própria hospedada no CDN da Shopify é a segunda; Google Fonts é a mais lenta (duas
conexões novas). `size-adjust` na `@font-face` reduz o pulo da troca.

## 3. O que é da Shopify e dos apps embutidos

- O `<head>` da Shopify (`content_for_header`): analytics, consentimento, pagamentos, pixels.
  Fica em qualquer layout. Não é nosso e não sai.
- Apps embutidos (o formulário COD do EasySell, na Mini Plancha ≈ 53 KB de script inline +
  `easysell.js`): entram pelo `content_for_header`, não pelo tema. Sair do layout do tema não
  os tira; só desinstalar/desativar o app tira. O TBT (tempo de bloqueio) de uma página com
  esses apps é deles.
- TTFB: servidor da Shopify + CDN. A nossa parte é o HTML ser pequeno (o compilado da Mini
  Plancha: 63 KB dos 139 KB do documento; o resto é tema + Shopify + apps).

## 4. Como medir (e como não se enganar)

- **PageSpeed Insights no celular** é a medida que vale; o de PC quase sempre passa.
- Um 96 com `LCP: NO_LCP` não é 96: é "não consegui medir". Foi o caso em 21/09 (herói com
  `opacity:0`).
- O primeiro conserto sempre é o **elemento do LCP** e a **fase** dele (TTFB / atraso de
  carregamento / carregamento / atraso de renderização — web.dev). O relatório mostra em
  "Largest Contentful Paint element".
- CLS que aparece do nada depois de uma mudança de fonte é troca de fonte (`display=swap`).
- Medir o que está no ar, não o que está no repositório: em 22/09 a página no ar tinha a
  LP com `display=swap` e o `<link>` bloqueante — a versão corrigida estava só no repo.
