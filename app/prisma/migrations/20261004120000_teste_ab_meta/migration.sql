-- Teste A | B: meta opcional de cliques (somando todas as versões) em que o
-- teste pausa sozinho, e quando isso aconteceu.
ALTER TABLE "AbTest" ADD COLUMN "clickGoal" INTEGER;
ALTER TABLE "AbTest" ADD COLUMN "goalReachedAt" TIMESTAMP(3);
