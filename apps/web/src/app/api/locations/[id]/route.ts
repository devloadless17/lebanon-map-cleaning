import { createLocationSchema } from '@lebanon/contracts';
import { db, definedOnly } from '@lebanon/core';
import { body, route } from '@/server/handler';
import { requireUser } from '@/server/session';

export function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireUser();
    const { id } = await ctx.params;
    const input = await body(request, createLocationSchema.partial());
    return db().location.update({
      where: { id },
      data: definedOnly(input),
      include: { locality: { include: { planningArea: true } } },
    });
  });
}
