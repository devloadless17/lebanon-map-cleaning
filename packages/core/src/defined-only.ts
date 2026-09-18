/**
 * Drops keys whose value is `undefined`.
 *
 * Prisma treats an `undefined` field as "leave this alone", but its generated update types do
 * not declare `| undefined`, so under `exactOptionalPropertyTypes` a partial DTO cannot be
 * handed straight to `update`. Stripping the absent keys satisfies the compiler and states the
 * intent — "update exactly the fields the client actually sent" — instead of turning the
 * strictness flag off across the whole project.
 */
export function definedOnly<T extends object>(value: T): { [K in keyof T]-?: Exclude<T[K], undefined> } {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) result[key] = entry;
  }
  return result as { [K in keyof T]-?: Exclude<T[K], undefined> };
}
