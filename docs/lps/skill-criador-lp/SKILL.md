---
name: criador-lp-dvfly
description: Cria landing pages de produto (COD, Shopify, colada num bloco de HTML do D&VFly) que carregam rápido no celular e convertem — primeira dobra no formato padrão (nota, título em 2 linhas, subtítulo, foto grande, preço, botão, selos), seções de dor, passos, benefícios, objeções, oferta, opiniões, garantia e FAQ. Use sempre que pedirem uma LP, página de produto ou landing page nova, ou para refazer uma no formato padrão.
---

# Criador de LP — formato padrão D&VFly

Você escreve o HTML de UMA landing page de produto que será colada num bloco de HTML do
D&VFly (construtor de páginas para Shopify). Vendas por **pagamento na entrega** (app EasySell),
tráfego de anúncio, quase tudo **celular Android em 4G**. A página tem de: (1) mostrar tudo que
vende na primeira tela, (2) carregar rápido, (3) responder as dúvidas antes de a pessoa perguntar,
(4) ser honesta — página que promete demais vira pedido recusado na porta.

Se faltar algo da lista de ENTRADA, pergunte antes de escrever. Não invente preço, prazo,
quantidade de clientes nem resultado.

## ENTRADA (peça ao usuário)

- Produto: nome, o que é, como se usa, o que vem no kit, variações (cor/tom).
- Preço agora, preço antigo, economia; país e moeda; idioma da página.
- Prazo de entrega, frete, forma de pagamento (contra entrega?).
- Nota e número de avaliações **reais** (ou deixar vazio).
- Depoimentos **reais** (texto, nome, cidade, foto com autorização) — ou nenhum.
- Fotos já prontas (URLs do CDN da Shopify) e o tamanho de cada uma; se não houver, você entrega
  os prompts de imagem (seção IMAGENS) e usa placeholders.
- Cor da marca (uma) e se a página é clara ou escura.

## ESTRUTURA (nesta ordem)

1. **Primeira dobra** (template abaixo, obrigatório).
2. **Faixa rolando** com 4–5 benefícios curtos.
3. **Dor / identificação** — "¿Te pasa esto?": foto da situação + 3–4 frases que a pessoa já
   pensou + uma frase de virada ("Con X, …").
4. **Como se usa** — 3 passos, cada um com foto, título de 3 palavras e 1 frase.
5. **Benefícios** — 6 cartões com ícone SVG, título curto e 1 frase concreta.
6. **Dia a dia / objeções** — 3 cartões com foto, cada um quebrando UMA objeção (tamanho,
   pagamento, sujeira/mancha, dificuldade, durabilidade — as que o produto realmente tem).
7. **Frase de impacto** com botão.
8. **Oferta** (`id` da âncora da oferta): foto do kit, lista do que vem, preço, economia, botão,
   "pagas al recibir", selos.
9. **Opiniões** — só reais. Sem depoimento real, NÃO crie a seção (nunca invente nome, cidade,
   foto ou texto de cliente).
10. **Garantia / pagamento na entrega.**
11. **FAQ** — 6 a 8 perguntas, as objeções de verdade (como se usa, quanto dura, mancha?,
    precauções, prazo, como pago, e se chegar com problema).
12. **Chamada final** com botão.
13. **Aviso legal** curto (uso, precauções, "resultados pueden variar", prazo estimado).
14. **Barra fixa** de compra (aparece quando o botão do herói sai da tela).

## PRIMEIRA DOBRA — template obrigatório

Ordem: **nota → título (2 linhas) → subtítulo → foto grande → preço → economia → botão → selos.**
Tudo isso cabe numa tela de 360×640 e de 412×823 sem rolar. Copie o CSS e o HTML abaixo,
trocando só `lp-x` pelo id da sua página, as cores e os textos.

Título em **exatamente 2 linhas**, com `<br>` no meio. O tamanho da letra é calculado pela linha
mais longa: `divisor = 0,43 × número de caracteres da linha mais longa` (contando espaços, em
MAIÚSCULA na Barlow Condensed 800). Ex.: "PEINE APLICADOR FÁCIL DE USAR" = 29 → divisor 12,4.
Linha mais longa com no máximo 30 caracteres. As `@font-face` "lp-t1/t2/t3" encolhem a fonte
reserva do aparelho até a largura da Barlow — sem elas, na primeira visita o título vira 3 linhas.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=DM+Sans:wght@400;600&display=optional" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=DM+Sans:wght@400;600&display=optional"></noscript>

<div id="lp-x" style="background:#0D0D0D;color:#F5F0E8">
<style>
@font-face{font-family:"lp-t1";src:local("Roboto Condensed Bold"),local("RobotoCondensed-Bold");font-weight:700 900;size-adjust:85%}
@font-face{font-family:"lp-t2";src:local("Roboto Bold"),local("Roboto-Bold");font-weight:700 900;size-adjust:75%}
@font-face{font-family:"lp-t3";src:local("Arial Bold"),local("Arial-BoldMT"),local("Liberation Sans Bold"),local("LiberationSans-Bold");font-weight:700 900;size-adjust:68%}
#lp-x{
  --bg:#0D0D0D;--bg2:#1A1814;--ink:#F5F0E8;--ink-2:#C8BFA8;--muted:#7A7060;
  --brand:#C9A45C;--line:#2E2A22;--star:#C9A45C;--r:10px;--r-lg:16px;
  --display:"Barlow Condensed","lp-t1","lp-t2","lp-t3","Roboto Condensed","sans-serif-condensed","Avenir Next Condensed","Bahnschrift Condensed","Arial Narrow",system-ui,-apple-system,sans-serif;
  --sans:"DM Sans",system-ui,-apple-system,sans-serif;
  font-family:var(--sans);color:var(--ink);background:var(--bg)!important;
}
#lp-x *{box-sizing:border-box}
#lp-x img{display:block!important;max-width:100%!important;height:auto;margin:0!important;border:0!important}
#lp-x h1,#lp-x h2,#lp-x h3{font-family:var(--display)!important;margin:0!important;color:var(--ink)!important;line-height:1.02!important;letter-spacing:-.01em;text-transform:uppercase}
#lp-x p{margin:0;color:var(--ink-2);line-height:1.6}
#lp-x .wrap{max-width:1040px;margin:0 auto;padding:0 20px}
#lp-x .hl{color:var(--brand)}
#lp-x .btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;font-family:var(--display)!important;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#0D0D0D!important;background:linear-gradient(160deg,#D9B76E,#C9A45C 55%,#A9853F);border:0;border-radius:var(--r);cursor:pointer;min-height:56px;padding:16px 28px;font-size:23px;width:100%;text-decoration:none!important}

/* PRIMEIRA DOBRA — px, para caber tudo na 1a tela */
#lp-x .hero{padding:8px 0 24px;background:var(--bg)!important;text-align:center}
#lp-x .hero-copy{display:flex;flex-direction:column;align-items:center;max-width:620px;margin:0 auto}
#lp-x .hero-rating{display:inline-flex;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--line);border-radius:100px;padding:4px 12px;margin-bottom:6px}
#lp-x .hero-rating .st{color:var(--star);font-size:14px;letter-spacing:1px}
#lp-x .hero-rating .rn{font-family:var(--display);font-weight:800;font-size:15px;color:var(--ink)}
#lp-x .hero-rating .rc{color:var(--ink-2);font-size:12px}
#lp-x .hero h1{font-size:clamp(24px,calc((100vw - 40px) / 12.4),50px)!important;line-height:1!important;text-align:center!important}
#lp-x .hero-sub{font-size:clamp(14px,3.8vw,17px);line-height:1.35;margin-top:6px;max-width:40ch;text-align:center!important}
#lp-x .hero-media{margin:10px auto;width:min(100%,480px)}
#lp-x .hero-media .photo{border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--line);aspect-ratio:1/1;background:var(--bg2)}
#lp-x .hero-media .photo img{width:100%!important;height:100%!important;object-fit:cover}
#lp-x .hero-price-row{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin:0 0 4px}
#lp-x .hero-price-row .now{font-family:var(--display);font-weight:800;font-size:clamp(38px,10vw,54px);color:var(--brand);line-height:1}
#lp-x .hero-price-row .was{color:var(--muted);text-decoration:line-through;font-size:15px}
#lp-x .hero-price-row .off{background:var(--brand);color:#0D0D0D;font-family:var(--display);font-weight:800;font-size:13px;padding:4px 10px;border-radius:6px}
#lp-x .hero-save{font-size:13px;color:var(--brand);font-weight:600;margin-bottom:8px;text-align:center!important}
#lp-x .hero .btn{min-height:52px;padding:11px 22px;font-size:19px;max-width:480px}
#lp-x .hero-trust{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;margin-top:10px;font-size:12px;color:var(--ink-2);font-weight:600}
#lp-x .hero-trust span{display:flex;align-items:center;gap:5px}
@media (min-width:820px){
  #lp-x .hero-media{width:min(100%,480px,38vh);width:min(100%,480px,38svh)}
}
/* … resto do CSS da página … */
</style>

<section class="hero" id="lp-x-hero">
  <div class="wrap">
    <div class="hero-copy">
      <div class="hero-rating">
        <span class="st">★★★★★</span>
        <span class="rn js-rating">4.9</span>
        <span class="rc js-rating-count">+2.800 clientes</span>
      </div>
      <h1>Linha um do título<br><span class="hl">palavra-chave</span> linha dois</h1>
      <p class="hero-sub">Subtítulo: o que o produto faz, para quem, em quanto tempo — 2 a 3 linhas.</p>
      <div class="hero-media">
        <div class="photo">
          <img src="https://cdn.shopify.com/s/files/.../heroi.png" alt="Descrição real da foto" width="800" height="800" sizes="(min-width: 820px) min(480px, 38vh), min(calc(100vw - 40px), 480px)">
        </div>
      </div>
      <div class="hero-price-row">
        <span class="now js-price-now">$119.900</span>
        <span class="was js-price-was">$239.900</span>
        <span class="off js-off">50% OFF</span>
      </div>
      <p class="hero-save js-save">Ahorras $120.000 en esta oferta</p>
      <a href="javascript:void(0)" class="btn es-popup-button-overwrite">Pedir mi kit ahora</a>
      <div class="hero-trust">
        <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C9A45C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Pago contra entrega</span>
        <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C9A45C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Envío gratis</span>
        <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C9A45C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Entrega en 2–5 días</span>
      </div>
    </div>
  </div>
</section>
```

Página clara: troque `--bg` (#FFFFFF/#FDF8F2), `--bg2`, `--ink` (#0D1B3E), `--ink-2`, `--line` e a
cor do texto do botão; o resto do template fica igual.

## TEXTO QUE CONVERTE

- **Título**: resultado que a pessoa quer + o mecanismo do produto + facilidade. Verbo no
  início, palavra-chave do produto em destaque (`<span class="hl">`). Nada de "revolucionário",
  "milagroso", "o melhor do mundo".
- **Subtítulo**: para quem é, onde se usa, em quanto tempo — concreto ("raíces y sienes",
  "en 5 minutos", "sin salir de casa").
- **Específico vence genérico**: números reais, situações reais ("las sienes son lo primero que
  se ve en las fotos"). Uma ideia por frase, frases curtas, segunda pessoa (tú).
- **Cada seção responde uma pergunta** do comprador: o que é? funciona para mim? é difícil?
  quanto custa? e se não chegar? como pago?
- **Botões** com verbo e o que a pessoa recebe ("Pedir mi kit ahora", "Confirmar pedido — pago
  al recibir"). Todos com `href="javascript:void(0)" class="btn es-popup-button-overwrite"`
  (abrem o EasySell).
- **Honestidade**: nada de antes/depois montado, nada de promessa médica ou de resultado
  garantido, nada de depoimento, nota ou contagem inventada, nada de contador de estoque falso.
  "Los resultados pueden variar" onde houver resultado. Produto e fotos iguais ao que chega na
  casa da pessoa (senão o pedido é recusado na entrega).
- Idioma da página do começo ao fim (página em espanhol não tem palavra em português).
- Nenhum recado para o lojista dentro do texto ("valida antes de publicar" etc.).

## IMAGENS

Para cada foto que faltar, entregue um prompt (em inglês, para o gerador de imagem) e diga qual
objeção ela responde. Regras: fotorrealista, pessoas do público real (idade, país), luz natural,
casa comum; **sempre anexar a foto real do produto como referência** e pedir o produto idêntico;
sem texto na imagem; resultado realista. Tamanhos: herói 800×800 (1:1, de preferência
1080×1080), dor 1200×900 (4:3), passos 1:1 ou 4:3, objeções 1200×900, kit 800×500 (16:10).
Rosto de cliente nunca é gerado por IA: só foto real com autorização.

Enquanto a foto não existe: `<img>` com `src` em SVG inline (`data:image/svg+xml`, quadrado escuro
com o texto do que vai ali) + atributo `data-placeholder`.

## REGRAS TÉCNICAS (não negociáveis)

1. Só o trecho: sem `<!doctype>`, `<html>`, `<head>`, `<body>`, `<title>`, `<meta>`.
2. Tudo dentro de UM `<div id="lp-…">`; todo seletor começa pelo id. Nunca estilize `html`,
   `body`, `*` ou tags soltas sem o id na frente (exceto as regras do EasySell).
3. Um único `<style>` no começo e um único `<script>` no fim. Exatamente UM `<h1>`.
4. Nada de Liquid (`{{ }}`, `{% %}`), frameworks, CDN de CSS/JS, ícone por fonte, iframe ou vídeo
   com autoplay. Ícones: SVG inline pequeno.
5. Toda `<img>` com `src`, `alt`, `width`, `height` (pixels reais do arquivo) e `sizes` calculado
   pelo CSS. A primeira imagem (herói) sem `loading="lazy"`.
6. Fontes: só o bloco do template (2 famílias, 4 pesos, `display=optional`, `media=print`
   + `noscript`). Tamanhos de texto da primeira dobra em px.
7. Seções abaixo do herói: `.sec:not(.hero){content-visibility:auto;contain-intrinsic-size:auto 600px}`.
8. Media queries com `@media`, nunca `@container` nem `container-type` na raiz.
9. Animação só `transform`/`opacity`, só abaixo da dobra (classe `.reveal` + IntersectionObserver),
   com `@media (prefers-reduced-motion:reduce)` desligando tudo. Nada do herói começa invisível.
10. JavaScript: `LP_CONFIG` no topo (preço, preço antigo, desconto, economia, nota, avaliações)
    aplicado às classes `js-price-now`, `js-price-was`, `js-off`, `js-save`, `js-rating`,
    `js-rating-count`; os mesmos valores escritos no HTML. Barra fixa aparece quando
    `#…-hero .btn` sai da tela, lendo `getBoundingClientRect` dentro de `requestAnimationFrame`
    (no máximo 1 vez por quadro; a primeira leitura 2 quadros depois do carregamento).
    Nenhuma leitura de layout no carregamento, sem `setInterval`. Correção de cor do EasySell
    por `MutationObserver` em `childList`, executada no máximo 1 vez por quadro.
11. Sem rolagem horizontal em 320 px; alvos de toque ≥ 44 px; faixa rolando com
    `overflow:hidden`; um elemento nunca herda `padding` de regra genérica de `span`.
12. Orçamento: trecho < 80 KB, CSS < 25 KB, JS < 8 KB.

## ENTREGA

O HTML completo num único bloco de código. Depois, em até 8 linhas:
- quantas imagens e quais ainda são placeholder (com os prompts, se faltarem fotos);
- a linha mais longa do título e o divisor usado;
- confirmação de que botão do herói, preço e foto cabem em 360×640 e 412×823;
- qualquer dado que você precisou deixar em branco por não ter recebido.

## CONFERIR ANTES DE ENTREGAR

- [ ] Primeira dobra na ordem do template, título em 2 linhas com `<br>`.
- [ ] Nenhum depoimento, nota, número ou resultado inventado.
- [ ] Todo botão de compra com `es-popup-button-overwrite`; o do herói dentro de `#…-hero`.
- [ ] Toda `<img>` com `width`, `height`, `alt` e `sizes`.
- [ ] Nenhuma palavra fora do idioma da página; nenhum recado ao lojista.
- [ ] FAQ responde as objeções reais; aviso legal no fim.
