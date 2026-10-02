-- Teste A | B: último clique recebido (contagem em lote), como a versão A é
-- mostrada (na própria URL, sem redirecionamento, ou por ?view=) e por quê,
-- os períodos no ar (pedidos com o teste pausado não contam) e a última
-- gravação na loja que falhou.
ALTER TABLE "AbTest" ADD COLUMN "lastHitAt" TIMESTAMP(3);
ALTER TABLE "AbTest" ADD COLUMN "entryMode" TEXT;
ALTER TABLE "AbTest" ADD COLUMN "entryModeNote" TEXT;
ALTER TABLE "AbTest" ADD COLUMN "liveSpans" TEXT;
ALTER TABLE "AbTest" ADD COLUMN "applyError" TEXT;

-- Testes que já estavam no ar: o último clique é o da hora mais recente com
-- clique (precisão de hora), em vez de "nenhum clique".
UPDATE "AbTest" SET "lastHitAt" = (
  SELECT MAX(s."hour") FROM "AbStat" s WHERE s."testId" = "AbTest"."id" AND s."clicks" > 0
);
