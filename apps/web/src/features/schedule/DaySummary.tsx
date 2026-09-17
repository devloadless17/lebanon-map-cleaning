'use client';

import type { DayTimeline } from '@lebanon/contracts';
import { Badge } from '@/components/ui/primitives';
import { formatClock, formatDuration, formatKm } from '@/lib/time';

/**
 * Sits at the TOP of the rail rather than in a bottom bar: it summarises the timeline directly
 * beneath it, and it leaves the map pane uninterrupted.
 */
export function DaySummary({ timeline, estimated }: { timeline: DayTimeline; estimated: boolean }) {
  const { totals, violations } = timeline;
  const worst = violations[0];

  return (
    <div className="border-b border-line px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink">
          {totals.stops === 0
            ? 'Nothing booked'
            : `${totals.stops} ${totals.stops === 1 ? 'stop' : 'stops'}`}
        </p>
        {estimated ? <Badge tone="warn">Estimated distances</Badge> : null}
      </div>

      {totals.stops > 0 ? (
        <>
          <p className="tabular mt-1 text-sm text-ink-soft">
            {formatKm(totals.distanceMetres)} · {formatDuration(totals.drivingMinutes)} driving ·{' '}
            {formatDuration(totals.serviceMinutes)} cleaning
          </p>
          <p className="tabular mt-0.5 text-sm text-ink-soft">
            Leave {formatClock(totals.departure)} · Back {formatClock(totals.returnTime)}
            {totals.waitingMinutes > 0 ? ` · ${formatDuration(totals.waitingMinutes)} waiting` : ''}
          </p>
        </>
      ) : null}

      {worst ? (
        <p className="mt-2 rounded-md bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
          {worst.message}
          {violations.length > 1 ? ` (+${violations.length - 1} more)` : ''}
        </p>
      ) : null}
    </div>
  );
}
