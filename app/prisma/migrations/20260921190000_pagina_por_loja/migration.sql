-- Cada página passa a ter uma loja "dona": aquela de cujo admin ela foi
-- criada. É uma regra de arquivamento, não de propriedade — a publicação em
-- várias lojas continua igual. Serve para a lista mostrar, por padrão, só o
-- que é da loja em que você está, em vez de misturar Hungria com Colômbia.
ALTER TABLE "Page" ADD COLUMN "ownerStoreId" TEXT;

-- Apagar uma loja NÃO pode levar junto as páginas escritas a partir dela.
ALTER TABLE "Page" ADD CONSTRAINT "Page_ownerStoreId_fkey"
  FOREIGN KEY ("ownerStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Page_ownerStoreId_idx" ON "Page"("ownerStoreId");

-- As páginas que já existem: a dona é a loja onde a página foi publicada
-- primeiro. É o melhor palpite que os dados sustentam, e é o certo para o
-- caso real (cada página nasceu para uma loja e foi publicada nela).
-- Página nunca publicada fica com NULL de propósito: aparece em TODAS as
-- listas, porque perder uma página escrita antes desta coluna seria pior do
-- que mostrá-la demais.
UPDATE "Page" p
SET "ownerStoreId" = (
  SELECT d."storeId" FROM "Deployment" d
  WHERE d."pageId" = p."id"
  ORDER BY d."publishedAt" ASC
  LIMIT 1
)
WHERE p."ownerStoreId" IS NULL;
