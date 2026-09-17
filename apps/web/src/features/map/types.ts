import type { Coordinate, LocationPrecision } from '@lebanon/contracts';

export type MapStopKind = 'depot' | 'stop' | 'proposal';

export interface MapStop {
  readonly id: string;
  /** Position in the day's route; null for the depot and for an unplaced proposal. */
  readonly sequence: number | null;
  readonly label: string;
  readonly time: string | null;
  readonly coordinate: Coordinate;
  readonly kind: MapStopKind;
  /** Drives the confidence circle: how precisely we actually know where this is. */
  readonly precision?: LocationPrecision;
  readonly selected?: boolean;
}

/**
 * The contract the scheduling UI depends on. Nothing outside `features/map/google` may import
 * `google.maps`, which is what keeps the provider swappable rather than merely notionally so.
 */
export interface MapCanvasProps {
  readonly stops: readonly MapStop[];
  /** Encoded road geometry. When absent the route is drawn as straight connectors. */
  readonly polyline: string | null;
  readonly onSelect?: (id: string) => void;
  readonly onMapClick?: (coordinate: Coordinate) => void;
  readonly className?: string;
}

/** Google's polyline algorithm. Decoding here keeps the format detail out of the components. */
export function decodePolyline(encoded: string): Coordinate[] {
  const points: Coordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

/** Typical radius of error per precision level, drawn as a circle around the pin. */
export const PRECISION_METRES: Record<LocationPrecision, number> = {
  LOCALITY: 3000,
  SUBLOCALITY: 800,
  LANDMARK: 150,
  EXACT: 0,
};
