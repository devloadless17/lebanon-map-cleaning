import { updateAppointmentSchema } from '@lebanon/core';
import { body, route } from '@/server/handler';
import { requireUser } from '@/server/session';
import { services } from '@/server/services';

export function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireUser();
    const { id } = await ctx.params;
    return services().appointments.update(id, await body(request, updateAppointmentSchema));
  });
}

export function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireUser();
    const { id } = await ctx.params;
    return services().appointments.cancel(id);
  });
}
