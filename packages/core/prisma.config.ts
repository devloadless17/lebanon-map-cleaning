import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

// In a container DATABASE_URL is already in the environment. Locally it lives in the repo-root
// .env, so that the API and the web app cannot drift apart on one connection string.
//
// The dotenv import is deliberately lazy and guarded: it is a dev dependency, so it is absent
// from the pruned production image — where this branch never runs.
if (!process.env['DATABASE_URL']) {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const { config } = await import('dotenv');
    config({ path: path.resolve(here, '../../.env'), quiet: true });
  } catch {
    // No dotenv available: fall through and let the missing URL fail loudly below.
  }
}

// Prisma 7 removed `url` from the datasource block in schema.prisma; migrations read it here,
// and the runtime client takes a driver adapter instead.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  migrations: {
    // `migrate dev` no longer runs the seed on its own, so it is wired explicitly.
    seed: 'tsx prisma/seed.ts',
  },
});
