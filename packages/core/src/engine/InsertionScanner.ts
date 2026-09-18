import type { Band, BandRequiringMove, Coordinate, DayTimeline, Feedback } from '@lebanon/contracts';
import { SLOT_GRANULARITY_MINUTES } from '@lebanon/contracts';
import { DaySimulator, orderStops, formatClock } from './DaySimulator';
import { TravelMatrix } from './TravelMatrix';
import type { DayContext, ProposedStop, ScheduledStop } from './types';
import { buildFeedback, detourRatio } from './RouteFeedback';

/** Never offer a slot the team could not physically start. */
export const SAME_DAY_BOOKING_BUFFER_MINUTES = 30;

/**
 * Ranking weights. A minute of a longer working day and a kilometre of extra driving are both
 * real costs, and ranking purely on driving would prefer a slot that pushes the return home
 * over one that simply uses up dead waiting time.
 */
const MINUTES_PER_EXTRA_KM = 1.5;

export interface ScanInput {
  readonly context: DayContext;
  readonly stops: readonly ScheduledStop[];
  readonly proposal: ProposedStop;
  readonly matrix: TravelMatrix;
  readonly maxBands?: number;
}

export interface ScanResult {
  readonly baseline: DayTimeline;
  readonly dayFeasible: boolean;
  readonly bands: Band[];
  readonly bandsRequiringMove: BandRequiringMove[];
}

interface GapGeometry {
  readonly index: number;
  readonly previousCoordinate: Coordinate;
  readonly nextCoordinate: Coordinate;
  readonly toProposal: { minutes: number; metres: number };
  readonly fromProposal: { minutes: number; metres: number };
  readonly direct: { minutes: number; metres: number };
}

function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}
function floorTo(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

export class InsertionScanner {
  constructor(private readonly simulator: DaySimulator = new DaySimulator()) {}

  scan(input: ScanInput): ScanResult {
    const direct = this.findBands(input);

    // Only reached when nothing fits directly. The probe below calls `findBands`, never
    // `scan` — re-entering `scan` here would recurse without end.
    const bandsRequiringMove =
      direct.bands.length === 0 ? this.scanWithOneMove(input, direct.stops) : [];

    return {
      baseline: direct.baseline,
      dayFeasible: direct.dayFeasible,
      bands: direct.bands,
      bandsRequiringMove,
    };
  }

  /** Bands only. Terminates unconditionally: no move probing, therefore no recursion. */
  private findBands(input: ScanInput): {
    baseline: DayTimeline;
    dayFeasible: boolean;
    bands: Band[];
    stops: ScheduledStop[];
  } {
    const { context, matrix, proposal } = input;
    const stops = orderStops(input.stops);
    const baseline = this.simulator.simulate({ context, stops, matrix });

    // The immediate-successor bound is exact ONLY while the day is currently feasible. On a
    // day that is already collapsing, a gap can pass its local check while the real schedule
    // is nowhere near workable — so a clean green band must never appear on a red day.
    const dayFeasible = baseline.violations.length === 0;

    const bands: Band[] = [];
    for (let gap = 0; gap <= stops.length; gap += 1) {
      const geometry = this.geometryFor(gap, stops, context, proposal, matrix);
      const band = this.bandFor(gap, geometry, stops, context, proposal, baseline);
      if (band) bands.push(band);
    }

    bands.sort((a, b) => this.score(a, baseline) - this.score(b, baseline));
    return { baseline, dayFeasible, bands: bands.slice(0, input.maxBands ?? 3), stops };
  }

  private score(band: Band, baseline: DayTimeline): number {
    const dayEndDelta = band.returnTime - baseline.totals.returnTime;
    return dayEndDelta + (band.deltaMetres / 1000) * MINUTES_PER_EXTRA_KM;
  }

  private geometryFor(
    gap: number,
    stops: readonly ScheduledStop[],
    context: DayContext,
    proposal: ProposedStop,
    matrix: TravelMatrix,
  ): GapGeometry {
    const previousCoordinate = gap === 0 ? context.depot : stops[gap - 1]!.coordinate;
    const nextCoordinate = gap === stops.length ? context.depot : stops[gap]!.coordinate;
    return {
      index: gap,
      previousCoordinate,
      nextCoordinate,
      toProposal: matrix.between(previousCoordinate, proposal.coordinate),
      fromProposal: matrix.between(proposal.coordinate, nextCoordinate),
      direct: matrix.between(previousCoordinate, nextCoordinate),
    };
  }

  private bandFor(
    gap: number,
    geometry: GapGeometry,
    stops: readonly ScheduledStop[],
    context: DayContext,
    proposal: ProposedStop,
    baseline: DayTimeline,
  ): Band | null {
    const duration = proposal.serviceDurationMinutes;
    const buffer = context.accessBufferMinutes;
    const isFinalGap = gap === stops.length;

    // ---- lower bound -------------------------------------------------------------------
    const lowerBounds = [proposal.windowStart];
    if (gap === 0) {
      // Gap 0 is bounded by the START of the workday, not only by the return deadline.
      lowerBounds.push(context.workdayStart + geometry.toProposal.minutes + buffer);
    } else {
      const previousEnd = baseline.stops[gap - 1]!.end;
      lowerBounds.push(previousEnd + geometry.toProposal.minutes + buffer);
    }
    if (context.now !== null) {
      // Booking for TODAY is the common case — the customer is on the phone right now.
      lowerBounds.push(context.now + SAME_DAY_BOOKING_BUFFER_MINUTES);
    }
    const lo = Math.max(...lowerBounds);

    // ---- upper bound -------------------------------------------------------------------
    // THE most important line in the codebase. The intuitive shorthand — "bounded above by the
    // successor's promised time" — is wrong by exactly (duration + travel + buffer), and wrong
    // in the direction that promises a slot which breaks an already-confirmed customer.
    const upperBounds = [proposal.windowEnd - duration];
    if (isFinalGap) {
      upperBounds.push(context.workdayEnd - duration - geometry.fromProposal.minutes);
    } else {
      upperBounds.push(
        stops[gap]!.promisedStart - duration - geometry.fromProposal.minutes - buffer,
      );
    }
    const hi = Math.min(...upperBounds);

    // Checked BEFORE formatting, or the UI renders "any time between 15:00 and 13:30".
    if (lo > hi) return null;

    const earliest = Math.min(ceilTo(lo, SLOT_GRANULARITY_MINUTES), hi);
    const latest = Math.max(floorTo(hi, SLOT_GRANULARITY_MINUTES), earliest);
    const recommended = earliest;

    const deltaMinutes =
      geometry.toProposal.minutes + geometry.fromProposal.minutes - geometry.direct.minutes;
    const deltaMetres =
      geometry.toProposal.metres + geometry.fromProposal.metres - geometry.direct.metres;

    // A pinned successor absorbs the insertion as reduced waiting, so the day only gets longer
    // when the proposal lands in the FINAL gap.
    const returnTime = isFinalGap
      ? recommended + duration + geometry.fromProposal.minutes
      : baseline.totals.returnTime;

    const residualSlackMinutes = isFinalGap
      ? context.workdayEnd - returnTime
      : stops[gap]!.promisedStart -
        (recommended + duration + geometry.fromProposal.minutes + buffer);

    const feedback = buildFeedback({
      gap,
      stopCount: stops.length,
      isFinalGap,
      detour: detourRatio(geometry),
      deltaMinutes,
      returnTime,
      residualSlackMinutes,
      workdayEnd: context.workdayEnd,
      neighbours: [stops[gap - 1] ?? null, stops[gap] ?? null],
      proposal,
    });

    return {
      position: this.describeGap(gap, stops, context),
      gapIndex: gap,
      earliest,
      latest,
      recommended,
      deltaMetres,
      deltaMinutes,
      residualSlackMinutes,
      returnTime,
      feedback,
    };
  }

  private describeGap(
    gap: number,
    stops: readonly ScheduledStop[],
    context: DayContext,
  ): string {
    if (stops.length === 0) return 'the only stop of the day';
    if (gap === stops.length) return 'on the way home';
    if (gap === 0) return `before ${stops[0]!.label}`;
    return `between ${stops[gap - 1]!.label} and ${stops[gap]!.label}`;
  }

  /**
   * When nothing fits directly, look for a slot that opens if ONE existing appointment shifts
   * inside its own stated availability — "works if you move Mrs Haddad 12:00 to 13:20, 1 call".
   *
   * Each candidate is verified by re-simulating the whole resulting day rather than by local
   * arithmetic, so a move can never be offered that quietly breaks a later stop.
   */
  private scanWithOneMove(
    input: ScanInput,
    stops: readonly ScheduledStop[],
  ): BandRequiringMove[] {
    if (stops.length === 0) return [];
    const { context, matrix, proposal } = input;
    const results: BandRequiringMove[] = [];

    for (const [moveIndex, candidate] of stops.entries()) {
      if (candidate.flexibility !== 'MOVEABLE_WITHIN_WINDOW') continue;

      const latestStart = candidate.windowEnd - candidate.serviceDurationMinutes;
      for (
        let newStart = candidate.promisedStart + SLOT_GRANULARITY_MINUTES;
        newStart <= latestStart;
        newStart += SLOT_GRANULARITY_MINUTES
      ) {
        const moved = stops.map((s, i) => (i === moveIndex ? { ...s, promisedStart: newStart } : s));
        const probe = this.findBands({ context, stops: moved, proposal, matrix, maxBands: 1 });
        const band = probe.bands[0];
        if (!probe.dayFeasible || !band) continue;

        results.push({
          band,
          move: {
            appointmentId: candidate.appointmentId,
            customerName: candidate.label,
            from: candidate.promisedStart,
            to: newStart,
            windowStart: candidate.windowStart,
            windowEnd: candidate.windowEnd,
          },
        });
        break; // the smallest workable shift for this appointment is the one worth offering
      }
      if (results.length >= 2) break;
    }

    return results;
  }
}

export { formatClock };
export type { Feedback };
