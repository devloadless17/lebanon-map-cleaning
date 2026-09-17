import { Injectable, Logger } from '@nestjs/common';
import type { Coordinate } from '@lebanon/contracts';
import { legKey } from '../../domain/scheduling/TravelMatrix.js';
import { RoutingUnavailableError } from '../../domain/errors/domain-errors.js';
import type { LegPair, ResolvedLeg, RoutingProvider } from './routing.port.js';

const MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * Field masks are pinned explicitly and NEVER use a wildcard: Google adds advanced fields over
 * time, and a wildcard silently promotes the request to a more expensive SKU.
 */
const MATRIX_FIELD_MASK = 'originIndex,destinationIndex,duration,distanceMeters,condition';
const ROUTES_FIELD_MASK = 'routes.polyline.encodedPolyline,routes.duration,routes.distanceMeters';

/** One request may not exceed origins x destinations = 625 elements. */
const MAX_MATRIX_ELEMENTS = 625;

/**
 * 1-10 intermediates keeps computeRoutes on the Essentials SKU; 11-25 doubles the price by
 * promoting it to Pro. Geometry is cosmetic, so we decline rather than silently overspend.
 */
const MAX_ESSENTIALS_INTERMEDIATES = 10;

const REQUEST_TIMEOUT_MS = 8000;

@Injectable()
export class GoogleRoutesProvider implements RoutingProvider {
  readonly name = 'google-routes';
  private readonly logger = new Logger(GoogleRoutesProvider.name);
  /**
   * computeRouteMatrix requires billing on the Cloud project even when computeRoutes does not,
   * so a project can legitimately have one working and not the other. Once the matrix has been
   * refused we stop asking and go straight to per-leg calls — retrying it on every request
   * would add a guaranteed failure and its latency to every recalculation.
   */
  private matrixAvailable = true;

  constructor(private readonly apiKey: string) {}

  async resolveLegs(pairs: readonly LegPair[]): Promise<Map<string, ResolvedLeg>> {
    const legs = new Map<string, ResolvedLeg>();
    if (pairs.length === 0) return legs;

    // The matrix bills PER ELEMENT, so request exactly the pairs that missed the cache rather
    // than the full cross product of the day's points.
    for (const chunk of chunkPairs(pairs, MAX_MATRIX_ELEMENTS)) {
      const origins = uniqueCoordinates(chunk.map(([from]) => from));
      const destinations = uniqueCoordinates(chunk.map(([, to]) => to));

      if (!this.matrixAvailable || origins.length * destinations.length > MAX_MATRIX_ELEMENTS) {
        await this.resolvePairwise(chunk, legs);
        continue;
      }

      const body = {
        origins: origins.map((c) => ({ waypoint: waypoint(c) })),
        destinations: destinations.map((c) => ({ waypoint: waypoint(c) })),
        travelMode: 'DRIVE',
        // TRAFFIC_AWARE would promote this to the Pro SKU AND make travel time depend on
        // departure time, which would mean refetching on every slider move.
        routingPreference: 'TRAFFIC_UNAWARE',
      };

      let elements: MatrixElement[];
      try {
        elements = await this.post<MatrixElement[]>(MATRIX_URL, body, MATRIX_FIELD_MASK);
      } catch {
        // Per-leg calls bill per REQUEST where the matrix bills per ELEMENT, so N legs cost
        // about the same either way — this trades round trips for resilience, not money.
        this.matrixAvailable = false;
        this.logger.warn(
          'Route Matrix refused; using per-leg Compute Routes calls for the rest of this process. ' +
            'Usually this means billing is not enabled on the Cloud project.',
        );
        await this.resolvePairwise(chunk, legs);
        continue;
      }

      for (const element of elements) {
        if (element.condition !== 'ROUTE_EXISTS') continue;
        const from = origins[element.originIndex];
        const to = destinations[element.destinationIndex];
        if (!from || !to) continue;
        legs.set(legKey(from, to), {
          durationSeconds: parseDuration(element.duration),
          distanceMetres: element.distanceMeters ?? 0,
          estimated: false,
        });
      }
    }

    return legs;
  }

  async resolveGeometry(sequence: readonly Coordinate[]): Promise<string | null> {
    if (sequence.length < 2) return null;
    const intermediates = sequence.slice(1, -1);
    if (intermediates.length > MAX_ESSENTIALS_INTERMEDIATES) {
      this.logger.warn(
        `Skipping geometry for ${intermediates.length} intermediates: over ${MAX_ESSENTIALS_INTERMEDIATES} ` +
          'would bill at the Pro rate. The map falls back to straight connectors.',
      );
      return null;
    }

    const body = {
      origin: waypoint(sequence[0]!),
      destination: waypoint(sequence[sequence.length - 1]!),
      intermediates: intermediates.map(waypoint),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      polylineEncoding: 'ENCODED_POLYLINE',
    };

    const response = await this.post<{ routes?: Array<{ polyline?: { encodedPolyline?: string } }> }>(
      ROUTES_URL,
      body,
      ROUTES_FIELD_MASK,
    );
    return response.routes?.[0]?.polyline?.encodedPolyline ?? null;
  }

  /** One computeRoutes call per leg. Slower than the matrix, but costs the same and works. */
  private async resolvePairwise(
    pairs: readonly LegPair[],
    into: Map<string, ResolvedLeg>,
  ): Promise<void> {
    const results = await Promise.all(
      pairs.map(async ([from, to]) => ({ from, to, leg: await this.singleLeg(from, to).catch(() => null) })),
    );
    for (const { from, to, leg } of results) {
      if (leg) into.set(legKey(from, to), leg);
    }
  }

  private async singleLeg(from: Coordinate, to: Coordinate): Promise<ResolvedLeg | null> {
    const body = {
      origin: waypoint(from),
      destination: waypoint(to),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    };
    const response = await this.post<{ routes?: Array<{ duration?: string; distanceMeters?: number }> }>(
      ROUTES_URL,
      body,
      'routes.duration,routes.distanceMeters',
    );
    const route = response.routes?.[0];
    if (!route) return null;
    return {
      durationSeconds: parseDuration(route.duration),
      distanceMetres: route.distanceMeters ?? 0,
      estimated: false,
    };
  }

  private async post<T>(url: string, body: unknown, fieldMask: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        // Logged with detail, surfaced to the user as a plain sentence. A Google error code
        // must never reach a scheduler's screen.
        this.logger.error(`Routes API ${response.status}: ${detail.slice(0, 500)}`);
        throw new RoutingUnavailableError();
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof RoutingUnavailableError) throw error;
      this.logger.error(`Routes API request failed: ${String(error)}`);
      throw new RoutingUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }
}

interface MatrixElement {
  originIndex: number;
  destinationIndex: number;
  duration?: string;
  distanceMeters?: number;
  condition?: string;
}

const waypoint = (c: Coordinate) => ({
  location: { latLng: { latitude: c.latitude, longitude: c.longitude } },
});

/** Google returns protobuf durations as `"1234s"`. */
function parseDuration(value: string | undefined): number {
  if (!value) return 0;
  return Math.round(Number.parseFloat(value.replace(/s$/, '')) || 0);
}

function uniqueCoordinates(coordinates: readonly Coordinate[]): Coordinate[] {
  const seen = new Map<string, Coordinate>();
  for (const c of coordinates) {
    seen.set(`${c.latitude},${c.longitude}`, c);
  }
  return [...seen.values()];
}

function chunkPairs(pairs: readonly LegPair[], size: number): LegPair[][] {
  const chunks: LegPair[][] = [];
  for (let i = 0; i < pairs.length; i += size) {
    chunks.push(pairs.slice(i, i + size) as LegPair[]);
  }
  return chunks;
}
