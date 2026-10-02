-- Teste A | B: início programado (o teste entra no ar sozinho nesse momento)
-- e o motivo, quando o início programado não aconteceu.
ALTER TABLE "AbTest" ADD COLUMN "startAt" TIMESTAMP(3);
ALTER TABLE "AbTest" ADD COLUMN "startError" TEXT;
