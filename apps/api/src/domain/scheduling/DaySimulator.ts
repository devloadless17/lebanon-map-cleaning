import type { DayTimeline, TimelineStop, Violation } from '@lebanon/contracts';
import { TravelMatrix } from './TravelMatrix.js';
import { LATENESS_TOLERANCE_MINUTES, type DayContext, type ScheduledStop } from './types.js';

export interface SimulationInput {
  readonly context: DayContext;
  readonly stops: readonly ScheduledStop[];
  readonly matrix: TravelMatrix;
  readonly estimated?: boolean;
}

/** Stable order. The `id` tiebreak is required, not cosmetic — see `orderStops`. */
export function orderStops(stops: readonly ScheduledStop[]): ScheduledStop[] {
  // Postgres returns an arbitrary AND UNSTABLE order for equal sort keys, which would make the
  // map and the violation list flicker between two different routes on identical data. Sorting
  // by id as a tiebreak makes the day's sequence deterministic everywhere.
  return [...stops].sort(
    (a, b) =>
      a.promisedStart - b.promisedStart || a.appointmentId.localeCompare(b.appointmentId),
  );
}

/** 12-hour, matching the UI: these strings are read to customers, not to developers. */
function formatClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const meridiem = h24 < 12 ? 'AM' : 'PM';
  const nextDay = minutes >= 1440 ? ' (+1d)' : '';
  return `${h12}:${String(m).padStart(2, '0')} ${meridiem}${nextDay}`;
}

/**
 * Walks a day's committed appointments and reports exactly what will happen.
 *
 * Pure: no I/O, no framework, no provider types. Given a matrix of travel legs it is entirely
 * deterministic, which is why every scenario in the test suite runs without a network or a
 * database.
 */
export class DaySimulator {
  simulate(input: SimulationInput): DayTimeline {
    const { context, matrix } = input;
    const stops = orderStops(input.stops);
    const violations: Violation[] = [];

    if (stops.length === 0) {
      return {
        date: context.date,
        stops: [],
        totals: {
          stops: 0,
          distanceMetres: 0,
          drivingMinutes: 0,
          serviceMinutes: 0,
          waitingMinutes: 0,
          departure: context.workdayStart,
          returnTime: context.workdayStart,
        },
        violations,
        estimated: input.estimated ?? false,
      };
    }

    violations.push(...this.findOverlaps(stops));

    const first = stops[0]!;
    const toFirst = matrix.between(context.depot, first.coordinate);

    // Departure is not iterative. Because every stop is pinned, slack cannot propagate
    // backwards past the first stop, so "leave as late as possible" collapses to one formula.
    const idealDeparture =
      first.promisedStart - toFirst.minutes - context.accessBufferMinutes;
    const departure = Math.max(idealDeparture, context.workdayStart);

    if (idealDeparture < context.workdayStart) {
      // The naive loop checks the return against workdayEnd but nothing checks departure
      // against workdayStart, so this day would otherwise report a departure in the past.
      violations.push({
        code: 'IMPOSSIBLE_FIRST_STOP',
        appointmentId: first.appointmentId,
        message:
          `Leaving at ${formatClock(context.workdayStart)} gets the team to ${first.label} ` +
          `at ${formatClock(departure + toFirst.minutes + context.accessBufferMinutes)}, ` +
          `after the promised ${formatClock(first.promisedStart)}.`,
        cascadeMinutes: context.workdayStart - idealDeparture,
      });
    }

    const timelineStops: TimelineStop[] = [];
    let clock = departure;
    let previousCoordinate = context.depot;
    let distanceMetres = 0;
    let drivingMinutes = 0;
    let serviceMinutes = 0;
    let waitingMinutes = 0;
    let lateRunActive = false;

    for (const [index, stop] of stops.entries()) {
      const leg = matrix.between(previousCoordinate, stop.coordinate);
      const arrival = clock + leg.minutes + context.accessBufferMinutes;
      const plannedStart = Math.max(arrival, stop.promisedStart);
      const waitMinutes = plannedStart - arrival;
      const end = plannedStart + stop.serviceDurationMinutes;

      if (plannedStart < stop.windowStart) {
        // Checking only windowEnd enforces half the rule: the team would knock before the
        // customer is home.
        violations.push({
          code: 'WINDOW_UNDERRUN',
          appointmentId: stop.appointmentId,
          message:
            `${stop.label} would start at ${formatClock(plannedStart)}, before they are ` +
            `available at ${formatClock(stop.windowStart)}.`,
          cascadeMinutes: 0,
        });
      }

      if (end > stop.windowEnd) {
        violations.push({
          code: 'WINDOW_OVERRUN',
          appointmentId: stop.appointmentId,
          message:
            `${stop.label} would still be running at ${formatClock(end)}, after their ` +
            `availability ends at ${formatClock(stop.windowEnd)}.`,
          cascadeMinutes: 0,
        });
      }

      const lateBy = arrival - stop.promisedStart;
      const isLate = lateBy > LATENESS_TOLERANCE_MINUTES;
      if (isLate && !lateRunActive) {
        // One overrun makes every later stop late. "5 appointments are late" is useless; report
        // the ORIGIN of each run of lateness, with the delay it pushes onto the rest of the day.
        violations.push({
          code: 'ARRIVES_LATE',
          appointmentId: stop.appointmentId,
          message:
            `${stop.label} runs ${lateBy} min late, pushing the rest of the day back.`,
          cascadeMinutes: lateBy,
        });
      }
      lateRunActive = isLate;

      timelineStops.push({
        appointmentId: stop.appointmentId,
        isProposal: false,
        coordinate: stop.coordinate,
        label: stop.label,
        sequence: index + 1,
        arrival,
        promisedStart: stop.promisedStart,
        plannedStart,
        end,
        waitMinutes,
        travelMinutesFromPrevious: leg.minutes,
        travelMetresFromPrevious: leg.metres,
        slackAfterMinutes: 0,
      });

      distanceMetres += leg.metres;
      drivingMinutes += leg.minutes;
      serviceMinutes += stop.serviceDurationMinutes;
      waitingMinutes += waitMinutes;
      clock = end;
      previousCoordinate = stop.coordinate;
    }

    const home = matrix.between(previousCoordinate, context.depot);
    // Never wrapped with % 1440 — a day can genuinely end after midnight, and wrapping would
    // claim the team got home before it left.
    const returnTime = clock + home.minutes;
    distanceMetres += home.metres;
    drivingMinutes += home.minutes;

    if (returnTime > context.workdayEnd) {
      violations.push({
        code: 'LATE_RETURN',
        appointmentId: null,
        message:
          `The team would get back to ${context.depotLabel} at ${formatClock(returnTime)}, ` +
          `after the ${formatClock(context.workdayEnd)} finish.`,
        cascadeMinutes: returnTime - context.workdayEnd,
      });
    }

    this.fillSlack(timelineStops, stops, context, matrix, returnTime);

    return {
      date: context.date,
      stops: timelineStops,
      totals: {
        stops: stops.length,
        distanceMetres,
        drivingMinutes,
        serviceMinutes,
        waitingMinutes,
        departure,
        returnTime,
      },
      violations,
      estimated: input.estimated ?? false,
    };
  }

  /** Spare minutes between each visit ending and the next commitment. */
  private fillSlack(
    timeline: TimelineStop[],
    stops: readonly ScheduledStop[],
    context: DayContext,
    matrix: TravelMatrix,
    returnTime: number,
  ): void {
    for (const [index, entry] of timeline.entries()) {
      const next = stops[index + 1];
      if (!next) {
        entry.slackAfterMinutes = context.workdayEnd - returnTime;
        continue;
      }
      const hop = matrix.between(stops[index]!.coordinate, next.coordinate);
      entry.slackAfterMinutes =
        next.promisedStart - (entry.end + hop.minutes + context.accessBufferMinutes);
    }
  }

  /**
   * One team cannot be in two places. The database enforces this with an exclusion constraint,
   * but the simulator must not depend on that having held — and "arrives late" is the wrong
   * sentence to put in front of a scheduler looking at a double booking.
   */
  private findOverlaps(stops: readonly ScheduledStop[]): Violation[] {
    const violations: Violation[] = [];
    for (let i = 1; i < stops.length; i += 1) {
      const previous = stops[i - 1]!;
      const current = stops[i]!;
      if (previous.promisedStart + previous.serviceDurationMinutes > current.promisedStart) {
        violations.push({
          code: 'DOUBLE_BOOKED',
          appointmentId: current.appointmentId,
          message:
            `${current.label} at ${formatClock(current.promisedStart)} overlaps ` +
            `${previous.label}, which runs until ` +
            `${formatClock(previous.promisedStart + previous.serviceDurationMinutes)}.`,
          cascadeMinutes: 0,
        });
      }
    }
    return violations;
  }
}

export { formatClock };
