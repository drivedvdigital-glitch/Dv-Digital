# RELATÓRIO 10 — Be Wiser Clips · Product list completo (carrossel) — 1:27

ID `Zn_mqL7nky0` · catálogo PageFly 29/Shopify 37 (Winter '26, geração um pouco anterior).

## O achado conceitual (ADOTADO para o nosso plano de produto)

**Não existe elemento "carrossel": é o Product list com Layout type Grid → Slideshow.**
Um controle. Economiza um elemento no catálogo e compartilha toda a config de dados
entre grade e carrossel. O nosso futuro "Produtos (lista)" nasce assim.

## Inspetor completo do Product list

- Custom collection → card + "Select collection" (modal com busca, **seleção única por
  radio**, Cancel/Select)
- Items per loading (padrão 4) + **aviso honesto de limite de plataforma**: "Due to
  limitations set by Shopify… maximum of 50 products. Learn more" — NOMEIA a origem do
  limite e linka a doc. Padrão a copiar em toda mensagem de limite nossa.
- Layout: Layout type Grid|Slideshow · Items per row (4) · Fill last row Yes|No ·
  **Alignment = seletor de 9 pontos (grade 3×3)** · Item spacing
- Styling: dimensionamento **Fill | Hug | Custom** (+Min/Max) — vocabulário de design
  tool; nosso vocabulário `width: fill|hug|comprimento` já bate ✓ · **margin aceita
  negativo** (-15px) — se permitirmos, avisar visualmente
- Content ≠ Layout: "Items per loading" (dados) e "Items per row" (grade) em seções
  separadas — separação certa, nomes confundíveis (nomear melhor no nosso)

## Não copiar

**Publicidade dentro do inspetor** ("Suggested product sources" com Install app do
AutoDS/DSers, onde o usuário decide a fonte dos produtos). Modelo de negócio deles;
nosso painel não compete pela atenção do dono.

## Pendência

Controles próprios do modo Slideshow (setas, bolinhas, autoplay, loop, velocidade) não
mostrados — ficam abaixo de Item spacing. Buraco para um próximo vídeo de carrossel.
