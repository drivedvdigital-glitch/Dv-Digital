-- A loja só usa o app depois que alguém digitou a senha de acesso
-- (DVFLY_ACCESS_KEY). Nulo = ainda não liberada. Sem senha configurada, a
-- coluna não decide nada.
ALTER TABLE "Store" ADD COLUMN "authorizedAt" TIMESTAMP(3);
