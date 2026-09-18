import type { Feedback } from '@lebanon/contracts';
import type { ProposedStop, ScheduledStop } from './types';
import { haversineMetres } from './geo';
import { formatClock } from './DaySimulator';

/** Below this, a detour is "on the way" rather than backtracking. */
const DETOUR_RATIO_THRESHOLD = 1.25;
const ADDS_TRAVEL_THRESHOLD_MINUTES = 20;
const LITTLE_BUFFER_THRESHOLD_MINUTES = 15;
const SAME_AREA_PROXIMITY_METRES = 5000;

interface DetourGeometry {
  readonly toProposal: { minutes: number };
  readonly fromProposal: { minutes: number };
  readonly direct: { minutes: number };
}

/**
 * How far out of the way the proposal sits: 1.0 is exactly on the route, 2.0 doubles the leg.
 *
 * Returns null when it cannot be computed, which happens more often than it looks: the direct
 * leg is ZERO whenever the stops either side of the gap are the same place. The brief's own
 * examples do this — Khalde on the way out and again on the way home — as do two flats in one
 * building and two locality-precision pins sharing a centroid.
 */
export function detourRatio(geometry: DetourGeometry): number | null {
  if (geometry.direct.minutes <= 0) return null;
  return (geometry.toProposal.minutes + geometry.fromProposal.minutes) / geometry.direct.minutes;
}

export interface FeedbackInput {
  readonly gap: number;
  readonly stopCount: number;
  readonly isFinalGap: boolean;
  readonly detour: number | null;
  readonly deltaMinutes: number;
  readonly returnTime: number;
  readonly residualSlackMinutes: number;
  readonly workdayEnd: number;
  readonly neighbours: readonly (ScheduledStop | null)[];
  readonly proposal: ProposedStop;
}

export function buildFeedback(input: FeedbackInput): Feedback[] {
  const feedback: Feedback[] = [];

  feedback.push({
    code: 'FITS_AVAILABILITY',
    tone: 'GOOD',
    message: 'Fits the customer’s availability',
  });

  const area = sharedArea(input);
  if (area) {
    // The highest-value message here: clustering work geographically is the operational win
    // the business actually cares about. The arithmetic already ranks these slots top; this
    // just says WHY, in the team's own vocabulary.
    feedback.push({
      code: 'ALREADY_IN_AREA',
      tone: 'GOOD',
      message: `You're already going to ${area} — this adds only ${Math.max(input.deltaMinutes, 0)} min`,
    });
  }

  // `stopCount > 0` is load-bearing: on an EMPTY day the single gap is also the final gap, so
  // without it every first appointment of every day would be labelled "on the return journey".
  if (input.isFinalGap && input.stopCount > 0) {
    if (input.detour === null || input.detour < DETOUR_RATIO_THRESHOLD) {
      feedback.push({
        code: 'RETURN_JOURNEY',
        tone: 'GOOD',
        message: 'Works well on the return journey',
      });
    }
  } else if (input.detour !== null && input.detour < DETOUR_RATIO_THRESHOLD) {
    feedback.push({
      code: 'NO_BACKTRACKING',
      tone: 'GOOD',
      message: 'No significant backtracking',
    });
  }

  if (input.deltaMinutes > ADDS_TRAVEL_THRESHOLD_MINUTES) {
    feedback.push({
      code: 'ADDS_TRAVEL',
      tone: 'WARN',
      message: `Adds ${input.deltaMinutes} min of extra driving`,
    });
  }

  if (input.residualSlackMinutes < LITTLE_BUFFER_THRESHOLD_MINUTES) {
    feedback.push({
      code: 'LITTLE_BUFFER',
      tone: 'WARN',
      message: `Leaves only ${Math.max(input.residualSlackMinutes, 0)} min of buffer`,
    });
  }

  if (input.returnTime > input.workdayEnd) {
    feedback.push({
      code: 'LATE_RETURN',
      tone: 'WARN',
      message: `Return to the depot would be ${formatClock(input.returnTime)}`,
    });
  }

  return feedback;
}

/**
 * Two stops can be in different localities but the same operational area — a job in Mina and a
 * request in Anfeh are both "Tripoli Area". The area name is how the team thinks; the distance
 * behind it comes entirely from coordinates.
 */
function sharedArea(input: FeedbackInput): string | null {
  for (const neighbour of input.neighbours) {
    if (!neighbour) continue;
    if (
      input.proposal.planningAreaId !== null &&
      neighbour.planningAreaId === input.proposal.planningAreaId
    ) {
      return neighbour.planningAreaName ?? input.proposal.planningAreaName;
    }
    if (haversineMetres(neighbour.coordinate, input.proposal.coordinate) <= SAME_AREA_PROXIMITY_METRES) {
      return neighbour.planningAreaName ?? neighbour.label;
    }
  }
  return null;
}
