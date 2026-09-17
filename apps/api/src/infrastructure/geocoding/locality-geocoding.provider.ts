import { Injectable } from '@nestjs/common';
import type { Coordinate } from '@lebanon/contracts';
import { haversineMetres } from '../../domain/scheduling/geo.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { GeocodingProvider, ResolvedPlace } from './geocoding.port.js';

/**
 * Resolves against our own locality dictionary rather than a paid API.
 *
 * This is why "Saida" works with no Google account: the locality table already holds the
 * centroid, so a vague booking never needs a network call to rediscover a fact that does not
 * change. It is also the fallback when Google is unreachable.
 */
@Injectable()
export class LocalityGeocodingProvider implements GeocodingProvider {
  readonly name = 'locality-dictionary';

  constructor(private readonly prisma: PrismaService) {}

  async forward(query: string): Promise<ResolvedPlace | null> {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;

    const localities = await this.prisma.locality.findMany();
    // "Tripoli, Mina" should resolve to Mina: prefer the most specific name mentioned, which
    // is the longest one that appears in what the customer said.
    const matches = localities
      .filter((l) => needle.includes(l.name.toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length);

    const best = matches[0] ?? localities.find((l) => l.name.toLowerCase() === needle);
    if (!best) return null;

    return {
      coordinate: {
        latitude: Number(best.centroidLatitude),
        longitude: Number(best.centroidLongitude),
      },
      addressText: query.trim(),
      // A centroid is the whole town, and the map says so with a wide confidence circle.
      precision: 'LOCALITY',
      plusCode: null,
    };
  }

  async reverse(coordinate: Coordinate): Promise<ResolvedPlace | null> {
    const localities = await this.prisma.locality.findMany();
    if (localities.length === 0) return null;

    let nearest = localities[0]!;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const locality of localities) {
      const distance = haversineMetres(coordinate, {
        latitude: Number(locality.centroidLatitude),
        longitude: Number(locality.centroidLongitude),
      });
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = locality;
      }
    }

    return {
      coordinate,
      addressText: `Near ${nearest.name}`,
      // The PIN is exact — the scheduler put it there. Only the label is approximate.
      precision: 'EXACT',
      plusCode: null,
    };
  }
}
