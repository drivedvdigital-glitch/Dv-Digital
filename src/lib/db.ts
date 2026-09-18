import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

// O Next.js recarrega os módulos a cada edição em desenvolvimento. Sem o cache
// no globalThis, cada reload abriria uma nova conexão até estourar o limite.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não está definida. Copie .env.example para .env antes de subir o app.",
    );
  }

  // A partir do Prisma 7 a conexão passa por um driver adapter. Para trocar
  // para PostgreSQL, use @prisma/adapter-pg aqui e mude o provider no schema.
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
