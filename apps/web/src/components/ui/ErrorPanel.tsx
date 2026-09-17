'use client';

import { Button } from './primitives';

/**
 * Shown when the day cannot be loaded at all.
 *
 * A silent blank panel is the worst possible failure here: it looks like an empty schedule, so
 * the scheduler cannot tell "nothing is booked today" apart from "the app is broken". Naming
 * the likely cause turns a mystery into a one-line fix.
 */
export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const status = (error as { status?: number } | null)?.status;
  const message = error instanceof Error ? error.message : 'Something went wrong.';

  // A failed fetch (no status) almost always means the API process is not running.
  const unreachable = status === undefined;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-[34ch] text-center">
        <p className="text-sm font-semibold text-ink">
          {unreachable ? 'Can’t reach the server' : 'Couldn’t load this day'}
        </p>
        <p className="mt-1.5 text-sm text-ink-muted">{message}</p>

        {unreachable ? (
          <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2.5 text-left text-xs text-ink-soft">
            The API does not seem to be running. Start everything with:
            <code className="mt-1.5 block font-mono text-ink">npm run dev</code>
          </p>
        ) : null}

        <Button className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}
