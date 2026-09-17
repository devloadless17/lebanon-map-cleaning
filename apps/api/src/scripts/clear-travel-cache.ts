import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Drops cached travel legs so the next recalculation re-measures them.
 *
 * Needed when the routing provider changes: legs measured by the straight-line estimator are
 * cached like any other, so without clearing them a freshly connected Google key appears to do
 * nothing. By default only the estimates go; pass --all to drop real measurements too.
 */
async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set.');

  const all = process.argv.includes('--all');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const { count } = all
      ? await prisma.travelLeg.deleteMany()
      : await prisma.travelLeg.deleteMany({ where: { estimated: true } });
    await prisma.routeGeometry.deleteMany({});
    console.log(`Cleared ${count} cached ${all ? '' : 'estimated '}travel legs.`);
    console.log('The next time a day is opened its distances are measured again.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
