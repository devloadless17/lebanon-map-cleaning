import { Injectable } from '@nestjs/common';
import { appointmentStatusSchema, flexibilitySchema, timeOfDaySchema, durationMinutesSchema, isoDateSchema } from '@lebanon/contracts';
import { z } from 'zod';
import { NoFeasibleSlotError, NotFoundError, ValidationError } from '../../domain/errors/domain-errors.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { DayRepository, toDateOnly } from '../scheduling/day.repository.js';
import { SchedulingService } from '../scheduling/scheduling.service.js';

export const createAppointmentSchema = z
  .object({
    customerId: z.string().uuid(),
    locationId: z.string().uuid(),
    date: isoDateSchema,
    promisedStart: timeOfDaySchema,
    windowStart: timeOfDaySchema,
    windowEnd: timeOfDaySchema,
    serviceDurationMinutes: durationMinutesSchema,
    flexibility: flexibilitySchema.default('MOVEABLE_WITHIN_WINDOW'),
    notes: z.string().max(2000).nullable().optional(),
    /** Set when the scheduler knowingly books against the engine's advice. */
    force: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.windowEnd <= value.windowStart) {
      ctx.addIssue({ code: 'custom', path: ['windowEnd'], message: 'The availability window must end after it starts' });
    }
    if (value.promisedStart < value.windowStart) {
      ctx.addIssue({ code: 'custom', path: ['promisedStart'], message: 'The visit would start before the customer is available' });
    }
    if (value.promisedStart + value.serviceDurationMinutes > value.windowEnd) {
      ctx.addIssue({ code: 'custom', path: ['promisedStart'], message: 'The visit would still be running after their availability ends' });
    }
  });

export type CreateAppointment = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  promisedStart: timeOfDaySchema.optional(),
  windowStart: timeOfDaySchema.optional(),
  windowEnd: timeOfDaySchema.optional(),
  serviceDurationMinutes: durationMinutesSchema.optional(),
  flexibility: flexibilitySchema.optional(),
  status: appointmentStatusSchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
  date: isoDateSchema.optional(),
  force: z.boolean().default(false),
});
export type UpdateAppointment = z.infer<typeof updateAppointmentSchema>;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly days: DayRepository,
    private readonly scheduling: SchedulingService,
  ) {}

  async listForDate(date: string) {
    return this.prisma.appointment.findMany({
      where: { date: toDateOnly(date) },
      include: {
        customer: true,
        location: { include: { locality: { include: { planningArea: true } } } },
      },
      orderBy: [{ promisedStart: 'asc' }, { id: 'asc' }],
    });
  }

  async create(input: CreateAppointment) {
    await this.assertFeasible(input.date, input, undefined, input.force);

    return this.prisma.appointment.create({
      data: {
        customerId: input.customerId,
        locationId: input.locationId,
        date: toDateOnly(input.date),
        promisedStart: input.promisedStart,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        serviceDurationMinutes: input.serviceDurationMinutes,
        flexibility: input.flexibility,
        notes: input.notes ?? null,
      },
      include: { customer: true, location: true },
    });
  }

  async update(id: string, input: UpdateAppointment) {
    const existing = await this.prisma.appointment.findUnique({
      where: { id },
      include: { location: true },
    });
    if (!existing) throw new NotFoundError('That appointment');

    const merged = {
      promisedStart: input.promisedStart ?? existing.promisedStart,
      windowStart: input.windowStart ?? existing.windowStart,
      windowEnd: input.windowEnd ?? existing.windowEnd,
      serviceDurationMinutes: input.serviceDurationMinutes ?? existing.serviceDurationMinutes,
      locationId: existing.locationId,
    };
    const date = input.date ?? existing.date.toISOString().slice(0, 10);

    // The confirmed rule, re-checked on every edit: narrowing a window can invalidate a
    // promise that was perfectly valid when it was made.
    if (merged.windowEnd <= merged.windowStart) {
      throw new ValidationError('The availability window must end after it starts.');
    }
    if (
      merged.promisedStart < merged.windowStart ||
      merged.promisedStart + merged.serviceDurationMinutes > merged.windowEnd
    ) {
      throw new ValidationError(
        'That time no longer fits inside the customer’s availability. Adjust the time or the window.',
      );
    }

    if (input.status !== 'CANCELLED') {
      await this.assertFeasible(date, merged, id, input.force);
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        ...(input.date ? { date: toDateOnly(input.date) } : {}),
        ...(input.promisedStart !== undefined ? { promisedStart: input.promisedStart } : {}),
        ...(input.windowStart !== undefined ? { windowStart: input.windowStart } : {}),
        ...(input.windowEnd !== undefined ? { windowEnd: input.windowEnd } : {}),
        ...(input.serviceDurationMinutes !== undefined
          ? { serviceDurationMinutes: input.serviceDurationMinutes }
          : {}),
        ...(input.flexibility ? { flexibility: input.flexibility } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: { customer: true, location: true },
    });
  }

  async cancel(id: string) {
    return this.prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * Re-runs the engine against the day as it stands RIGHT NOW.
   *
   * A band the scheduler was looking at may be ninety seconds old — the customer was still
   * talking — and the day can have moved underneath it. `force` lets a human override the
   * advice deliberately; the database constraint still refuses a physical double-booking.
   */
  private async assertFeasible(
    date: string,
    candidate: {
      locationId: string;
      promisedStart: number;
      windowStart: number;
      windowEnd: number;
      serviceDurationMinutes: number;
    },
    excludeId: string | undefined,
    force: boolean,
  ): Promise<void> {
    if (force) return;

    const location = await this.prisma.location.findUnique({
      where: { id: candidate.locationId },
      include: { locality: true },
    });
    if (!location) throw new NotFoundError('That location');

    const preview = await this.scheduling.preview(date, {
      proposal: {
        ...(excludeId ? { appointmentId: excludeId } : {}),
        coordinate: { latitude: Number(location.latitude), longitude: Number(location.longitude) },
        windowStart: candidate.windowStart,
        windowEnd: candidate.windowEnd,
        serviceDurationMinutes: candidate.serviceDurationMinutes,
        promisedStart: candidate.promisedStart,
        ...(location.locality ? { planningAreaId: location.locality.planningAreaId } : {}),
      },
      overrides: [],
    });

    const fits = preview.bands.some(
      (band) => candidate.promisedStart >= band.earliest && candidate.promisedStart <= band.latest,
    );
    if (fits) return;

    const reason = preview.bands.length === 0
      ? 'No time on this day works for that location and availability.'
      : `That exact time does not work. Times that do: ${preview.bands
          .map((b) => `${formatClock(b.earliest)}–${formatClock(b.latest)}`)
          .join(', ')}.`;
    throw new NoFeasibleSlotError(reason);
  }
}

function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}
