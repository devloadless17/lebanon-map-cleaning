import { route } from '@/server/handler';
import { requireUser } from '@/server/session';

export function GET() {
  return route(async () => ({ user: await requireUser() }));
}
