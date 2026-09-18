import type { Coordinate } from '@lebanon/contracts';

const EARTH_RADIUS_METRES = 6_371_000;

/** Straight-line distance. Used for proximity hints and as the degraded travel estimate. */
export function haversineMetres(a: Coordinate, b: Coordinate): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(h)));
}

/**
 * Roads are never straight. Used only when the routing provider is unavailable, so the
 * scheduler still sees an approximate day rather than a spinner — clearly labelled as estimated.
 */
export const ROAD_WINDING_FACTOR = 1.35;
export const FALLBACK_SPEED_KMH = 40;
