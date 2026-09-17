import type { ReactNode } from 'react';
import { AppNav } from './AppNav';

/** The frame for the non-map pages, which unlike the schedule are ordinary scrolling documents. */
export function PageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-4 border-b border-line bg-surface px-4 py-2.5">
        <span className="text-sm font-semibold tracking-tight">Cleaning Route</span>
        <AppNav />
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {description ? (
              <p className="mt-1 max-w-[60ch] text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
          {actions}
        </div>

        <div className="mt-7 space-y-8">{children}</div>
      </main>
    </div>
  );
}
