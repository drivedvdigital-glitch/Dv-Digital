# Prompt para o gerador de LP (colar no início de todo pedido)

O texto abaixo vai no começo do pedido ao gerador de HTML (ChatGPT, Claude, Gemini, o que for).
Ele faz a LP nascer do jeito que o D&VFly publica melhor: o compilador ainda faz a parte dele
(srcset, preload da primeira imagem, lazy nas outras, escopo do CSS), mas o que está aqui é o
que só o autor do HTML pode garantir. Regras tiradas do guia de desempenho da Shopify e do
web.dev; a lista completa com as fontes está em `docs/DESEMPENHO.md`.

---

```
Você vai escrever o HTML de uma landing page que será colada dentro de um bloco de HTML de um
construtor de páginas para Shopify. O HTML vai parar DENTRO de uma seção do tema, no meio de
uma página que já tem <html>, <head> e <body>. A página é medida no PageSpeed Insights em
celular (Moto G, 4G lento) e a meta é nota acima de 90 com LCP < 2,5 s, CLS = 0 e TBT < 50 ms.
Siga TODAS as regras abaixo; elas valem mais do que qualquer preferência de estilo.

ESTRUTURA
1. Entregue só o trecho: NÃO escreva <!doctype>, <html>, <head>, <body>, <title> nem <meta>.
2. Tudo dentro de UM elemento raiz com id único, por exemplo <div id="lp-nome-do-produto">.
   Toda classe da LP começa com um prefixo curto e único (ex.: "mpp-"), para nunca colidir
   com o tema da loja.
3. Todo o CSS num único <style> no começo do trecho. Todo seletor começa pelo id da raiz ou
   pelo prefixo. NUNCA estilize html, body, :root, * ou tags soltas (p, h2, img, a) sem o
   prefixo na frente.
4. Exatamente UM <h1>. Hierarquia h2/h3 depois dele. Cada botão de ação é um <a href> de
   verdade (nunca <div onclick>). Botões que levam à oferta usam href="#id-da-oferta".
5. Nada de Liquid: não escreva {{ }}, {% %} nem a palavra endraw em lugar nenhum.
6. Sem comentários HTML enormes; o compilador apaga comentários, então não conte com eles
   para nada.

PESO (orçamento: o trecho inteiro abaixo de 80 KB, CSS abaixo de 25 KB, JS abaixo de 8 KB)
7. Sem frameworks nem bibliotecas: nada de Tailwind por CDN, Bootstrap, jQuery, Swiper,
   AOS, GSAP, Font Awesome. Ícone é SVG inline pequeno (< 400 bytes) ou caractere Unicode.
8. Sem <link rel="stylesheet"> para arquivo externo e sem @import. A única exceção são as
   fontes (regra 13).
9. Sem <script src="..."> externo. Se precisar de JavaScript, um único <script> inline no
   FIM do trecho, sem setInterval, sem MutationObserver em "attributes", sem laços que leem
   layout (getBoundingClientRect, offsetHeight, getComputedStyle) alternando com escritas:
   leia tudo primeiro, escreva tudo depois. Listeners de scroll com {passive:true}.
10. Sem iframe, vídeo com autoplay ou mapa acima da dobra. Vídeo, quando houver, só com
    poster (imagem) e preload="none".

IMAGENS
11. Toda <img> tem src, alt, width e height com os pixels REAIS do arquivo (não invente:
    se não souber, deixe width="0" height="0" e o editor mede). A primeira imagem da página
    é o herói: ela NÃO recebe loading="lazy" (o compilador cuida da prioridade). Nas outras
    não precisa escrever loading nem srcset; o compilador escreve.
12. Nunca use serviços de imagem de exemplo (via.placeholder.com, placehold.co, picsum,
    unsplash aleatório). Onde a foto ainda não existe, ponha um <img> com src em SVG inline
    data:image/svg+xml (um quadrado cinza com o texto do que vai ali) e o atributo
    data-placeholder, para ser trocado depois. Fotos reais virão do CDN da Shopify
    (cdn.shopify.com/s/files/...).
    Nunca use background-image de CSS para a imagem principal; herói é <img>.
    Tamanho do herói no celular por largura, nunca por altura da tela: use
    width: min(100%, 80vw, 480px) e aspect-ratio; nunca vh, dvh ou svh.

FONTES
13. Preferência: fonte do sistema (font-family: system-ui, -apple-system, "Segoe UI",
    Roboto, sans-serif) — zero download. Se o design exigir Google Fonts, exatamente assim,
    e nada diferente:
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=NOME:wght@700&display=optional" media="print" onload="this.media='all'">
      <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=NOME:wght@700&display=optional"></noscript>
    No máximo 2 famílias e 4 pesos no total. display=optional é obrigatório (display=swap
    causa layout shift). Sempre declare a fonte reserva do sistema na font-family.

LAYOUT E MOVIMENTO
14. Nada pode começar invisível acima da dobra: o título, o subtítulo, o herói e o primeiro
    botão nascem com opacity 1. Animação de entrada só em blocos abaixo da dobra, e só via
    classe adicionada por JavaScript ao entrar na tela (IntersectionObserver); sem JS, tudo
    fica visível. Anime só transform e opacity; nunca width, height, top, margin.
15. Respeite @media (prefers-reduced-motion: reduce): sem animação.
16. Nada de layout shift: espaço reservado para tudo que carrega depois (imagens com
    width/height, contadores com largura mínima, faixas fixas com altura fixa). Nada de
    inserir conteúdo acima do que já foi pintado.
17. Sem rolagem horizontal: max-width:100% em imagens e mídia; um letreiro/marquee usa
    overflow:hidden no contêiner. Alvos de toque com pelo menos 44×44 px. Texto do corpo
    com pelo menos 16 px no celular.
18. Sticky bar (barra fixa de compra), se houver, no fim do trecho, position:fixed,
    aparecendo por classe adicionada no scroll — não por setInterval.

PREÇO E TEXTOS EDITÁVEIS
19. Preço, preço antigo, desconto, nota e quantidade de avaliações vêm de um objeto de
    configuração no topo do <script> (LP_CONFIG), aplicado a elementos com classes
    js-price-now, js-price-was, js-off, js-save, js-rating, js-rating-count. Os mesmos
    valores também escritos no HTML, para a página fazer sentido sem JavaScript.

ENTREGA
20. Entregue o trecho completo num único bloco de código, sem explicações no meio. No fim,
    liste em 5 linhas: quantas imagens, qual é a primeira (o herói), quais fontes, tamanho
    aproximado do CSS e do JS, e o que ficou como placeholder.
```

---

Como conferir depois de colar no D&VFly: o painel de avisos do editor não pode mostrar
`html/blocking-stylesheet`, `html/blocking-script`, `html/image-placeholder` nem
`html/image-missing-dimensions`; a barra de status mostra "N imagens · a primeira carrega
antes de tudo"; o tamanho total fica abaixo de 100 KB. Depois de publicar, o PageSpeed no
celular é a nota que vale.
