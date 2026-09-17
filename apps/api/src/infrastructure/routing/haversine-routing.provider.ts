import { Injectable } from '@nestjs/common';
import type { Coordinate } from '@lebanon/contracts';
import { legKey } from '../../domain/scheduling/TravelMatrix.js';
import { FALLBACK_SPEED_KMH, ROAD_WINDING_FACTOR, haversineMetres } from '../../domain/scheduling/geo.js';
import type { LegPair, ResolvedLeg, RoutingProvider } from './routing.port.js';

/**
 * Straight-line distance inflated by a road-winding factor.
 *
 * Three jobs at once: the degraded mode when Google is unreachable (so the scheduler sees an
 * approximate day rather than a spinner), the zero-configuration default that lets the whole
 * app run with no Google account, and the test double the engine tests use. Because it is
 * exercised constantly it cannot quietly rot, which is exactly what a fallback path usually does.
 */
@Injectable()
export class HaversineRoutingProvider implements RoutingProvider {
  readonly name = 'haversine';

  async resolveLegs(pairs: readonly LegPair[]): Promise<Map<string, ResolvedLeg>> {
    const legs = new Map<string, ResolvedLeg>();
    for (const [from, to] of pairs) {
      legs.set(legKey(from, to), this.estimate(from, to));
    }
    return legs;
  }

  async resolveGeometry(): Promise<string | null> {
    // No road geometry to offer; the map falls back to straight connectors between stops.
    return null;
  }

  private estimate(from: Coordinate, to: Coordinate): ResolvedLeg {
    const distanceMetres = Math.round(haversineMetres(from, to) * ROAD_WINDING_FACTOR);
    const durationSeconds = Math.round((distanceMetres / 1000 / FALLBACK_SPEED_KMH) * 3600);
    return { durationSeconds, distanceMetres, estimated: true };
  }
}
