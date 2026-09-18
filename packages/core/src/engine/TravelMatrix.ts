import type { Coordinate } from '@lebanon/contracts';

export interface TravelLeg {
  readonly minutes: number;
  readonly metres: number;
}

/**
 * Coordinates are snapped to ~11 m before being used as a cache key. Two pins a few metres
 * apart are the same doorstep for routing purposes, and snapping is what gives the leg cache
 * a usable hit rate across repeat visits.
 */
const KEY_PRECISION = 4;

export function coordinateKey(c: Coordinate): string {
  return `${c.latitude.toFixed(KEY_PRECISION)},${c.longitude.toFixed(KEY_PRECISION)}`;
}

export function legKey(from: Coordinate, to: Coordinate): string {
  return `${coordinateKey(from)}>${coordinateKey(to)}`;
}

export class MissingTravelLegError extends Error {
  constructor(
    readonly from: Coordinate,
    readonly to: Coordinate,
  ) {
    super(`No travel leg for ${legKey(from, to)}`);
    this.name = 'MissingTravelLegError';
  }
}

/**
 * An immutable lookup of travel times between the points in one day's plan.
 *
 * The engine receives this as plain data. It never fetches, so every scheduling test runs with
 * hand-written distances and no network — and the whole interactive experience costs zero API
 * calls, because travel time depends on coordinates, not on the time of day.
 */
export class TravelMatrix {
  private constructor(private readonly legs: ReadonlyMap<string, TravelLeg>) {}

  static from(entries: Iterable<[string, TravelLeg]>): TravelMatrix {
    return new TravelMatrix(new Map(entries));
  }

  /** Build from explicit point-to-point legs. Symmetry is NOT assumed — roads are one-way. */
  static fromLegs(
    legs: Iterable<{ from: Coordinate; to: Coordinate; minutes: number; metres: number }>,
  ): TravelMatrix {
    const map = new Map<string, TravelLeg>();
    for (const leg of legs) {
      map.set(legKey(leg.from, leg.to), { minutes: leg.minutes, metres: leg.metres });
    }
    return new TravelMatrix(map);
  }

  has(from: Coordinate, to: Coordinate): boolean {
    return coordinateKey(from) === coordinateKey(to) || this.legs.has(legKey(from, to));
  }

  between(from: Coordinate, to: Coordinate): TravelLeg {
    // Two stops at the same doorstep — different flats in one building, or a location we only
    // know to locality precision, so it shares a centroid with another. Zero travel is correct;
    // the access buffer is what stops the second visit from appearing free.
    if (coordinateKey(from) === coordinateKey(to)) return { minutes: 0, metres: 0 };

    const leg = this.legs.get(legKey(from, to));
    if (!leg) throw new MissingTravelLegError(from, to);
    return leg;
  }

  /** Every point-pair a caller must supply before the engine can run. */
  static requiredPairs(points: readonly Coordinate[]): Array<[Coordinate, Coordinate]> {
    const pairs: Array<[Coordinate, Coordinate]> = [];
    for (const from of points) {
      for (const to of points) {
        if (coordinateKey(from) !== coordinateKey(to)) pairs.push([from, to]);
      }
    }
    return pairs;
  }
}
