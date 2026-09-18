import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { DEFAULT_DEPOT, PLANNING_AREAS } from './lebanon-geography.js';
import { resetDemoData } from '../src/scripts/demo-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../../.env'), quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] ?? '' }),
});

const hhmm = (h: number, m = 0) => h * 60 + m;

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    // Demo customers must never appear in a real deployment. Production gets its first user
    // from bootstrap-admin.ts instead, which creates an account and nothing else.
    throw new Error('Refusing to seed demo data in production. Use `npm run bootstrap:admin`.');
  }

  await prisma.daySettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      depotLatitude: DEFAULT_DEPOT.latitude,
      depotLongitude: DEFAULT_DEPOT.longitude,
      depotLabel: DEFAULT_DEPOT.label,
      workdayStart: hhmm(8),
      workdayEnd: hhmm(19),
      defaultServiceMinutes: 120,
      accessBufferMinutes: 10,
    },
  });

  for (const area of PLANNING_AREAS) {
    const planningArea = await prisma.planningArea.upsert({
      where: { name: area.name },
      update: { colorToken: area.colorToken, description: area.description },
      create: { name: area.name, colorToken: area.colorToken, description: area.description },
    });

    for (const locality of area.localities) {
      await prisma.locality.upsert({
        where: { name: locality.name },
        update: {
          planningAreaId: planningArea.id,
          centroidLatitude: locality.latitude,
          centroidLongitude: locality.longitude,
        },
        create: {
          name: locality.name,
          planningAreaId: planningArea.id,
          centroidLatitude: locality.latitude,
          centroidLongitude: locality.longitude,
        },
      });
    }
  }

  const email = 'admin@gmail.com';
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: 'Admin', passwordHash: await hashPassword('loadless') },
  });

  await resetDemoData(prisma);

  console.log('Seeded planning areas, localities, settings, a demo login and a demo day.');
  console.log(`  sign in: ${email} / loadless`);
}
