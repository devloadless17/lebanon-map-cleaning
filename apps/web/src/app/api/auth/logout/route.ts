import { route } from '@/server/handler';
import { clearSession } from '@/server/session';

export function POST() {
  return route(async () => {
    await clearSession();
    return { ok: true };
  });
}
