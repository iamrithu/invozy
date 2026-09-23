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
const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };

const base = globalForPrisma.prismaBase ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaBase = base;

/** Matches the handful of error shapes a dropped Neon WebSocket connection
 * surfaces as — most commonly after Neon's compute auto-suspends from
 * inactivity and the next query races the reconnect. Deliberately checked
 * by message text (Prisma's Neon adapter doesn't wrap these in one of its
 * own typed error classes), not by anything that could also match a real
 * data/query problem — those should still fail immediately, not retry. */
function isTransientConnectionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /connection terminated|econnreset|socket hang up|terminating connection|closed unexpectedly/i.test(message);
}

/** One retry, after a short delay, for a query that failed purely because
 * the pooled WebSocket connection underneath it had already gone stale —
 * the pool's next connection attempt succeeds essentially every time. Without
 * this, that raw connection error crosses the Server Component/Action
 * boundary as an opaque, message-less object (observed in practice as
 * "Reports/export not working" with nothing more specific to go on) even
 * though the data itself was never the problem — one query just lost its
 * connection mid-flight. A real, non-transient error still surfaces
 * immediately, unretried. */
export const prisma = base.$extends({
  query: {
    async $allOperations({ args, query }) {
      try {
        return await query(args);
      } catch (err) {
        if (!isTransientConnectionError(err)) throw err;
        await new Promise((resolve) => setTimeout(resolve, 300));
        return query(args);
      }
    },
  },
});
