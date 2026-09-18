'use client';

import type { DayTimeline, Feedback } from '@lebanon/contracts';
import { Spinner } from '@/components/ui/primitives';
import { formatClock, formatKm } from '@/lib/time';

interface Props {
  chosen: number | null;
  feedback: Feedback[];
  timeline: DayTimeline | null;
  loading: boolean;
}

const TONE_STYLE: Record<Feedback['tone'], string> = {
  GOOD: 'text-good',
  WARN: 'text-warn',
  BAD: 'text-bad',
};

const TONE_MARK: Record<Feedback['tone'], string> = {
  GOOD: '✓',
  WARN: '!',
  BAD: '✕',
};

/**
 * What the chosen time does to the day.
 *
 * The team picks the time; this only reports. Nothing here blocks a booking — a tight day is the
 * team's call to make, and they are the ones who know that this customer is five minutes from the
 * last one or that the traffic on that road is nothing like the average. What they cannot see
 * from the phone is the arithmetic, so that is all this supplies.
 */
export function RouteVerdict({ chosen, feedback, timeline, loading }: Props) {
  if (chosen === null) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-center text-xs text-ink-muted">
        Enter a time to check the route.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="py-3 text-center">
        <Spinner label="Checking the route…" />
      </div>
    );
  }

  const totals = timeline?.totals;

  return (
    <div className="space-y-1.5 rounded-lg bg-surface-sunken px-3 py-2.5">
      {totals ? (
        <p className="tabular text-xs text-ink-soft">
          {totals.stops} stops · {formatKm(totals.distanceMetres)} · back{' '}
          {formatClock(totals.returnTime)}
        </p>
      ) : null}

      {feedback.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing to flag on this time.</p>
      ) : (
        <ul className="space-y-1">
          {feedback.map((item) => (
            <li key={item.code + item.message} className={`text-sm ${TONE_STYLE[item.tone]}`}>
              <span aria-hidden="true">{TONE_MARK[item.tone]}</span> {item.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
