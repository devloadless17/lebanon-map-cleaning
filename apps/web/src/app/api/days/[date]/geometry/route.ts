import { isoDateSchema } from '@lebanon/contracts';
import { ValidationError } from '@lebanon/core';
import { route } from '@/server/handler';
import { requireUser } from '@/server/session';
import { services } from '@/server/services';

export function GET(_request: Request, ctx: { params: Promise<{ date: string }> }) {
  return route(async () => {
    await requireUser();
    const { date } = await ctx.params;
    const parsed = isoDateSchema.safeParse(date);
    if (!parsed.success) throw new ValidationError('Expected a date in YYYY-MM-DD form.');
    return services().scheduling.geometry(parsed.data);
  });
}
