import type { Coordinate, LocationPrecision } from '@lebanon/contracts';
import { GeocodingFailedError } from '../errors';
import type { Db } from '../prisma';
import type { GeocodingProvider } from './geocoding.port';
import type { LocalityGeocodingProvider } from './locality.provider';
import type { MapsLinkResolver } from './maps-link.resolver';
import { parseLocationInput } from './location-input.parser';

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  addressText: string;
  precision: LocationPrecision;
  plusCode: string | null;
  localityId: string | null;
  planningAreaId: string | null;
  source: 'coordinates' | 'maps-link' | 'plus-code' | 'search';
}

/**
 * Turns whatever a customer sent into a point on the map.
 *
 * Customers do not supply addresses in one shape — a WhatsApp-shared pin, a Maps link, a Plus
 * Code, raw coordinates, or just "Tripoli, Mina". Every path converges on the same thing: a
 * coordinate, a precision saying how much we actually know, and a label the scheduler can edit.
 */
export class LocationResolver {
  constructor(
    private readonly prisma: Db,
    private readonly geocoding: GeocodingProvider,
    private readonly localities: LocalityGeocodingProvider,
    private readonly links: MapsLinkResolver,
  ) {}

  async resolve(input: string): Promise<ResolvedLocation> {
    const parsed = parseLocationInput(input);

    if (parsed.kind === 'coordinate') {
      const label = await this.safeReverse(parsed.coordinate);
      return this.withLocality({
        latitude: parsed.coordinate.latitude,
        longitude: parsed.coordinate.longitude,
        addressText: label?.addressText ?? input.trim(),
        // The customer sent the exact point; only the label is uncertain.
        precision: 'EXACT',
        plusCode: label?.plusCode ?? null,
        source: 'coordinates',
      });
    }

    if (parsed.kind === 'google-maps-link') {
      const coordinate = await this.links.resolve(parsed.url);
      if (!coordinate) {
        throw new GeocodingFailedError(
          'We could not read a location from that link. Try dropping a pin on the map instead.',
        );
      }
      const label = await this.safeReverse(coordinate);
      return this.withLocality({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        addressText: label?.addressText ?? 'Shared location',
        precision: 'EXACT',
        plusCode: label?.plusCode ?? null,
        source: 'maps-link',
      });
    }

    const query = parsed.kind === 'plus-code' ? parsed.code : parsed.query;
    // `??` only covers a null RESULT. A refused API throws, and an exception here would skip
    // the fallback entirely — breaking location entry rather than quietly degrading it.
    const place = (await this.safeForward(query)) ?? (await this.localities.forward(query));
    if (!place) {
      throw new GeocodingFailedError(
        `We could not find "${query}". Try a nearby landmark, or drop a pin on the map.`,
      );
    }

    return this.withLocality({
      latitude: place.coordinate.latitude,
      longitude: place.coordinate.longitude,
      addressText: place.addressText || query,
      precision: parsed.kind === 'plus-code' ? 'EXACT' : place.precision,
      plusCode: place.plusCode,
      source: parsed.kind === 'plus-code' ? 'plus-code' : 'search',
    });
  }

  async reverse(coordinate: Coordinate): Promise<ResolvedLocation> {
    const label = await this.safeReverse(coordinate);
    return this.withLocality({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      addressText: label?.addressText ?? '',
      precision: 'EXACT',
      plusCode: label?.plusCode ?? null,
      source: 'coordinates',
    });
  }

  private async safeForward(query: string) {
    try {
      return await this.geocoding.forward(query);
    } catch {
      return null;
    }
  }

  /** Reverse geocoding is cosmetic: a failure must never block a booking. */
  private async safeReverse(coordinate: Coordinate) {
    try {
      return await this.geocoding.reverse(coordinate);
    } catch {
      return this.localities.reverse(coordinate).catch(() => null);
    }
  }

  /** Attach the locality — and therefore the planning area — by nearest known centre. */
  private async withLocality(
    partial: Omit<ResolvedLocation, 'localityId' | 'planningAreaId'>,
  ): Promise<ResolvedLocation> {
    const localities = await this.prisma.locality.findMany();
    let nearestId: string | null = null;
    let nearestAreaId: string | null = null;
    let best = Number.POSITIVE_INFINITY;

    for (const locality of localities) {
      const dLat = (Number(locality.centroidLatitude) - partial.latitude) * 111;
      const dLng =
        (Number(locality.centroidLongitude) - partial.longitude) *
        111 *
        Math.cos((partial.latitude * Math.PI) / 180);
      const km = Math.hypot(dLat, dLng);
      if (km < best) {
        best = km;
        nearestId = locality.id;
        nearestAreaId = locality.planningAreaId;
      }
    }

    // Beyond ~25 km the nearest known town says nothing useful about where this pin is.
    const withinRange = best <= 25;
    return {
      ...partial,
      localityId: withinRange ? nearestId : null,
      planningAreaId: withinRange ? nearestAreaId : null,
    };
  }
}
