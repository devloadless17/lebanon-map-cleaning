import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Builds the pg driver adapter from a connection string, honouring `?schema=`.
 *
 * Prisma's own engine reads that parameter; the pg driver adapter does not, and connects on the
 * default search_path so every query lands in `public`. This database is shared with another
 * application whose tables live there, so that is not cosmetic — queries address the wrong
 * schema. We pass the name to the adapter, which qualifies generated queries with it.
 *
 * Setting `search_path` through libpq's `options` would be the other route, but a pooler sits
 * in front of this server and rejects startup parameters it does not recognise
 * (`08P01 unsupported startup parameter in options`). Qualifying the queries needs nothing
 * from the connection, so it works either way.
 */
export function makeAdapter(connectionString: string): PrismaPg {
  const schema = readSchema(connectionString);

  /*
   * A serverless instance handles one request at a time, so a large pool buys nothing and costs
   * a lot: every warm instance holds its connections open, and many run at once. The default of
   * 10 per instance would exhaust this server's 80 connections after about eight instances —
   * and the limit is shared with another application, so running out would take that down too.
   * Two is enough for one in-flight request plus the occasional overlap, and idle connections
   * are returned quickly so bursts do not leave a residue.
   */
  const pool = {
    connectionString,
    max: Number(process.env['DATABASE_POOL_MAX'] ?? 2),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  };

  return schema ? new PrismaPg(pool, { schema }) : new PrismaPg(pool);
}

function readSchema(connectionString: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    return null;
  }
  const schema = parsed.searchParams.get('schema');
  // `public` is the adapter's own default; naming it changes nothing.
  if (!schema || schema === 'public') return null;
  return /^[A-Za-z_][A-Za-z0-9_$]*$/.test(schema) ? schema : null;
}
