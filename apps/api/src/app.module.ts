import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DomainExceptionFilter } from './common/domain-exception.filter.js';
import { AppConfigModule } from './config/config.module.js';
import { GeocodingModule } from './infrastructure/geocoding/geocoding.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { RoutingModule } from './infrastructure/routing/routing.module.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { AuthGuard } from './modules/auth/auth.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogController } from './modules/catalog/catalog.controller.js';
import { CustomersController } from './modules/customers/customers.controller.js';
import { HealthController } from './modules/health/health.controller.js';
import { LocationsController } from './modules/locations/locations.controller.js';
import { SchedulingModule } from './modules/scheduling/scheduling.module.js';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    RoutingModule,
    GeocodingModule,
    AuthModule,
    SchedulingModule,
    AppointmentsModule,
  ],
  controllers: [HealthController, CustomersController, LocationsController, CatalogController],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global, so a newly added controller is protected by default and must opt out with
    // @Public() rather than opt in.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
