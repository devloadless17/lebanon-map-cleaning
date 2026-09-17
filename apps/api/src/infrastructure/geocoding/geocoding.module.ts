import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GEOCODING_PROVIDER, type GeocodingProvider } from './geocoding.port.js';
import { GoogleGeocodingProvider } from './google-geocoding.provider.js';
import { LocalityGeocodingProvider } from './locality-geocoding.provider.js';
import { MapsLinkResolver } from './maps-link.resolver.js';

@Global()
@Module({
  providers: [
    MapsLinkResolver,
    LocalityGeocodingProvider,
    {
      provide: GEOCODING_PROVIDER,
      inject: [ENV, LocalityGeocodingProvider],
      useFactory: (env: Env, local: LocalityGeocodingProvider): GeocodingProvider =>
        env.GOOGLE_MAPS_SERVER_KEY
          ? new GoogleGeocodingProvider(env.GOOGLE_MAPS_SERVER_KEY)
          : local,
    },
  ],
  exports: [GEOCODING_PROVIDER, MapsLinkResolver, LocalityGeocodingProvider],
})
export class GeocodingModule {}
