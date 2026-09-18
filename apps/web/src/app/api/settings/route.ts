import { daySettingsSchema, type DaySettings } from '@lebanon/contracts';
import { db, definedOnly } from '@lebanon/core';
import { body, route } from '@/server/handler';
import { requireUser } from '@/server/session';

/** Created on first read rather than thrown, so a fresh deployment is configurable from the UI. */
const DEFAULTS = {
  id: 'singleton',
  depotLatitude: 33.8959,
  depotLongitude: 35.4797,
  depotLabel: 'Hamra, Beirut',
  workdayStart: 0,
  workdayEnd: 23 * 60 + 59,
  defaultServiceMinutes: 120,
  accessBufferMinutes: 10,
};

const toSettings = (row: Record<string, unknown>): DaySettings => ({
  depotLatitude: Number(row['depotLatitude']),
  depotLongitude: Number(row['depotLongitude']),
  depotLabel: String(row['depotLabel']),
  workdayStart: Number(row['workdayStart']),
  workdayEnd: Number(row['workdayEnd']),
  defaultServiceMinutes: Number(row['defaultServiceMinutes']),
  accessBufferMinutes: Number(row['accessBufferMinutes']),
});

export function GET() {
  return route(async () => {
    await requireUser();
    const row = await db().daySettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: DEFAULTS,
    });
    return toSettings(row as unknown as Record<string, unknown>);
  });
}

export function PATCH(request: Request) {
  return route(async () => {
    await requireUser();
    const input = await body(request, daySettingsSchema.partial());
    const row = await db().daySettings.update({
      where: { id: 'singleton' },
      data: definedOnly(input),
    });
    return toSettings(row as unknown as Record<string, unknown>);
  });
}
