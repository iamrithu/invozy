import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

// Neon's serverless driver adapter — a WebSocket-based connection instead of
// a raw TCP/TLS Postgres connection. On a serverless host (Vercel), every
// cold function invocation used to pay a full TCP+TLS handshake before its
// first query (measured locally at ~650ms vs ~50-130ms once warm); this
// adapter is Neon's own answer to that cold-start cost.
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaNeon(pool);

// Standard Next.js dev-mode singleton — prevents exhausting the DB connection
// pool from hot-reload creating a new PrismaClient on every file save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
