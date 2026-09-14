import { PrismaClient } from '@prisma/client';

/**
 * One client, reused across hot reloads. Vite re-evaluates modules on every
 * change, and a fresh PrismaClient per reload exhausts the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
