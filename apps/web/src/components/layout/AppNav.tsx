'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button, cx } from '@/components/ui/primitives';
import { api } from '@/lib/api/client';

/**
 * Settings and sign-out.
 *
 * Settings is linked because the team must be able to set their OWN depot — every leg of every
 * day is measured from it, so leaving them on whatever we seeded puts that error under their
 * whole schedule. Customers stays unlinked: it is a lookup, not part of the daily job.
 */
export function AppNav() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1">
      <Link
        href="/settings"
        className={cx(
          'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
          pathname.startsWith('/settings')
            ? 'bg-surface-sunken text-ink'
            : 'text-ink-muted hover:text-ink',
        )}
      >
        Settings
      </Link>
      <Button
      variant="ghost"
      onClick={async () => {
        await api.post('/auth/logout').catch(() => undefined);
        router.push('/login');
      }}
    >
        Sign out
      </Button>
    </div>
  );
}
