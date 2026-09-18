import type { PrismaClient } from '../generated/prisma/client';

const hhmm = (h: number, m = 0) => h * 60 + m;

/** The team's day is a Beirut calendar day, never the server's UTC date. */
function beirutDateOffset(days: number): Date {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + days);
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${local}T00:00:00.000Z`);
}

interface DemoStop {
  readonly name: string;
  readonly phone: string;
  readonly locality: string;
  readonly address: string;
  readonly landmark: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly start: number;
  readonly duration: number;
  readonly window: readonly [number, number];
}

/**
 * Three days of plausible work, spaced against REAL road times so no day opens with a warning.
 *
 * Day one is deliberately the brief's own scenario — Khalde, then Saida, then Nabatieh, with
 * the afternoon left open. Adding a second Khalde customer free late in the day is then offered
 * as "works well on the return journey" rather than refused, which is the entire pitch in one
 * interaction.
 */
const DEMO_DAYS: ReadonlyArray<readonly DemoStop[]> = [
  [
    {
      name: 'Rania Haddad', phone: '+961 70 111 222', locality: 'Khalde',
      address: 'Khalde — coastal road, near the petrol station',
      landmark: 'Cream building with blue shutters, entrance from the back lane',
      latitude: 33.8102, longitude: 35.489,
      start: hhmm(10), duration: 60, window: [hhmm(8), hhmm(12)],
    },
    {
      name: 'Georges Aoun', phone: '+961 71 333 444', locality: 'Saida',
      address: 'Saida — near the Sea Castle',
      landmark: 'Second floor, no lift. Ring twice.',
      latitude: 33.563, longitude: 35.372,
      start: hhmm(12, 30), duration: 60, window: [hhmm(11), hhmm(16)],
    },
    {
      name: 'Nour Khalil', phone: '+961 76 555 666', locality: 'Nabatieh',
      address: 'Nabatieh — town centre, above the pharmacy',
      landmark: 'Green door beside the pharmacy',
      latitude: 33.3789, longitude: 35.4839,
      start: hhmm(15), duration: 60, window: [hhmm(13), hhmm(19)],
    },
  ],
  [
    {
      name: 'Maya Fares', phone: '+961 3 777 888', locality: 'Jounieh',
      address: 'Jounieh — old souk, behind the church',
      landmark: 'Blue gate, park on the street',
      latitude: 33.9808, longitude: 35.6178,
      start: hhmm(9, 30), duration: 90, window: [hhmm(8), hhmm(13)],
    },
    {
      name: 'Karim Daou', phone: '+961 71 444 999', locality: 'Jbeil',
      address: 'Jbeil — near the old port',
      landmark: 'Stone house facing the harbour',
      latitude: 34.123, longitude: 35.6519,
      start: hhmm(12), duration: 120, window: [hhmm(11), hhmm(17)],
    },
  ],
  [
    {
      name: 'Salma Rizk', phone: '+961 76 222 333', locality: 'Aley',
      address: 'Aley — main road, above the bakery',
      landmark: 'Third floor, the bell is unmarked',
      latitude: 33.8106, longitude: 35.5972,
      start: hhmm(10), duration: 120, window: [hhmm(9), hhmm(14)],
    },
    {
      name: 'Tony Abou Jaoude', phone: '+961 3 555 121', locality: 'Damour',
      address: 'Damour — off the highway, second right',
      landmark: 'White villa with the olive tree at the gate',
      latitude: 33.7261, longitude: 35.4525,
      start: hhmm(13), duration: 90, window: [hhmm(12), hhmm(18)],
    },
  ],
];

/**
 * Wipes and rebuilds the demo bookings, dated relative to TODAY.
 *
 * Both halves matter for an unattended demo. Dating relative to now means the headline screen
 * is never an empty rail because the data was seeded yesterday; wiping first means a visitor's
 * own test bookings do not accumulate into a mess for whoever looks next. Planning areas,
 * localities, day settings and user accounts are deliberately left alone — this only touches
 * the bookings.
 */
export async function resetDemoData(prisma: PrismaClient): Promise<number> {
  await prisma.appointment.deleteMany();
  await prisma.location.deleteMany();
  await prisma.customer.deleteMany();

  let created = 0;
  for (const [dayOffset, stops] of DEMO_DAYS.entries()) {
    const date = beirutDateOffset(dayOffset);

    for (const stop of stops) {
      const locality = await prisma.locality.findUnique({ where: { name: stop.locality } });
      const customer = await prisma.customer.create({
        data: { name: stop.name, phone: stop.phone },
      });
      const location = await prisma.location.create({
        data: {
          customerId: customer.id,
          addressText: stop.address,
          localityId: locality?.id ?? null,
          // These are real points, not town centres, so the map shows a confident pin rather
          // than an amber "location not confirmed" badge on every single appointment.
          precision: 'EXACT',
          latitude: stop.latitude,
          longitude: stop.longitude,
          landmarkNotes: stop.landmark,
        },
      });
      await prisma.appointment.create({
        data: {
          customerId: customer.id,
          locationId: location.id,
          date,
          promisedStart: stop.start,
          windowStart: stop.window[0],
          windowEnd: stop.window[1],
          serviceDurationMinutes: stop.duration,
        },
      });
      created += 1;
    }
  }

  return created;
}
