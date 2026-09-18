import type { Coordinate, LocationPrecision } from '@lebanon/contracts';

export interface ResolvedPlace {
  readonly coordinate: Coordinate;
  /** A human-readable label. Always editable, never an input to routing. */
  readonly addressText: string;
  readonly precision: LocationPrecision;
  readonly plusCode: string | null;
}

export interface PlaceSuggestion {
  readonly id: string;
  readonly description: string;
}

export interface GeocodingProvider {
  readonly name: string;
  /** Free text, a locality name, or a Plus Code -> a point. */
  forward(query: string): Promise<ResolvedPlace | null>;
  /** A point -> a readable label. Cosmetic: failure must never block a booking. */
  reverse(coordinate: Coordinate): Promise<ResolvedPlace | null>;
}

export const GEOCODING_PROVIDER = Symbol('GEOCODING_PROVIDER');
