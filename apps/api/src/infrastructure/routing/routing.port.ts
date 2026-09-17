import type { Coordinate } from '@lebanon/contracts';

export interface ResolvedLeg {
  readonly durationSeconds: number;
  readonly distanceMetres: number;
  /** True when this came from the straight-line estimator rather than the road network. */
  readonly estimated: boolean;
}

export type LegPair = readonly [Coordinate, Coordinate];

/**
 * The port the domain depends on. Provider-specific request and response shapes never cross
 * this boundary — swapping Google for a self-hosted OSRM is a one-class change that leaves the
 * engine, the cache and every test untouched.
 */
export interface RoutingProvider {
  readonly name: string;
  /** Keyed by `legKey(from, to)`. */
  resolveLegs(pairs: readonly LegPair[]): Promise<Map<string, ResolvedLeg>>;
  /** Encoded polyline for a settled sequence, or null when geometry is unavailable. */
  resolveGeometry(sequence: readonly Coordinate[]): Promise<string | null>;
}

export const ROUTING_PROVIDER = Symbol('ROUTING_PROVIDER');
