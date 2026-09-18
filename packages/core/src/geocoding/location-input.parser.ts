import type { Coordinate } from '@lebanon/contracts';

export type ParsedLocationInput =
  | { kind: 'coordinate'; coordinate: Coordinate }
  | { kind: 'google-maps-link'; url: string }
  | { kind: 'plus-code'; code: string }
  | { kind: 'text'; query: string };

/** Hosts whose redirects we are willing to follow. Anything else is treated as plain text. */
export const ALLOWED_MAP_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
  'g.co',
]);

const COORDINATE_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
// Open Location Code: 8 chars, a '+', then 2-3 more, optionally followed by a locality.
const PLUS_CODE_RE = /^\s*([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})(\s+.+)?\s*$/i;

/**
 * Customers send locations in whatever form they have to hand — a WhatsApp-shared pin, a Maps
 * link, a Plus Code, raw coordinates, or just "Tripoli, Mina". One field accepts all of them
 * and every path converges on the same draggable pin.
 */
export function parseLocationInput(raw: string): ParsedLocationInput {
  const input = raw.trim();

  const coordinateMatch = COORDINATE_RE.exec(input);
  if (coordinateMatch) {
    const latitude = Number.parseFloat(coordinateMatch[1]!);
    const longitude = Number.parseFloat(coordinateMatch[2]!);
    if (isValidCoordinate(latitude, longitude)) {
      return { kind: 'coordinate', coordinate: { latitude, longitude } };
    }
  }

  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      if (ALLOWED_MAP_HOSTS.has(url.hostname.toLowerCase())) {
        return { kind: 'google-maps-link', url: url.toString() };
      }
    } catch {
      // Not a URL after all; fall through to text.
    }
  }

  const plusMatch = PLUS_CODE_RE.exec(input);
  if (plusMatch) return { kind: 'plus-code', code: input };

  return { kind: 'text', query: input };
}

/**
 * Pulls coordinates out of an expanded Google Maps URL.
 *
 * Order matters: `!3d<lat>!4d<lng>` is the PLACE, while `@lat,lng,17z` is only where the map
 * viewport happened to be centred. Preferring `@` would silently drop the pin in the wrong spot.
 */
export function coordinateFromMapsUrl(url: string): Coordinate | null {
  const place = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url);
  if (place) return toCoordinate(place[1]!, place[2]!);

  const query = /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url);
  if (query) return toCoordinate(query[1]!, query[2]!);

  const viewport = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url);
  if (viewport) return toCoordinate(viewport[1]!, viewport[2]!);

  return null;
}

function toCoordinate(lat: string, lng: string): Coordinate | null {
  const latitude = Number.parseFloat(lat);
  const longitude = Number.parseFloat(lng);
  return isValidCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}
