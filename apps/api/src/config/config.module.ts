import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv } from './env.js';

/**
 * Global so every module can inject ENV without importing anything.
 *
 * Declaring the provider on AppModule alone is not enough: a provider inside another module
 * resolves against that module's injector, so PrismaService could not see it.
 */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class AppConfigModule {}
