-- Base do `rem` no HTML colado, por página. Desligado (padrão): 16 px, a base do
-- navegador — o tamanho em que a LP aparece em qualquer pré-visualização
-- avulsa, e o visual que foi aprovado (22/09). Ligado: a raiz do tema da loja
-- (10 px nos temas da Shopify), para página desenhada dentro do tema.
ALTER TABLE "Page" ADD COLUMN "remFromTheme" BOOLEAN NOT NULL DEFAULT false;
