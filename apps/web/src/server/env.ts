import { z } from 'zod';

/**
 * Validated once, at module load. A missing or malformed value must fail immediately rather
 * than produce a deployment that runs and quietly does the wrong thing.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters (openssl rand -base64 48)'),
  /** Optional: without it the app runs on straight-line estimates and an OpenStreetMap map. */
  GOOGLE_MAPS_SERVER_KEY: z.string().default(''),
});

let cached: z.infer<typeof schema> | null = null;

export function env(): z.infer<typeof schema> {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  cached = parsed.data;
  return cached;
}
