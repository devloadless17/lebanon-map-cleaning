/**
 * Wipes visitor bookings and restores the seeded demo day.
 *
 * A prospect clicks around for days; without this the demo fills up with their own
 * test bookings and the next viewer sees a mess.
 */
import { db } from './prisma';
import { resetDemoData } from './demo-data';
import { Logger } from './logger';

const log = new Logger('reset-demo');

const count = await resetDemoData(db());
log.log(`Demo day restored — ${count} appointments.`);
await db().$disconnect();
