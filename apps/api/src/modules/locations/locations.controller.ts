import { Body, Controller, Inject, Param, Patch, Post } from '@nestjs/common';
import { createLocationSchema, type CreateLocation, type LocationPrecision } from '@lebanon/contracts';
import { z } from 'zod';
import { definedOnly } from '../../common/defined-only.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { GeocodingFailedError } from '../../domain/errors/domain-errors.js';
import { GEOCODING_PROVIDER, type GeocodingProvider } from '../../infrastructure/geocoding/geocoding.port.js';
import { LocalityGeocodingProvider } from '../../infrastructure/geocoding/locality-geocoding.provider.js';
import { MapsLinkResolver } from '../../infrastructure/geocoding/maps-link.resolver.js';
import { parseLocationInput } from '../../infrastructure/geocoding/location-input.parser.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

const resolveSchema = z.object({ input: z.string().trim().min(1).max(2000) });
const reverseSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export interface ResolvedLocationResponse {
  latitude: number;
  longitude: number;
  addressText: string;
  precision: LocationPrecision;
  plusCode: string | null;
  localityId: string | null;
  planningAreaId: string | null;
  source: 'coordinates' | 'maps-link' | 'plus-code' | 'search';
}

@Controller()
export class LocationsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider,
    private readonly links: MapsLinkResolver,
    private readonly localities: LocalityGeocodingProvider,
  ) {}

  /**
   * One endpoint for every shape a customer's location arrives in. Each path ends at the same
   * place: a coordinate, a precision, and a label the scheduler can correct.
   */
  @Post('locations/resolve')
  async resolve(@Body(new ZodValidationPipe(resolveSchema)) body: z.infer<typeof resolveSchema>): Promise<ResolvedLocationResponse> {
    const parsed = parseLocationInput(body.input);

    if (parsed.kind === 'coordinate') {
      const label = await this.safeReverse(parsed.coordinate);
      return this.withLocality({
        latitude: parsed.coordinate.latitude,
        longitude: parsed.coordinate.longitude,
        addressText: label?.addressText ?? body.input.trim(),
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
    // `??` only covers a null RESULT. Google throws when the API is refused — billing not
    // enabled, key restricted, service down — and an exception would skip the fallback
    // entirely, breaking location entry rather than quietly degrading it.
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

  @Post('locations/reverse')
  async reverse(@Body(new ZodValidationPipe(reverseSchema)) body: z.infer<typeof reverseSchema>): Promise<ResolvedLocationResponse> {
    const label = await this.safeReverse(body);
    return this.withLocality({
      latitude: body.latitude,
      longitude: body.longitude,
      addressText: label?.addressText ?? '',
      precision: 'EXACT',
      plusCode: label?.plusCode ?? null,
      source: 'coordinates',
    });
  }

  @Post('locations')
  async create(@Body(new ZodValidationPipe(createLocationSchema)) body: CreateLocation) {
    return this.prisma.location.create({
      data: {
        customerId: body.customerId,
        label: body.label ?? null,
        addressText: body.addressText,
        localityId: body.localityId ?? null,
        precision: body.precision,
        latitude: body.latitude,
        longitude: body.longitude,
        plusCode: body.plusCode ?? null,
        landmarkNotes: body.landmarkNotes ?? null,
      },
      include: { locality: { include: { planningArea: true } } },
    });
  }

  @Patch('locations/:id')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(createLocationSchema.partial())) body: Partial<CreateLocation>) {
    return this.prisma.location.update({
      where: { id },
      data: definedOnly(body),
      include: { locality: { include: { planningArea: true } } },
    });
  }

  /** Falls back to our own locality dictionary whenever Google cannot answer. */
  private async safeForward(query: string) {
    try {
      return await this.geocoding.forward(query);
    } catch {
      return null;
    }
  }

  /** Reverse geocoding is cosmetic: a failure must never block a booking. */
  private async safeReverse(coordinate: { latitude: number; longitude: number }) {
    try {
      return await this.geocoding.reverse(coordinate);
    } catch {
      return this.localities.reverse(coordinate).catch(() => null);
    }
  }

  /** Attach the locality (and therefore the planning area) by nearest known centre. */
  private async withLocality(
    partial: Omit<ResolvedLocationResponse, 'localityId' | 'planningAreaId'>,
  ): Promise<ResolvedLocationResponse> {
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
