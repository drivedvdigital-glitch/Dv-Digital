import { defineConfig } from "prisma/config";

// O Prisma 7 não carrega mais o .env automaticamente, e a URL de conexão saiu
// do schema.prisma. Carregamos aqui para os comandos de migração/seed do CLI.
try {
  process.loadEnvFile(".env");
} catch {
  // Sem .env em disco (CI, container); as variáveis já vêm do ambiente.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
