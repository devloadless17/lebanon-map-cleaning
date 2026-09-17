import { Inject, Injectable } from '@nestjs/common';
import type { Coordinate } from '@lebanon/contracts';
import { TravelMatrix, coordinateKey, legKey } from '../../domain/scheduling/TravelMatrix.js';
import { ROUTING_PROVIDER, type RoutingProvider } from '../../infrastructure/routing/routing.port.js';

@Injectable()
export class TravelMatrixBuilder {
  constructor(@Inject(ROUTING_PROVIDER) private readonly routing: RoutingProvider) {}

  /**
   * Requests exactly the pairs the engine will ask about — the matrix bills per element, so the
   * full cross product of a day's points would be several times more expensive than needed.
   */
  async build(points: readonly Coordinate[]): Promise<{ matrix: TravelMatrix; estimated: boolean }> {
    const unique = dedupe(points);
    const pairs = TravelMatrix.requiredPairs(unique);
    const legs = await this.routing.resolveLegs(pairs);

    let estimated = false;
    const entries: Array<[string, { minutes: number; metres: number }]> = [];
    for (const [key, leg] of legs) {
      if (leg.estimated) estimated = true;
      entries.push([key, { minutes: Math.round(leg.durationSeconds / 60), metres: leg.distanceMetres }]);
    }

    // A provider can legitimately fail to return a leg (no road route). Rather than letting the
    // engine throw mid-simulation, fill the hole with a clearly-flagged estimate.
    for (const [from, to] of pairs) {
      const key = legKey(from, to);
      if (!legs.has(key)) {
        estimated = true;
        entries.push([key, fallbackLeg(from, to)]);
      }
    }

    return { matrix: TravelMatrix.from(entries), estimated };
  }

  async geometry(sequence: readonly Coordinate[]): Promise<string | null> {
    return this.routing.resolveGeometry(sequence);
  }
}

function dedupe(points: readonly Coordinate[]): Coordinate[] {
  const seen = new Map<string, Coordinate>();
  for (const point of points) seen.set(coordinateKey(point), point);
  return [...seen.values()];
}

function fallbackLeg(from: Coordinate, to: Coordinate): { minutes: number; metres: number } {
  const dLat = (to.latitude - from.latitude) * 111_000;
  const dLng = (to.longitude - from.longitude) * 111_000 * Math.cos((from.latitude * Math.PI) / 180);
  const metres = Math.round(Math.hypot(dLat, dLng) * 1.35);
  return { minutes: Math.max(1, Math.round(metres / 1000 / 40 * 60)), metres };
}
