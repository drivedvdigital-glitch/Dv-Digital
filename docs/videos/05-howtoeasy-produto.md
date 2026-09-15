# RELATÓRIO 05 — How to Easy · Página de produto (6:49, frames 18/07/2026)

ID `idUbnyZBueM` · mesma bancada do rel. 02.

## Achado estrutural

**Product details é um CONTÊINER, não um bloco fechado**: sub-elementos nomeados e
editáveis na árvore — Product media, Product title, Product price, Product description,
Product variant, Product quantity, Product add to cart — aninhados em Flex blocks.
Selecionar o produto já traz o add-to-cart integrado. Product list usa COLEÇÃO como
fonte; layout Grid|Slideshow; Items per row; Fill last row.

## Padrões a copiar (antes de qualquer elemento novo)

- **Ícone de dispositivo ao lado do rótulo** dos campos com valor por breakpoint
  (Items per row, Button width, Layout type…) — sem isso o usuário não sabe o que é
  responsivo e o que é global.
- **Estados vazios com a rota completa do conserto**: "Please select a product in
  General > Product source" — caixa laranja no canvas, no lugar do elemento.
- Aviso "só funciona na página publicada" repetido POR gatilho de animação (When
  visible + When mouse over — dois gatilhos independentes).
- Lazy load como decisão POR elemento exposta com o benefício explicado.
- Segmentado de 2 opções para binários de layout (nunca checkbox solto); slider+número+
  unidade para dimensões; seções colapsáveis padronizadas (Source Type, Content, Layout,
  Visibility, Attributes, Animation); ajuda cinza + "Learn more".
- Attributes: HTML ID e HTML class por elemento.
- YouTube: Start/End em Mins+Secs separados; aviso condicional de autoplay×mute.
- Busca de elementos por nome (com 32+40 itens, busca é necessidade).
- Renomear itens da árvore.

## Sinais de fragilidade deles

- Autor DESISTE da IA ao vivo ("não ficou muito bom") e digita à mão.
- Upload de vídeo FALHA na gravação (com o "Optimize" travado do rel. 02: caminho de
  mídia tem problema).
- **BUG em produção: chaves i18n cruas vazando** (`flymate_tone_persuasive`,
  `flymate_creds_used`, `flymate_layout_quick_template_text`) em 3 lugares da IA.
  Lição: se D&VFly for multi-idioma, teste que quebre build com chave crua na tela.
- "Facebook Like" legado dentro de template moderno; GMap e outro elemento exigem
  código/chave — "no code" com asteriscos.

## Valores padrão vistos

Quantity button 45×45px, icon 30%; Items per row 2; Map 330px zoom 10 Roadmap;
Mute video ligado.
