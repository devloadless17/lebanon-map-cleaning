'use client';

import type { Band, BandRequiringMove, Feedback } from '@lebanon/contracts';
import { Badge, Spinner } from '@/components/ui/primitives';
import { formatClock, formatDistanceDelta, formatDuration } from '@/lib/time';

interface Props {
  bands: Band[];
  bandsRequiringMove: BandRequiringMove[];
  selected: number | null;
  loading: boolean;
  onPick: (minutes: number) => void;
}

/**
 * Ranges rather than a handful of suggested times.
 *
 * A feasible window of 13:42–13:51 contains no round clock time, so a points-only list would
 * report "no availability" for a slot that genuinely exists — and a scheduler asked "can you do
 * 14:37?" can answer straight from a band without another round trip.
 */
export function TimeBands({ bands, bandsRequiringMove, selected, loading, onPick }: Props) {
  if (loading) {
    return (
      <div className="py-6 text-center">
        <Spinner label="Checking the route…" />
      </div>
    );
  }

  if (bands.length === 0) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-bad-soft px-3 py-2.5 text-sm text-bad">
          No time on this day fits the customer’s availability.
        </p>

        {bandsRequiringMove.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">
              Possible if you move one appointment
            </p>
            {bandsRequiringMove.map((option) => (
              <button
                key={`${option.move.appointmentId}-${option.move.to}`}
                type="button"
                onClick={() => onPick(option.band.recommended)}
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-left hover:border-accent"
              >
                <p className="tabular text-sm font-semibold">
                  {formatClock(option.band.recommended)}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Move {option.move.customerName} {formatClock(option.move.from)} →{' '}
                  {formatClock(option.move.to)} — still inside their{' '}
                  {formatClock(option.move.windowStart)}–{formatClock(option.move.windowEnd)}{' '}
                  availability. One call.
                </p>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bands.map((band) => {
        const isSelected =
          selected !== null && selected >= band.earliest && selected <= band.latest;

        return (
          <button
            key={band.gapIndex}
            type="button"
            onClick={() => onPick(band.recommended)}
            className={[
              'animate-in w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
              isSelected
                ? 'border-accent bg-accent-soft'
                : 'border-line-strong bg-surface hover:border-accent',
            ].join(' ')}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="tabular text-sm font-semibold">
                {band.earliest === band.latest
                  ? formatClock(band.earliest)
                  : `${formatClock(band.earliest)} – ${formatClock(band.latest)}`}
              </span>
              <span className="text-xs text-ink-muted">{band.position}</span>
            </div>

            <p className="tabular mt-1 text-xs text-ink-soft">
              +{formatDistanceDelta(band.deltaMetres)} · +{band.deltaMinutes} min · back{' '}
              {formatClock(band.returnTime)} ·{' '}
              {formatDuration(Math.max(band.residualSlackMinutes, 0))} buffer
            </p>

            <div className="mt-1.5 flex flex-wrap gap-1">
              {band.feedback.map((item) => (
                <FeedbackChip key={item.code} feedback={item} />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FeedbackChip({ feedback }: { feedback: Feedback }) {
  const tone = feedback.tone === 'GOOD' ? 'good' : feedback.tone === 'WARN' ? 'warn' : 'bad';
  const mark = feedback.tone === 'GOOD' ? '✓' : feedback.tone === 'WARN' ? '!' : '✕';
  return (
    <Badge tone={tone}>
      <span aria-hidden>{mark}</span>
      {feedback.message}
    </Badge>
  );
}
