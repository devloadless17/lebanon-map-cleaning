import { z } from 'zod';

/**
 * Validated once, at boot. A missing or malformed variable must stop the process immediately —
 * never fall back to a localhost default, because that turns a misconfigured production
 * deployment into a silent, wrong-but-running one.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters (openssl rand -base64 48)'),

  /** Exact origin, no trailing slash — CORS compares this string against the browser's Origin. */
  FRONTEND_ORIGIN: z
    .string()
    .url()
    .refine((v) => !v.endsWith('/'), 'FRONTEND_ORIGIN must not end with a trailing slash'),

  /**
   * Optional. Without it the app runs entirely on the straight-line estimator, which is how
   * the whole system stays developable with no Google account at all.
   */
  GOOGLE_MAPS_SERVER_KEY: z.string().default(''),

  /** Behind Caddy this is 1; add one per extra proxy (Cloudflare orange-cloud makes it 2). */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
