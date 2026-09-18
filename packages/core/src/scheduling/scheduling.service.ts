import type {
  Coordinate,
  DayTimeline,
  PreviewRequest,
  PreviewResponse,
} from '@lebanon/contracts';
import { DaySimulator } from '../engine/DaySimulator';
import { InsertionScanner } from '../engine/InsertionScanner';
import type { ProposedStop, ScheduledStop } from '../engine/types';
import { DayRepository } from './day.repository';
import { TravelMatrixBuilder } from './travel-matrix.builder';

export interface DayView {
  readonly timeline: DayTimeline;
  readonly estimated: boolean;
}

export class SchedulingService {
  private readonly simulator = new DaySimulator();
  private readonly scanner = new InsertionScanner(this.simulator);

  constructor(
    private readonly days: DayRepository,
    private readonly matrices: TravelMatrixBuilder,
  ) {}

  /** The day as it stands: ordered stops, timings, totals and any violations. */
  async day(date: string): Promise<DayView> {
    const [context, stops] = await Promise.all([
      this.days.contextFor(date),
      this.days.stopsFor(date),
    ]);

    const { matrix, estimated } = await this.matrices.build([
      context.depot,
      ...stops.map((s) => s.coordinate),
    ]);

    return {
      timeline: this.simulator.simulate({ context, stops, matrix, estimated }),
      estimated,
    };
  }

  /**
   * The "what if" endpoint, and the heart of the product.
   *
   * Creating and rescheduling are the SAME path: an appointmentId on the proposal simply means
   * "take the original out of the day first". One code path, one set of tests, half the surface
   * area that can be wrong.
   */
  async preview(date: string, request: PreviewRequest): Promise<PreviewResponse> {
    const context = await this.days.contextFor(date);
    const excludeId = request.proposal?.appointmentId;
    let stops = await this.days.stopsFor(date, excludeId);

    // Unsaved experiments: "what happens if I move Nabatieh an hour earlier?"
    if (request.overrides.length > 0) {
      const overrides = new Map(request.overrides.map((o) => [o.appointmentId, o.promisedStart]));
      stops = stops.map((stop) =>
        overrides.has(stop.appointmentId)
          ? { ...stop, promisedStart: overrides.get(stop.appointmentId)! }
          : stop,
      );
    }

    const points: Coordinate[] = [context.depot, ...stops.map((s) => s.coordinate)];
    if (request.proposal) points.push(request.proposal.coordinate);

    const { matrix, estimated } = await this.matrices.build(points);

    if (!request.proposal) {
      const timeline = this.simulator.simulate({ context, stops, matrix, estimated });
      return {
        dayHealth: { feasible: timeline.violations.length === 0, preExistingViolations: timeline.violations },
        bands: [],
        bandsRequiringMove: [],
        timeline,
        feedback: [],
      };
    }

    const proposal: ProposedStop = {
      coordinate: request.proposal.coordinate,
      label: 'New appointment',
      windowStart: request.proposal.windowStart,
      windowEnd: request.proposal.windowEnd,
      serviceDurationMinutes: request.proposal.serviceDurationMinutes,
      planningAreaId: request.proposal.planningAreaId ?? null,
      planningAreaName: null,
    };

    const scan = this.scanner.scan({ context, stops, proposal, matrix });

    // Only simulate the full day when a specific time was chosen; the bands alone are enough to
    // render the picker, and this keeps the common keystroke path cheap.
    const chosen = request.proposal.promisedStart;
    const timeline =
      chosen === undefined
        ? scan.baseline
        : this.simulator.simulate({
            context,
            stops: [...stops, proposedAsStop(proposal, chosen)],
            matrix,
            estimated,
          });

    const chosenBand =
      chosen === undefined
        ? undefined
        : scan.bands.find((band) => chosen >= band.earliest && chosen <= band.latest);

    return {
      dayHealth: {
        feasible: scan.dayFeasible,
        preExistingViolations: scan.baseline.violations,
      },
      bands: scan.bands,
      bandsRequiringMove: scan.bandsRequiringMove,
      timeline,
      feedback: chosenBand?.feedback ?? [],
    };
  }

  /**
   * Real road geometry for a settled sequence. Fetched separately and debounced by the client,
   * so experimenting with times draws instant straight lines and costs nothing.
   */
  async geometry(date: string): Promise<{ encodedPolyline: string | null }> {
    const [context, stops] = await Promise.all([
      this.days.contextFor(date),
      this.days.stopsFor(date),
    ]);
    if (stops.length === 0) return { encodedPolyline: null };

    const sequence = [context.depot, ...stops.map((s) => s.coordinate), context.depot];
    return { encodedPolyline: await this.matrices.geometry(sequence) };
  }
}

function proposedAsStop(proposal: ProposedStop, promisedStart: number): ScheduledStop {
  return {
    appointmentId: 'proposal',
    label: proposal.label,
    coordinate: proposal.coordinate,
    promisedStart,
    windowStart: proposal.windowStart,
    windowEnd: proposal.windowEnd,
    serviceDurationMinutes: proposal.serviceDurationMinutes,
    flexibility: 'MOVEABLE_WITHIN_WINDOW',
    planningAreaId: proposal.planningAreaId,
    planningAreaName: proposal.planningAreaName,
  };
}
