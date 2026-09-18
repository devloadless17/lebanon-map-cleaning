import { Logger } from '../logger';
import type { Coordinate } from '@lebanon/contracts';
import { coordinateKey, legKey } from '../engine/TravelMatrix';
import type { Db } from '../prisma';
import type { LegPair, ResolvedLeg, RoutingProvider } from './routing.port';

/** Lebanon's road geometry is stable; only traffic changes, and we do not price that in. */
const CACHE_TTL_DAYS = 60;

/**
 * A decorator over any RoutingProvider, not a branch inside one.
 *
 * Caching is therefore a composition concern: it can be tested on its own, switched off by
 * simply not wrapping, and it survives a change of provider untouched. Because travel time
 * under traffic-unaware routing depends on coordinates rather than the time of day, a warm
 * cache means experimenting with appointment times costs nothing at all.
 */
export class CachedRoutingProvider implements RoutingProvider {
  readonly name: string;
  private readonly logger = new Logger(CachedRoutingProvider.name);

  constructor(
    private readonly inner: RoutingProvider,
    private readonly prisma: Db,
    private readonly fallback: RoutingProvider,
  ) {
    this.name = `cached(${inner.name})`;
  }

  async resolveLegs(pairs: readonly LegPair[]): Promise<Map<string, ResolvedLeg>> {
    const resolved = new Map<string, ResolvedLeg>();
    if (pairs.length === 0) return resolved;

    const wanted = new Map<string, LegPair>();
    for (const pair of pairs) {
      const [from, to] = pair;
      if (coordinateKey(from) === coordinateKey(to)) continue;
      wanted.set(legKey(from, to), pair);
    }

    const freshAfter = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const cached = await this.prisma.travelLeg.findMany({
      where: {
        OR: [...wanted.values()].map(([from, to]) => ({
          originKey: coordinateKey(from),
          destinationKey: coordinateKey(to),
        })),
        fetchedAt: { gte: freshAfter },
        estimated: false,
      },
    });

    for (const row of cached) {
      const key = `${row.originKey}>${row.destinationKey}`;
      resolved.set(key, {
        durationSeconds: row.durationSeconds,
        distanceMetres: row.distanceMetres,
        estimated: row.estimated,
      });
      wanted.delete(key);
    }

    if (wanted.size === 0) return resolved;

    const misses = [...wanted.values()];
    let fetched: Map<string, ResolvedLeg>;
    try {
      fetched = await this.inner.resolveLegs(misses);
    } catch (error) {
      // Degrade instead of dying: an approximate day the scheduler knows is approximate beats
      // an error page.
      this.logger.warn(`Falling back to estimates for ${misses.length} legs: ${String(error)}`);
      fetched = await this.fallback.resolveLegs(misses);
    }

    for (const [key, leg] of fetched) {
      resolved.set(key, leg);
    }

    await this.persist(misses, fetched);
    return resolved;
  }

  async resolveGeometry(sequence: readonly Coordinate[]): Promise<string | null> {
    if (sequence.length < 2) return null;
    const sequenceHash = sequence.map(coordinateKey).join('|');

    const cached = await this.prisma.routeGeometry.findUnique({ where: { sequenceHash } });
    if (cached) return cached.encodedPolyline;

    let polyline: string | null;
    try {
      polyline = await this.inner.resolveGeometry(sequence);
    } catch (error) {
      this.logger.warn(`Geometry unavailable: ${String(error)}`);
      return null;
    }
    if (!polyline) return null;

    await this.prisma.routeGeometry.upsert({
      where: { sequenceHash },
      create: { sequenceHash, encodedPolyline: polyline },
      update: { encodedPolyline: polyline, fetchedAt: new Date() },
    });
    return polyline;
  }

  /** Estimated legs are cached too, but marked so a real provider can supersede them later. */
  private async persist(misses: readonly LegPair[], fetched: Map<string, ResolvedLeg>): Promise<void> {
    const writes = misses.flatMap(([from, to]) => {
      const leg = fetched.get(legKey(from, to));
      if (!leg) return [];
      const originKey = coordinateKey(from);
      const destinationKey = coordinateKey(to);
      return [
        this.prisma.travelLeg.upsert({
          where: { originKey_destinationKey: { originKey, destinationKey } },
          create: {
            originKey,
            destinationKey,
            durationSeconds: leg.durationSeconds,
            distanceMetres: leg.distanceMetres,
            estimated: leg.estimated,
          },
          update: {
            durationSeconds: leg.durationSeconds,
            distanceMetres: leg.distanceMetres,
            estimated: leg.estimated,
            fetchedAt: new Date(),
          },
        }),
      ];
    });

    if (writes.length > 0) await this.prisma.$transaction(writes);
  }
}
