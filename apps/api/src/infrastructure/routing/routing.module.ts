import { Global, Logger, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CachedRoutingProvider } from './cached-routing.provider.js';
import { GoogleRoutesProvider } from './google-routes.provider.js';
import { HaversineRoutingProvider } from './haversine-routing.provider.js';
import { ROUTING_PROVIDER, type RoutingProvider } from './routing.port.js';

@Global()
@Module({
  providers: [
    HaversineRoutingProvider,
    {
      provide: ROUTING_PROVIDER,
      inject: [ENV, PrismaService, HaversineRoutingProvider],
      useFactory: (
        env: Env,
        prisma: PrismaService,
        haversine: HaversineRoutingProvider,
      ): RoutingProvider => {
        // No key configured is a supported mode, not an error: the app runs fully on estimates,
        // which is what lets the engine and UI be developed with no Google account at all.
        const inner: RoutingProvider = env.GOOGLE_MAPS_SERVER_KEY
          ? new GoogleRoutesProvider(env.GOOGLE_MAPS_SERVER_KEY)
          : haversine;

        // Said out loud at boot, because the environment is read once when the process starts:
        // adding the key to .env and only restarting the watcher leaves the old value in place,
        // and the app silently keeps estimating with no clue as to why.
        const logger = new Logger('RoutingModule');
        if (env.GOOGLE_MAPS_SERVER_KEY) {
          logger.log('Using Google Routes for real road distances.');
        } else {
          logger.warn(
            'No GOOGLE_MAPS_SERVER_KEY — distances are straight-line estimates. ' +
              'Set it in .env and restart `npm run dev` (not just the API) to use real roads.',
          );
        }

        return new CachedRoutingProvider(inner, prisma, haversine);
      },
    },
  ],
  exports: [ROUTING_PROVIDER, HaversineRoutingProvider],
})
export class RoutingModule {}
