import { PrismaClient } from '../generated/prisma/client';
import { makeAdapter } from './pg-config';

export type Db = PrismaClient;

/**
 * One client per process, reused across invocations.
 *
 * Serverless changes the rules here. Each cold start would otherwise open a fresh pool, and
 * because many instances run at once they exhaust the database's connection limit long before
 * the traffic justifies it. Caching on globalThis survives the module reloads that hot reload
 * and lambda reuse cause, and the connection string should be a POOLED one (Neon and friends
 * expose one specifically for this).
 */
const globalForPrisma = globalThis as unknown as { __lebanonDb?: PrismaClient };

export function db(): Db {
  if (globalForPrisma.__lebanonDb) return globalForPrisma.__lebanonDb;

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }

  const client = new PrismaClient({ adapter: makeAdapter(connectionString) });
  globalForPrisma.__lebanonDb = client;
  return client;
}
