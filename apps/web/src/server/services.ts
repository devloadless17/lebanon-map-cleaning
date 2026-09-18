import {
  AppointmentsService,
  CachedRoutingProvider,
  DayRepository,
  GoogleGeocodingProvider,
  GoogleRoutesProvider,
  HaversineRoutingProvider,
  LocalityGeocodingProvider,
  Logger,
  LocationResolver,
  MapsLinkResolver,
  SchedulingService,
  TravelMatrixBuilder,
  db,
  type GeocodingProvider,
  type RoutingProvider,
} from '@lebanon/core';
import { env } from './env';

/**
 * Wires the application together once per process.
 *
 * This replaces a dependency-injection container with a function, which is all the wiring ever
 * actually needed: there is one composition and it never varies at runtime. Caching on
 * globalThis means a warm serverless instance reuses it rather than rebuilding on every request.
 */
const globalForServices = globalThis as unknown as { __lebanonServices?: Services };

export interface Services {
  readonly days: DayRepository;
  readonly scheduling: SchedulingService;
  readonly appointments: AppointmentsService;
  readonly geocoding: GeocodingProvider;
  readonly localities: LocalityGeocodingProvider;
  readonly links: MapsLinkResolver;
  readonly locations: LocationResolver;
}

export function services(): Services {
  if (globalForServices.__lebanonServices) return globalForServices.__lebanonServices;

  const prisma = db();
  const { GOOGLE_MAPS_SERVER_KEY: key } = env();
  const haversine = new HaversineRoutingProvider();

  // No key configured is a supported mode, not an error: the app runs fully on estimates, which
  // is what lets it be developed and demoed with no Google account at all.
  const inner: RoutingProvider = key ? new GoogleRoutesProvider(key) : haversine;
  const routing = new CachedRoutingProvider(inner, prisma, haversine);

  new Logger('services').log(
    key ? 'Using Google Routes for real road distances.' : 'No Google key — distances are estimates.',
  );

  const localities = new LocalityGeocodingProvider(prisma);
  const geocoding: GeocodingProvider = key ? new GoogleGeocodingProvider(key) : localities;

  const days = new DayRepository(prisma);
  const matrices = new TravelMatrixBuilder(routing);
  const scheduling = new SchedulingService(days, matrices);

  const links = new MapsLinkResolver();
  const built: Services = {
    days,
    scheduling,
    appointments: new AppointmentsService(prisma, days, scheduling),
    geocoding,
    localities,
    links,
    locations: new LocationResolver(prisma, geocoding, localities, links),
  };

  globalForServices.__lebanonServices = built;
  return built;
}
