import { Injectable, Logger } from '@nestjs/common';
import type { Coordinate, LocationPrecision } from '@lebanon/contracts';
import { GeocodingFailedError } from '../../domain/errors/domain-errors.js';
import type { GeocodingProvider, ResolvedPlace } from './geocoding.port.js';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const TIMEOUT_MS = 6000;

@Injectable()
export class GoogleGeocodingProvider implements GeocodingProvider {
  readonly name = 'google-geocoding';
  private readonly logger = new Logger(GoogleGeocodingProvider.name);

  constructor(private readonly apiKey: string) {}

  async forward(query: string): Promise<ResolvedPlace | null> {
    // Biased to Lebanon: an unqualified "Tripoli" should not land in Libya.
    const response = await this.request({ address: query, components: 'country:LB' });
    return this.firstPlace(response);
  }

  async reverse(coordinate: Coordinate): Promise<ResolvedPlace | null> {
    const response = await this.request({
      latlng: `${coordinate.latitude},${coordinate.longitude}`,
    });
    return this.firstPlace(response);
  }

  private firstPlace(response: GeocodeResponse): ResolvedPlace | null {
    const result = response.results?.[0];
    if (!result?.geometry?.location) return null;

    return {
      coordinate: {
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
      },
      addressText: result.formatted_address ?? '',
      precision: mapPrecision(result),
      plusCode: result.plus_code?.global_code ?? response.plus_code?.global_code ?? null,
    };
  }

  private async request(params: Record<string, string>): Promise<GeocodeResponse> {
    const url = new URL(GEOCODE_URL);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('key', this.apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        this.logger.error(`Geocoding API ${response.status}`);
        throw new GeocodingFailedError();
      }
      const body = (await response.json()) as GeocodeResponse;
      if (body.status === 'ZERO_RESULTS') return { results: [], status: body.status };
      if (body.status !== 'OK') {
        this.logger.error(`Geocoding API status ${body.status}: ${body.error_message ?? ''}`);
        throw new GeocodingFailedError();
      }
      return body;
    } catch (error) {
      if (error instanceof GeocodingFailedError) throw error;
      this.logger.error(`Geocoding request failed: ${String(error)}`);
      throw new GeocodingFailedError();
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Google's location_type tells us how much to trust the point, which is exactly what drives the
 * confidence circle on the map. Lebanese residential addresses commonly come back APPROXIMATE,
 * and that is information worth showing rather than hiding.
 */
function mapPrecision(result: GeocodeResult): LocationPrecision {
  const type = result.geometry?.location_type;
  if (type === 'ROOFTOP') return 'EXACT';
  if (type === 'RANGE_INTERPOLATED' || type === 'GEOMETRIC_CENTER') return 'LANDMARK';

  const types = result.types ?? [];
  if (types.includes('locality') || types.includes('administrative_area_level_1')) return 'LOCALITY';
  if (types.includes('sublocality') || types.includes('neighborhood')) return 'SUBLOCALITY';
  return 'SUBLOCALITY';
}

interface GeocodeResponse {
  results?: GeocodeResult[];
  status?: string;
  error_message?: string;
  plus_code?: { global_code?: string };
}

interface GeocodeResult {
  formatted_address?: string;
  types?: string[];
  plus_code?: { global_code?: string };
  geometry?: {
    location?: { lat: number; lng: number };
    location_type?: string;
  };
}
