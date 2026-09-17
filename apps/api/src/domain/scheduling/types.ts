import type { Coordinate, Flexibility } from '@lebanon/contracts';

/** An appointment as the engine sees it. No status, no persistence concerns, no provider types. */
export interface ScheduledStop {
  readonly appointmentId: string;
  readonly label: string;
  readonly coordinate: Coordinate;
  /** What the customer was told. A hard pin during simulation. */
  readonly promisedStart: number;
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly serviceDurationMinutes: number;
  readonly flexibility: Flexibility;
  readonly planningAreaId: string | null;
  readonly planningAreaName: string | null;
}

/** A stop we are considering but have not committed to. */
export interface ProposedStop {
  readonly coordinate: Coordinate;
  readonly label: string;
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly serviceDurationMinutes: number;
  readonly planningAreaId: string | null;
  readonly planningAreaName: string | null;
}

export interface DayContext {
  readonly date: string;
  readonly depot: Coordinate;
  readonly depotLabel: string;
  readonly workdayStart: number;
  readonly workdayEnd: number;
  /** Parking and finding the door. Applied at every stop, independent of travel time. */
  readonly accessBufferMinutes: number;
  /**
   * Minutes since local midnight, set ONLY when planning today. Without it the scanner will
   * happily offer 10:00 at 15:00 — and booking for today is the common case, because the
   * customer is on the phone right now.
   */
  readonly now: number | null;
}

/** Lateness below this is arithmetic noise from integer travel estimates, not a real problem. */
export const LATENESS_TOLERANCE_MINUTES = 10;
