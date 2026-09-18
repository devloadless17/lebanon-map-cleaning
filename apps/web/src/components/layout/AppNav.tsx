'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button, cx } from '@/components/ui/primitives';
import { api } from '@/lib/api/client';
import { beirutToday } from '@/lib/time';

/**
 * Only the schedule is linked.
 *
 * Customers and Settings still exist and are still reachable by typing their URL — which is how
 * the depot gets configured during setup — they are simply not advertised, so a client trying
 * the demo sees one screen and one story instead of a settings panel.
 */
const LINKS = [{ href: '/schedule', label: 'Schedule', match: '/schedule' }] as const;

/**
 * One nav for the whole app.
 *
 * Kept deliberately flat — three destinations, no nested menus. A scheduler's job lives almost
 * entirely on one screen; the other two exist to set things up and look things up.
 */
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const href = link.match === '/schedule' ? `/schedule/${beirutToday()}` : link.href;
        const active = pathname.startsWith(link.match);
        return (
          <Link
            key={link.match}
            href={href}
            className={cx(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-surface-sunken text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {link.label}
          </Link>
        );
      })}
      <Button
        variant="ghost"
        className="ml-1"
        onClick={async () => {
          await api.post('/auth/logout').catch(() => undefined);
          router.push('/login');
        }}
      >
        Sign out
      </Button>
    </nav>
  );
}
