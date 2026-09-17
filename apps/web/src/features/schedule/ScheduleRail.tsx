'use client';

import type { DayTimeline } from '@lebanon/contracts';
import { Badge, Button, EmptyState } from '@/components/ui/primitives';
import { formatClock, formatDuration } from '@/lib/time';
import type { AppointmentRow } from './api';

interface Props {
  timeline: DayTimeline;
  appointments: AppointmentRow[];
  depotLabel: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNew: () => void;
}

/**
 * The day as a vertical journey, depot to depot.
 *
 * Travel time is rendered ON the connector between stops because dead driving time is the thing
 * the business is trying to reduce — it belongs in the timeline, not only in an aggregate.
 */
export function ScheduleRail({
  timeline,
  appointments,
  depotLabel,
  selectedId,
  onSelect,
  onNew,
}: Props) {
  const byId = new Map(appointments.map((a) => [a.id, a]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {timeline.stops.length === 0 ? (
          <EmptyState
            title="No appointments yet"
            body="Add the first booking and the route will appear on the map."
          />
        ) : (
          <ol className="relative">
            <Endpoint label={depotLabel} time={formatClock(timeline.totals.departure)} caption="Leave" />

            {timeline.stops.map((stop) => {
              const appointment = stop.appointmentId ? byId.get(stop.appointmentId) : undefined;
              const selected = stop.appointmentId === selectedId;
              const late = stop.plannedStart > stop.promisedStart;

              return (
                <li key={stop.appointmentId ?? stop.sequence}>
                  <Leg minutes={stop.travelMinutesFromPrevious} wait={stop.waitMinutes} />

                  <button
                    type="button"
                    onClick={() => onSelect(selected ? null : (stop.appointmentId ?? null))}
                    className={[
                      'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                      selected
                        ? 'border-accent bg-accent-soft'
                        : 'border-transparent hover:border-line hover:bg-surface',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                        {stop.sequence}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="tabular text-sm font-semibold">
                            {formatClock(stop.promisedStart)}
                          </span>
                          <span className="truncate text-sm text-ink">{stop.label}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {appointment?.location.locality?.name ?? appointment?.location.addressText ?? '—'}
                          {' · '}
                          {formatDuration(
                            appointment?.serviceDurationMinutes ?? stop.end - stop.plannedStart,
                          )}
                        </p>

                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {appointment?.location.locality ? (
                            <Badge tone="accent">{appointment.location.locality.planningArea.name}</Badge>
                          ) : null}
                          {appointment && appointment.location.precision !== 'EXACT' ? (
                            <Badge tone="warn">Location not confirmed</Badge>
                          ) : null}
                          {late ? (
                            <Badge tone="bad">
                              Arrives {formatClock(stop.plannedStart)}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}

            <Leg
              minutes={
                timeline.totals.returnTime -
                (timeline.stops[timeline.stops.length - 1]?.end ?? timeline.totals.returnTime)
              }
              wait={0}
            />
            <Endpoint
              label={depotLabel}
              time={formatClock(timeline.totals.returnTime)}
              caption="Back"
            />
          </ol>
        )}
      </div>

      <div className="border-t border-line p-4">
        <Button variant="primary" className="w-full" onClick={onNew}>
          + New reservation
        </Button>
      </div>
    </div>
  );
}

function Endpoint({ label, time, caption }: { label: string; time: string; caption: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] text-white">
        ◆
      </span>
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="tabular ml-auto text-xs text-ink-muted">
        {caption} {time}
      </span>
    </div>
  );
}

function Leg({ minutes, wait }: { minutes: number; wait: number }) {
  return (
    <div className="flex items-center gap-3 px-3">
      <span className="flex w-6 justify-center">
        <span className="h-6 w-px bg-line-strong" />
      </span>
      <span className="tabular text-xs text-ink-muted">
        {minutes} min drive
        {wait > 0 ? ` · ${formatDuration(wait)} waiting` : ''}
      </span>
    </div>
  );
}
