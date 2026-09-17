import { z } from 'zod';
import {
  coordinateSchema,
  dayMinutesSchema,
  durationMinutesSchema,
  idSchema,
  isoDateSchema,
  timeOfDaySchema,
} from './primitives.js';

/** Why a day does not work. Each is attributable to a specific stop where one exists. */
export const violationCodeSchema = z.enum([
  /** The team would arrive before the customer said they'd be available. */
  'WINDOW_UNDERRUN',
  /** The visit would still be running after the customer's window closes. */
  'WINDOW_OVERRUN',
  /** The team cannot physically reach this stop by its promised time. */
  'ARRIVES_LATE',
  /** Reaching the first stop on time would mean leaving before the workday starts. */
  'IMPOSSIBLE_FIRST_STOP',
  /** The team would get back to the depot after the workday ends. */
  'LATE_RETURN',
  /** Two appointments occupy the same time. One team cannot be in two places. */
  'DOUBLE_BOOKED',
]);
export type ViolationCode = z.infer<typeof violationCodeSchema>;

export const violationSchema = z.object({
  code: violationCodeSchema,
  appointmentId: idSchema.nullable(),
  /** Written for a scheduler, never for a developer. */
  message: z.string(),
  /**
   * Minutes of delay this violation propagates onward. One overrun makes every later stop
   * late; we report the ORIGIN plus its knock-on, not N separate "arrives late" messages.
   */
  cascadeMinutes: z.number().int().nonnegative().default(0),
});
export type Violation = z.infer<typeof violationSchema>;

export const timelineStopSchema = z.object({
  appointmentId: idSchema.nullable(),
  /** Null for the proposed stop, which has no id until saved. */
  isProposal: z.boolean(),
  coordinate: coordinateSchema,
  label: z.string(),
  /** Position in the day's route, 1-based. */
  sequence: z.number().int().positive(),
  /** When the team pulls up, including the access buffer. */
  arrival: dayMinutesSchema,
  /** What the customer was told. */
  promisedStart: timeOfDaySchema,
  /** What will actually happen. Differs from the promise only on a broken day. */
  plannedStart: dayMinutesSchema,
  end: dayMinutesSchema,
  /** Idle time before this stop can begin. A three-hour hole is worth seeing. */
  waitMinutes: z.number().int().nonnegative(),
  travelMinutesFromPrevious: z.number().int().nonnegative(),
  travelMetresFromPrevious: z.number().int().nonnegative(),
  /** Spare minutes between this visit ending and the next commitment. */
  slackAfterMinutes: z.number().int(),
});
export type TimelineStop = z.infer<typeof timelineStopSchema>;

export const dayTotalsSchema = z.object({
  stops: z.number().int().nonnegative(),
  distanceMetres: z.number().int().nonnegative(),
  drivingMinutes: z.number().int().nonnegative(),
  serviceMinutes: z.number().int().nonnegative(),
  waitingMinutes: z.number().int().nonnegative(),
  /** When the team leaves the depot. Derived, clamped to the workday start. */
  departure: dayMinutesSchema,
  /** When the team gets back. May exceed 1440 — render as "01:10 (+1d)", never wrapped. */
  returnTime: dayMinutesSchema,
});
export type DayTotals = z.infer<typeof dayTotalsSchema>;

export const dayTimelineSchema = z.object({
  date: isoDateSchema,
  stops: z.array(timelineStopSchema),
  totals: dayTotalsSchema,
  violations: z.array(violationSchema),
  /** True when the travel figures came from the fallback estimator, not the road network. */
  estimated: z.boolean(),
});
export type DayTimeline = z.infer<typeof dayTimelineSchema>;

/** Human-readable route feedback. Every message is backed by a number. */
export const feedbackCodeSchema = z.enum([
  'FITS_AVAILABILITY',
  'ALREADY_IN_AREA',
  'RETURN_JOURNEY',
  'NO_BACKTRACKING',
  'ADDS_TRAVEL',
  'LITTLE_BUFFER',
  'LATE_RETURN',
  'CANNOT_FIT',
]);
export type FeedbackCode = z.infer<typeof feedbackCodeSchema>;

export const feedbackSchema = z.object({
  code: feedbackCodeSchema,
  tone: z.enum(['GOOD', 'WARN', 'BAD']),
  message: z.string(),
});
export type Feedback = z.infer<typeof feedbackSchema>;

/**
 * A continuous range of workable start times in one gap of the day.
 *
 * Bands rather than a few discrete suggestions: a feasible range of 13:42-13:51 contains no
 * round clock time, so a points-only answer would report "no availability" for a slot that
 * exists — and a scheduler asked "can you do 14:37?" can answer from a band without another
 * round trip.
 */
export const bandSchema = z.object({
  /** Which gap this is, in the scheduler's words: "on the way home". */
  position: z.string(),
  gapIndex: z.number().int().nonnegative(),
  earliest: dayMinutesSchema,
  latest: dayMinutesSchema,
  /** The best point inside the band — a bare interval hides that 13:30 beats 15:00. */
  recommended: dayMinutesSchema,
  deltaMetres: z.number().int(),
  deltaMinutes: z.number().int(),
  /** Spare minutes left in the day after taking this slot. */
  residualSlackMinutes: z.number().int(),
  returnTime: dayMinutesSchema,
  feedback: z.array(feedbackSchema),
});
export type Band = z.infer<typeof bandSchema>;

/** A band that only opens up if one existing appointment moves. Always secondary. */
export const bandRequiringMoveSchema = z.object({
  band: bandSchema,
  move: z.object({
    appointmentId: idSchema,
    customerName: z.string(),
    from: timeOfDaySchema,
    to: timeOfDaySchema,
    /** Their stated availability, so the scheduler knows the move is defensible. */
    windowStart: timeOfDaySchema,
    windowEnd: timeOfDaySchema,
  }),
});
export type BandRequiringMove = z.infer<typeof bandRequiringMoveSchema>;

export const previewProposalSchema = z.object({
  /** Present when editing: the original is removed from the day before scanning. */
  appointmentId: idSchema.optional(),
  coordinate: coordinateSchema,
  windowStart: timeOfDaySchema,
  windowEnd: timeOfDaySchema,
  serviceDurationMinutes: durationMinutesSchema,
  /** When set, evaluate this exact time instead of only reporting the bands. */
  promisedStart: timeOfDaySchema.optional(),
  planningAreaId: idSchema.optional(),
});
export type PreviewProposal = z.infer<typeof previewProposalSchema>;

export const previewRequestSchema = z.object({
  proposal: previewProposalSchema.optional(),
  /** Try moving existing stops without saving — the "what if I shift Nabatieh?" case. */
  overrides: z
    .array(z.object({ appointmentId: idSchema, promisedStart: timeOfDaySchema }))
    .default([]),
});
export type PreviewRequest = z.infer<typeof previewRequestSchema>;

export const previewResponseSchema = z.object({
  /**
   * Reported FIRST so the client can never paint a clean green band on a day that was already
   * broken before this proposal existed.
   */
  dayHealth: z.object({
    feasible: z.boolean(),
    preExistingViolations: z.array(violationSchema),
  }),
  bands: z.array(bandSchema),
  /** Only populated when no direct band exists. */
  bandsRequiringMove: z.array(bandRequiringMoveSchema),
  /** The simulated day for the currently-chosen time, when one was supplied. */
  timeline: dayTimelineSchema.nullable(),
  feedback: z.array(feedbackSchema),
});
export type PreviewResponse = z.infer<typeof previewResponseSchema>;
