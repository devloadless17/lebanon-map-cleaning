import { isoDateSchema, previewRequestSchema } from '@lebanon/contracts';
import { ValidationError } from '@lebanon/core';
import { body, route } from '@/server/handler';
import { requireUser } from '@/server/session';
import { services } from '@/server/services';

/** The "what if" endpoint, and the heart of the product. */
export function POST(request: Request, ctx: { params: Promise<{ date: string }> }) {
  return route(async () => {
    await requireUser();
    const { date } = await ctx.params;
    const parsed = isoDateSchema.safeParse(date);
    if (!parsed.success) throw new ValidationError('Expected a date in YYYY-MM-DD form.');
    return services().scheduling.preview(parsed.data, await body(request, previewRequestSchema));
  });
}
