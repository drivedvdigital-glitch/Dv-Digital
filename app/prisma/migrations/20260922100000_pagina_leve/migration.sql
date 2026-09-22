-- Página de produto "leve": só a nossa seção, no layout mínimo do D&VFly — sem
-- as seções de produto do tema e sem o CSS/JS do tema. Medido na primeira LP no
-- ar (21/09): o layout do tema trazia 9 pedidos e ~21 KB gzip de CSS/JS que a
-- página não usava. O <head> da Shopify e os apps embutidos (formulário COD)
-- continuam, porque o layout mantém o content_for_header.
ALTER TABLE "Page" ADD COLUMN "bareLayout" BOOLEAN NOT NULL DEFAULT false;
