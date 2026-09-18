import { z } from 'zod';
import { body, route } from '@/server/handler';
import { requireUser } from '@/server/session';
import { services } from '@/server/services';

const schema = z.object({ input: z.string().trim().min(1).max(2000) });

/** One endpoint for every shape a customer's location arrives in. */
export function POST(request: Request) {
  return route(async () => {
    await requireUser();
    const { input } = await body(request, schema);
    return services().locations.resolve(input);
  });
}
