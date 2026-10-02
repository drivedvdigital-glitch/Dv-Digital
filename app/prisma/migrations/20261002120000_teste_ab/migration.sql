-- "Teste A | B": uma URL de produto que divide os visitantes entre vários
-- produtos por porcentagem; as chegadas por hora (UTC) de cada versão; e uma
-- cópia leve dos pedidos da loja (sem dado de cliente), porque a busca de
-- pedidos da Shopify não filtra por produto.
-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "ordersSyncedTo" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AbTest" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entryProductGid" TEXT NOT NULL,
    "entryHandle" TEXT NOT NULL,
    "entryTitle" TEXT NOT NULL,
    "previousSuffix" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "trackerOrigin" TEXT,
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbVariant" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "productGid" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "AbVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbStat" (
    "variantId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AbStat_pkey" PRIMARY KEY ("variantId","hour")
);

-- CreateTable
CREATE TABLE "AbOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "cancelled" BOOLEAN NOT NULL,
    "test" BOOLEAN NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "productIds" TEXT NOT NULL,

    CONSTRAINT "AbOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AbTest_storeId_idx" ON "AbTest"("storeId");

-- CreateIndex
CREATE INDEX "AbStat_testId_hour_idx" ON "AbStat"("testId", "hour");

-- CreateIndex
CREATE INDEX "AbOrder_storeId_createdAt_idx" ON "AbOrder"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "AbTest" ADD CONSTRAINT "AbTest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbVariant" ADD CONSTRAINT "AbVariant_testId_fkey" FOREIGN KEY ("testId") REFERENCES "AbTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbStat" ADD CONSTRAINT "AbStat_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "AbVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbOrder" ADD CONSTRAINT "AbOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

