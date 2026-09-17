import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { DEFAULT_DEPOT, PLANNING_AREAS } from './lebanon-geography.js';

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

  await seedDemoDay();

  console.log('Seeded planning areas, localities, settings, a demo login and a demo day.');
  console.log(`  sign in: ${email} / loadless`);
}

/**
 * The brief's own scenario, ready to look at on first run: Khalde, Saida and Nabatieh already
 * booked, so a second Khalde request demonstrates the return-journey slot immediately.
 */
async function seedDemoDay(): Promise<void> {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const date = new Date(`${today}T00:00:00.000Z`);

  const existing = await prisma.appointment.count({ where: { date } });
  if (existing > 0) return;

  // Spaced for the STRAIGHT-LINE estimator, which is what runs with no Google key. Real road
  // times are shorter, so a day that works on estimates works on real data too.
  const demo = [
    { name: 'Rania Haddad', phone: '+961 70 111 222', locality: 'Khalde', address: 'Khalde, near the coastal road', start: hhmm(10), duration: 60, window: [hhmm(8), hhmm(12)] },
    { name: 'Georges Aoun', phone: '+961 71 333 444', locality: 'Saida', address: 'Saida, near the sea castle', start: hhmm(12, 30), duration: 60, window: [hhmm(11), hhmm(16)] },
    { name: 'Nour Khalil', phone: '+961 76 555 666', locality: 'Nabatieh', address: 'Nabatieh, town centre', start: hhmm(15), duration: 60, window: [hhmm(13), hhmm(19)] },
  ] as const;

  for (const entry of demo) {
    const locality = await prisma.locality.findUniqueOrThrow({ where: { name: entry.locality } });
    const customer = await prisma.customer.create({
      data: { name: entry.name, phone: entry.phone },
    });
    const location = await prisma.location.create({
      data: {
        customerId: customer.id,
        addressText: entry.address,
        localityId: locality.id,
        precision: 'LANDMARK',
        latitude: locality.centroidLatitude,
        longitude: locality.centroidLongitude,
        landmarkNotes: 'Demo data — replace with a real pin.',
      },
    });
    await prisma.appointment.create({
      data: {
        customerId: customer.id,
        locationId: location.id,
        date,
        promisedStart: entry.start,
        windowStart: entry.window[0],
        windowEnd: entry.window[1],
        serviceDurationMinutes: entry.duration,
      },
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
