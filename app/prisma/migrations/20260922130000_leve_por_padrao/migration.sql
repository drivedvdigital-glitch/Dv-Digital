-- A página mais leve passa a ser a página padrão (22/09). Cabeçalho e rodapé
-- do tema — e, com eles, o CSS e o JS que o layout do tema carrega em toda
-- página — viram opção que se liga, não padrão que se desliga. Página de
-- produto nasce no modo leve (só a nossa seção, no layout mínimo).
ALTER TABLE "Page" ALTER COLUMN "showChrome" SET DEFAULT false;
ALTER TABLE "Page" ALTER COLUMN "bareLayout" SET DEFAULT true;

-- As páginas que já existem seguem a mesma regra: pedido explícito de que
-- TODAS fiquem o mais leves possível. Vale a partir da próxima publicação de
-- cada uma; o editor mostra o estado e cada página pode voltar atrás na sua
-- configuração.
UPDATE "Page" SET "showChrome" = false WHERE "showChrome" = true;
UPDATE "Page" SET "bareLayout" = true WHERE "pageType" = 'product' AND "bareLayout" = false;
