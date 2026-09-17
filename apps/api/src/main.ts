import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ENV, type Env } from './config/env.js';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const env = app.get<Env>(ENV);

  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  // No global ValidationPipe: that one is built for class-validator DTOs and pulls in a
  // dependency we do not use. Every route validates with the Zod schema shared with the web
  // app, so the rules exist in exactly one place.

  // Wrong value silently breaks rate limiting and audit logs: 1 for Caddy directly in front,
  // +1 for each additional proxy.
  app.set('trust proxy', env.TRUSTED_PROXY_HOPS);

  app.enableCors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
  });

  // Without these, SIGTERM kills Node instantly and every redeploy severs in-flight requests
  // instead of draining them.
  app.enableShutdownHooks();

  const logger = new Logger('Bootstrap');
  // Makes a deploy's drain visible in `docker compose logs`, instead of leaving you guessing
  // whether the container shut down cleanly or was killed mid-request.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => logger.log(`${signal} received — draining connections`));
  }

  await app.listen(env.PORT, '0.0.0.0');
  logger.log(`API listening on :${env.PORT} (${env.NODE_ENV})`);
}

bootstrap().catch((error: unknown) => {
  // Fail loudly and exit non-zero so the orchestrator restarts rather than parking a dead app.
  console.error('Failed to start the API:', error);
  process.exit(1);
});
