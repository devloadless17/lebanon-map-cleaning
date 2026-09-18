import { Logger } from '../logger';
import type { Coordinate, LocationPrecision } from '@lebanon/contracts';
import { GeocodingFailedError } from '../errors';
import type { GeocodingProvider, ResolvedPlace } from './geocoding.port';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const TIMEOUT_MS = 6000;

export class GoogleGeocodingProvider implements GeocodingProvider {
  readonly name = 'google-geocoding';
  private readonly logger = new Logger(GoogleGeocodingProvider.name);

  constructor(private readonly apiKey: string) {}

  async forward(query: string): Promise<ResolvedPlace | null> {
    // Biased to Lebanon: an unqualified "Tripoli" should not land in Libya.
    const response = await this.request({ address: query, components: 'country:LB' });
    const result = response.results?.[0];

    /*
     * The bias has a sharp edge. Ask for "Damascus", "Paris" or a typo and Google does not say it
     * found nothing — it falls back to the country and returns "Lebanon" itself, a point in the
     * middle of the Beqaa. Accepting that would put a customer at a plausible-looking pin nobody
     * chose, and the scheduler would plan a real day's driving around it. Treat it as no result,
     * which lets the caller fall through to our own locality list and then say so plainly.
     */
    if (!result || isCountryLevel(result) || !withinLebanon(result)) return null;

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
  if (types.includes('sublocality') || types.includes('neighborhood')) return 'SUBLOCALITY';

  /*
   * Districts and governorates ("Western Beqaa District") are coarser than a town, not finer, so
   * they take the widest circle we have. They used to fall through to SUBLOCALITY and claim 800m
   * of accuracy for an area tens of kilometres across.
   */
  if (types.includes('locality') || types.some((t) => t.startsWith('administrative_area_level_'))) {
    return 'LOCALITY';
  }

  // Unrecognised shapes claim the least, never the most: a wide circle invites a corrective pin.
  return 'LOCALITY';
}

/** Google returning the country itself means it matched nothing inside it. */
function isCountryLevel(result: GeocodeResult): boolean {
  return (result.types ?? []).includes('country');
}

/** Lebanon's bounding box, with a margin. Catches a result the country bias failed to contain. */
function withinLebanon(result: GeocodeResult): boolean {
  const at = result.geometry?.location;
  if (!at) return false;
  return at.lat >= 33.0 && at.lat <= 34.75 && at.lng >= 35.0 && at.lng <= 36.7;
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
