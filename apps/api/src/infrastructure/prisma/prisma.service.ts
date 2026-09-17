import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { ENV, type Env } from '../../config/env.js';

/**
 * Prisma 7 dropped the Rust query engine and no longer reads the connection URL from the
 * schema — the client takes a driver adapter instead.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // Paired with app.enableShutdownHooks(): without an explicit close, every redeploy severs
  // in-flight queries instead of draining them.
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
