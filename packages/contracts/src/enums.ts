import { z } from 'zod';

/**
 * How precisely we know where a location actually is.
 *
 * Customers give whatever detail they happen to have — "Saida", "Tripoli, Mina", a landmark,
 * or a Google Maps link. Every level books normally; the engine routes to the best point it
 * has and the UI is honest about the uncertainty rather than refusing the booking.
 */
export const locationPrecisionSchema = z.enum([
  'LOCALITY',
  'SUBLOCALITY',
  'LANDMARK',
  'EXACT',
]);
export type LocationPrecision = z.infer<typeof locationPrecisionSchema>;

/** Typical radius of error per precision level, used to size the map's confidence circle. */
export const PRECISION_RADIUS_METRES: Record<LocationPrecision, number> = {
  LOCALITY: 3000,
  SUBLOCALITY: 800,
  LANDMARK: 150,
  EXACT: 0,
};

/**
 * Whether the customer was held to an exact minute, or merely placed inside their window.
 *
 * Defaults to MOVEABLE_WITHIN_WINDOW, which is what lets the engine offer "works if you move
 * one appointment" instead of "no availability".
 */
export const flexibilitySchema = z.enum(['HARD', 'MOVEABLE_WITHIN_WINDOW']);
export type Flexibility = z.infer<typeof flexibilitySchema>;

export const appointmentStatusSchema = z.enum([
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

/** Statuses that occupy time on the route. Cancelled appointments are never routed. */
export const ROUTED_STATUSES: readonly AppointmentStatus[] = ['SCHEDULED', 'COMPLETED'];
