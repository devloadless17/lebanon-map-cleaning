/**
 * Everything the scheduling product does, with no web framework attached.
 *
 * Kept deliberately free of HTTP concerns so it can run behind Next.js route handlers today and
 * a long-lived server later without being rewritten — the engine and its tests never change.
 */
export * from './engine/types';
export * from './engine/TravelMatrix';
export * from './engine/DaySimulator';
export * from './engine/InsertionScanner';
export * from './engine/RouteFeedback';
export * from './engine/geo';

export * from './errors';
export * from './logger';
export * from './password';
export * from './defined-only';
export * from './prisma';

export * from './routing/routing.port';
export * from './routing/haversine.provider';
export * from './routing/google.provider';
export * from './routing/cached.provider';

export * from './geocoding/geocoding.port';
export * from './geocoding/location-input.parser';
export * from './geocoding/google.provider';
export * from './geocoding/locality.provider';
export * from './geocoding/maps-link.resolver';
export * from './geocoding/location-resolver';

export * from './scheduling/day.repository';
export * from './scheduling/travel-matrix.builder';
export * from './scheduling/scheduling.service';
export * from './scheduling/appointments.service';
export * from './demo-data';
