import { z } from 'zod';

/**
 * All appointment times are stored and transmitted as minutes since LOCAL midnight.
 *
 * Lebanon (Asia/Beirut) observes DST, but its transitions occur at midnight — a working day
 * never contains one — so integer minutes are unambiguous for every operational time. Storing
 * UTC instants instead would mean a `tzdata` update retroactively shifts every future booking,
 * which matters here: Lebanon postponed its 2023 DST change at short notice and ran on two
 * clocks for weeks. `14:00` must stay `14:00`, because that is what the customer was told.
 */
export const MINUTES_PER_DAY = 1440;

/** A time of day that can be stored: 00:00 .. 23:59. */
export const timeOfDaySchema = z.number().int().min(0).max(MINUTES_PER_DAY - 1);

/**
 * A derived point on the day's clock. May exceed 1440 when a day runs past midnight — e.g. a
 * late return to Beirut. Never wrapped with `% 1440`, or the UI would claim the team arrived
 * home before it left.
 */
export const dayMinutesSchema = z.number().int().min(0);

export const durationMinutesSchema = z.number().int().positive();

/** Slot suggestions snap to this grid so the UI never proposes 13:07. */
export const SLOT_GRANULARITY_MINUTES = 5;

export const idSchema = z.string().uuid();

/** `YYYY-MM-DD`, interpreted in Asia/Beirut. Never a timestamp. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');

export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);

export const coordinateSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

export type Coordinate = z.infer<typeof coordinateSchema>;

/** A customer's stated availability. The ENTIRE visit must fit inside this. */
export const timeWindowSchema = z
  .object({
    start: timeOfDaySchema,
    end: timeOfDaySchema,
  })
  .refine((w) => w.end > w.start, {
    message: 'The end of the window must be after its start',
  });

export type TimeWindow = z.infer<typeof timeWindowSchema>;
