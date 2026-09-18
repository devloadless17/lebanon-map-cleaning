import { isoDateSchema } from '@lebanon/contracts';
import { ValidationError, createAppointmentSchema } from '@lebanon/core';
import { body, route } from '@/server/handler';
import { requireUser } from '@/server/session';
import { services } from '@/server/services';

export function GET(request: Request) {
  return route(async () => {
    await requireUser();
    const date = new URL(request.url).searchParams.get('date');
    const parsed = isoDateSchema.safeParse(date);
    if (!parsed.success) throw new ValidationError('A date (YYYY-MM-DD) is required.');
    return services().appointments.listForDate(parsed.data);
  });
}

export function POST(request: Request) {
  return route(async () => {
    await requireUser();
    return services().appointments.create(await body(request, createAppointmentSchema));
  });
}
