import { Injectable } from '@nestjs/common';
import { ROUTED_STATUSES } from '@lebanon/contracts';
import type { DayContext, ScheduledStop } from '../../domain/scheduling/types.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

/** Prisma maps a DATE column to a Date; build it at UTC midnight so no zone can shift the day. */
export function toDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function fromDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * THE single place that materialises "the day".
 *
 * A forgotten status filter elsewhere would silently route the team through a cancelled
 * appointment and poison every travel calculation on the page — the likeliest production bug in
 * a system whose route is derived rather than stored. Keeping exactly one function able to
 * answer "which stops are on this day" is the structural fix; nothing else may order
 * appointments by time.
 */
@Injectable()
export class DayRepository {
  constructor(private readonly prisma: PrismaService) {}

  async stopsFor(date: string, excludeAppointmentId?: string): Promise<ScheduledStop[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        date: toDateOnly(date),
        status: { in: [...ROUTED_STATUSES] },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
      include: {
        customer: true,
        location: { include: { locality: { include: { planningArea: true } } } },
      },
      // The `id` tiebreak is required: Postgres returns an arbitrary and unstable order for
      // equal sort keys, which would make the route flicker between renders.
      orderBy: [{ promisedStart: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({
      appointmentId: row.id,
      label: row.customer.name,
      coordinate: {
        latitude: Number(row.location.latitude),
        longitude: Number(row.location.longitude),
      },
      promisedStart: row.promisedStart,
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      serviceDurationMinutes: row.serviceDurationMinutes,
      flexibility: row.flexibility,
      planningAreaId: row.location.locality?.planningAreaId ?? null,
      planningAreaName: row.location.locality?.planningArea.name ?? null,
    }));
  }

  /**
   * Creates the settings row on first use rather than throwing.
   *
   * `findUniqueOrThrow` here meant a freshly migrated but unseeded database answered the main
   * screen with a 500 — and the one page that could have fixed it, Settings, reads the same
   * row, so there was no way out from inside the app.
   */
  private async settings() {
    const existing = await this.prisma.daySettings.findUnique({ where: { id: 'singleton' } });
    if (existing) return existing;
    return this.prisma.daySettings.create({ data: { ...DEFAULT_SETTINGS } });
  }

  /**
   * `now` is supplied ONLY when the requested date is today in Asia/Beirut — that is what stops
   * the scanner offering a slot that has already passed, which matters because booking for
   * today is the common case.
   */
  async contextFor(date: string): Promise<DayContext> {
    const settings = await this.settings();

    return {
      date,
      depot: {
        latitude: Number(settings.depotLatitude),
        longitude: Number(settings.depotLongitude),
      },
      depotLabel: settings.depotLabel,
      workdayStart: settings.workdayStart,
      workdayEnd: settings.workdayEnd,
      accessBufferMinutes: settings.accessBufferMinutes,
      now: date === beirutToday() ? beirutMinutesNow() : null,
    };
  }
}

/**
 * Sensible starting point for a fresh deployment: central Beirut, an eight-to-seven day.
 * Whoever sets the business up replaces these in Settings; they exist so the app never greets
 * a new database with a 500 on its main screen.
 */
const DEFAULT_SETTINGS = {
  id: 'singleton',
  depotLatitude: 33.8938,
  depotLongitude: 35.5018,
  depotLabel: 'Beirut — Depot',
  workdayStart: 8 * 60,
  workdayEnd: 19 * 60,
  defaultServiceMinutes: 120,
  accessBufferMinutes: 10,
} as const;

const BEIRUT_TZ = 'Asia/Beirut';

/** "Today" is a local calendar day in Beirut, never the server's UTC date. */
export function beirutToday(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BEIRUT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function beirutMinutesNow(at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BEIRUT_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
  const [hours, minutes] = parts.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}
