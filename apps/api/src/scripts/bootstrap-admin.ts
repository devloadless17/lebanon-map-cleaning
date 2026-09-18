import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { hashPassword } from '../modules/auth/password.js';

/**
 * Creates the FIRST staff account in a real deployment, and nothing else.
 *
 * Lives under src/ so it is COMPILED into dist and runs on production dependencies alone —
 * a script invoked through tsx would need a dev dependency that `npm prune --omit=dev` removes,
 * and would fail at exactly the moment it is needed.
 *
 * Deliberately separate from the seed: production must never receive demo customers.
 */
async function main(): Promise<void> {
  const email = process.env['ADMIN_EMAIL']?.trim().toLowerCase();
  const name = process.env['ADMIN_NAME']?.trim();
  const password = process.env['ADMIN_PASSWORD'];
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');
  if (!email || !name || !password) {
    throw new Error('ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD must all be set.');
  }
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`User ${email} already exists; nothing to do.`);
      return;
    }

    await prisma.user.create({
      data: { email, name, passwordHash: await hashPassword(password) },
    });
    console.log(`Created ${email}.`);

    const settings = await prisma.daySettings.findUnique({ where: { id: 'singleton' } });
    if (!settings) {
      // Without these the engine cannot simulate a day at all, so say so loudly rather than
      // letting the first page load fail mysteriously.
      await prisma.daySettings.create({
        data: {
          id: 'singleton',
          depotLatitude: 33.8959,
          depotLongitude: 35.4797,
          depotLabel: 'Hamra, Beirut',
          workdayStart: 0,
          workdayEnd: 23 * 60 + 59,
          defaultServiceMinutes: 120,
          accessBufferMinutes: 10,
        },
      });
      console.log('Created default day settings — set your real depot and hours in Settings.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
