import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { resetDemoData } from './demo-data.js';

/**
 * Rebuilds the demo bookings relative to today. Intended to run nightly on the demo server, so
 * a prospect exploring over several days always lands on a populated schedule rather than on
 * whatever the last visitor left behind.
 */
async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const created = await resetDemoData(prisma);
    console.log(`Demo data reset — ${created} appointments across 3 days from today.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
