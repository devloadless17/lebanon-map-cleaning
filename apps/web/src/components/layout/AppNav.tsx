'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/primitives';
import { api } from '@/lib/api/client';

/**
 * Just the sign-out control.
 *
 * The schedule is the only screen on offer, so a nav item pointing at the page you are already
 * on was pure noise. Customers and Settings still exist and are still reachable by URL — that
 * is how the depot gets configured during setup — they are simply not advertised.
 */
export function AppNav() {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      onClick={async () => {
        await api.post('/auth/logout').catch(() => undefined);
        router.push('/login');
      }}
    >
      Sign out
    </Button>
  );
}
