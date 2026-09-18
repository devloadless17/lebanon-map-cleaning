import { z } from 'zod';
import { body, route } from '@/server/handler';
import { requireUser } from '@/server/session';
import { services } from '@/server/services';

const schema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export function POST(request: Request) {
  return route(async () => {
    await requireUser();
    return services().locations.reverse(await body(request, schema));
  });
}
