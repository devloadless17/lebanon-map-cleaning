import { createCustomerSchema } from '@lebanon/contracts';
import { db, definedOnly } from '@lebanon/core';
import { body, route } from '@/server/handler';
import { requireUser } from '@/server/session';

export function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const input = await body(request, createCustomerSchema.partial());
    // Prisma treats an undefined field as "leave alone", but its update types do not declare
    // `| undefined`, so the absent keys are stripped rather than weakening strictness project-wide.
    return db().customer.update({ where: { id }, data: definedOnly(input) });
  });
}
