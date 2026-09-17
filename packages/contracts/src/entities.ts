import { z } from 'zod';
import {
  durationMinutesSchema,
  idSchema,
  isoDateSchema,
  latitudeSchema,
  longitudeSchema,
  timeOfDaySchema,
} from './primitives.js';
import { appointmentStatusSchema, flexibilitySchema, locationPrecisionSchema } from './enums.js';

/** Lebanese numbers, tolerant of the shapes people actually type. */
export const phoneSchema = z
  .string()
  .trim()
  .min(6)
  .max(24)
  .regex(/^[+0-9\s()-]+$/, 'Phone may contain only digits, spaces and + ( ) -');

export const customerSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  email: z.string().email().nullable(),
  notes: z.string().max(2000).nullable(),
});
export type Customer = z.infer<typeof customerSchema>;

export const createCustomerSchema = customerSchema.omit({ id: true }).extend({
  email: z.string().email().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type CreateCustomer = z.infer<typeof createCustomerSchema>;

export const planningAreaSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  colorToken: z.string().trim().min(1).max(40),
  description: z.string().max(500).nullable(),
});
export type PlanningArea = z.infer<typeof planningAreaSchema>;

/**
 * A reusable dictionary of named places. Earns its own table by serving two needs at once:
 * it records which planning area a place belongs to (Anfeh -> Tripoli Area) exactly once, and
 * its centroid is the coordinate the engine routes to when a customer says only "Saida".
 *
 * Deliberately NOT a geography: no boundaries, no polygons, no official hierarchy. Just names
 * with centre points that the team edits freely. Routing always reads coordinates, never names.
 */
export const localitySchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  planningAreaId: idSchema,
  centroidLatitude: latitudeSchema,
  centroidLongitude: longitudeSchema,
});
export type Locality = z.infer<typeof localitySchema>;

export const locationSchema = z.object({
  id: idSchema,
  customerId: idSchema,
  label: z.string().trim().max(120).nullable(),
  /** Verbatim what the customer said. A label for humans, never an input to routing. */
  addressText: z.string().trim().max(500),
  localityId: idSchema.nullable(),
  precision: locationPrecisionSchema,
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  /** Derived free from the coordinates; the practical way to hand a spot to a driver. */
  plusCode: z.string().max(40).nullable(),
  /** "Blue building, entrance behind the pharmacy." How the team finds the door. */
  landmarkNotes: z.string().max(1000).nullable(),
});
export type Location = z.infer<typeof locationSchema>;

export const createLocationSchema = locationSchema.omit({ id: true }).partial({
  label: true,
  localityId: true,
  plusCode: true,
  landmarkNotes: true,
});
export type CreateLocation = z.infer<typeof createLocationSchema>;

export const appointmentSchema = z
  .object({
    id: idSchema,
    customerId: idSchema,
    locationId: idSchema,
    date: isoDateSchema,
    /** What the customer was told. Moves only through a deliberate human action. */
    promisedStart: timeOfDaySchema,
    windowStart: timeOfDaySchema,
    windowEnd: timeOfDaySchema,
    serviceDurationMinutes: durationMinutesSchema,
    flexibility: flexibilitySchema,
    status: appointmentStatusSchema,
    notes: z.string().max(2000).nullable(),
  })
  .superRefine((a, ctx) => {
    if (a.windowEnd <= a.windowStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['windowEnd'],
        message: 'The availability window must end after it starts',
      });
    }
    // The CONFIRMED rule: the entire visit fits inside the window, not merely its start.
    if (a.windowEnd - a.windowStart < a.serviceDurationMinutes) {
      ctx.addIssue({
        code: 'custom',
        path: ['serviceDurationMinutes'],
        message: 'The job is longer than the availability window',
      });
    }
    if (a.promisedStart < a.windowStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['promisedStart'],
        message: 'The visit would start before the customer is available',
      });
    }
    if (a.promisedStart + a.serviceDurationMinutes > a.windowEnd) {
      ctx.addIssue({
        code: 'custom',
        path: ['promisedStart'],
        message: 'The visit would still be running after the customer’s availability ends',
      });
    }
  });
export type Appointment = z.infer<typeof appointmentSchema>;

export const daySettingsSchema = z.object({
  depotLatitude: latitudeSchema,
  depotLongitude: longitudeSchema,
  depotLabel: z.string().trim().min(1).max(120),
  workdayStart: timeOfDaySchema,
  workdayEnd: timeOfDaySchema,
  defaultServiceMinutes: durationMinutesSchema,
  /** Parking, finding the door, getting inside. Real time that is not travel time. */
  accessBufferMinutes: z.number().int().nonnegative().max(60),
});
export type DaySettings = z.infer<typeof daySettingsSchema>;
