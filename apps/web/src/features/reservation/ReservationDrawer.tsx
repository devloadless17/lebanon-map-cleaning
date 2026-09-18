'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Field, Input } from '@/components/ui/primitives';
import { TimeInput } from '@/components/ui/TimeInput';
import { api } from '@/lib/api/client';
import { formatClock, parseClock } from '@/lib/time';
import { LocationPicker } from './LocationPicker';
import { TimeBands } from './TimeBands';
import { bookLabel, isSavable, type ReservationDraft } from './draft';
import { useRoutePreview } from './useRoutePreview';

interface Props {
  draft: ReservationDraft;
  onChange: (patch: Partial<ReservationDraft>) => void;
  onClose: () => void;
}

/**
 * Slides over the RAIL, never over the map.
 *
 * That is the whole product thesis: you book while watching what the booking does to the day.
 * A modal over the map would reduce this to an ordinary booking form.
 */
export function ReservationDrawer({ draft, onChange, onClose }: Props) {
  const preview = useRoutePreview(draft);
  const queryClient = useQueryClient();
  const [manualTime, setManualTime] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const locationPayload = {
        addressText: draft.addressText || draft.locationInput || 'Pinned location',
        latitude: draft.latitude,
        longitude: draft.longitude,
        precision: draft.precision,
        localityId: draft.localityId,
        plusCode: draft.plusCode,
        landmarkNotes: draft.landmarkNotes || null,
      };
      const customerPayload = {
        name: draft.customerName.trim(),
        phone: draft.customerPhone.trim(),
      };

      let customerId = draft.customerId;
      if (customerId) {
        await api.patch(`/customers/${customerId}`, customerPayload);
      } else {
        const customer = await api.post<{ id: string }>('/customers', customerPayload);
        customerId = customer.id;
        // Written back into the draft so a retry after a rejected booking REUSES this customer
        // instead of creating another one. Without it, three failed attempts leave three
        // duplicate customers behind.
        onChange({ customerId });
      }

      let locationId = draft.locationId;
      if (locationId) {
        // Previously skipped when editing, which meant moving the pin visibly moved the marker
        // and recomputed every suggested time at the new place — then saved the OLD location.
        // Worse than doing nothing, because the times offered were for somewhere else.
        await api.patch(`/locations/${locationId}`, locationPayload);
      } else {
        const location = await api.post<{ id: string }>('/locations', {
          customerId,
          ...locationPayload,
        });
        locationId = location.id;
        onChange({ locationId });
      }

      if (draft.appointmentId) {
        return api.patch(`/appointments/${draft.appointmentId}`, {
          promisedStart: draft.promisedStart,
          windowStart: draft.windowStart,
          windowEnd: draft.windowEnd,
          serviceDurationMinutes: draft.serviceDurationMinutes,
          date: draft.date,
        });
      }

      return api.post('/appointments', {
        customerId,
        locationId,
        date: draft.date,
        promisedStart: draft.promisedStart,
        windowStart: draft.windowStart,
        windowEnd: draft.windowEnd,
        serviceDurationMinutes: draft.serviceDurationMinutes,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['day'] });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['geometry'] });
      onClose();
    },
    onError: (error: unknown) => {
      setSaveError(error instanceof Error ? error.message : 'We could not save that booking.');
    },
  });

  // Status changes bypass the feasibility check: marking something done or cancelling it is a
  // record of what happened, not a new booking to be validated.
  const status = useMutation({
    mutationFn: (next: 'COMPLETED' | 'CANCELLED') =>
      api.patch(`/appointments/${draft.appointmentId}`, { status: next, force: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['day'] });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['geometry'] });
      onClose();
    },
    onError: (error: unknown) =>
      setSaveError(error instanceof Error ? error.message : 'Could not update that appointment.'),
  });

  const bands = preview.data?.bands ?? [];
  const dayBroken = preview.data ? !preview.data.dayHealth.feasible : false;

  return (
    <div className="animate-in flex h-full flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold">
          {draft.appointmentId ? 'Reschedule' : 'New reservation'}
        </h2>
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </header>

      <div className="scroll-quiet min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {dayBroken ? (
          <p className="rounded-lg bg-warn-soft px-3 py-2.5 text-xs text-warn">
            Heads up: this day already has problems before adding anything.{' '}
            {preview.data?.dayHealth.preExistingViolations[0]?.message}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer">
            <Input
              value={draft.customerName}
              placeholder="Full name"
              onChange={(event) => onChange({ customerName: event.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={draft.customerPhone}
              placeholder="+961 …"
              onChange={(event) => onChange({ customerPhone: event.target.value })}
            />
          </Field>
        </div>

        <LocationPicker draft={draft} onChange={onChange} />

        <div className="grid grid-cols-3 gap-3">
          <Field label="From">
            <TimeInput
              value={draft.windowStart}
              aria-label="Available from"
              onCommit={(minutes) => onChange({ windowStart: minutes, promisedStart: null })}
            />
          </Field>
          <Field label="Until">
            <TimeInput
              value={draft.windowEnd}
              aria-label="Available until"
              onCommit={(minutes) => onChange({ windowEnd: minutes, promisedStart: null })}
            />
          </Field>
          <Field label="Duration">
            <select
              value={draft.serviceDurationMinutes}
              onChange={(event) =>
                onChange({ serviceDurationMinutes: Number(event.target.value), promisedStart: null })
              }
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {[30, 60, 90, 120, 180, 240].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <section className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-ink-soft uppercase">
            When can we come?
          </h3>

          {draft.latitude === null ? (
            <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-xs text-ink-muted">
              Set a location to see which times work.
            </p>
          ) : (
            <TimeBands
              bands={bands}
              bandsRequiringMove={preview.data?.bandsRequiringMove ?? []}
              selected={draft.promisedStart}
              loading={preview.isFetching && !preview.data}
              onPick={(minutes) => {
                onChange({ promisedStart: minutes });
                setManualTime(formatClock(minutes));
              }}
            />
          )}

          {/* The system proposes; the scheduler disposes. An override is evaluated and
              explained, never silently blocked. */}
          <div className="flex items-end gap-2 border-t border-line pt-3">
            <Field label="Or enter any time">
              <Input
                value={manualTime}
                placeholder="16:15"
                onChange={(event) => setManualTime(event.target.value)}
                onBlur={() => {
                  const minutes = parseClock(manualTime);
                  if (minutes !== null) onChange({ promisedStart: minutes });
                }}
              />
            </Field>
          </div>

          {draft.promisedStart !== null && bands.length > 0 &&
          !bands.some((b) => draft.promisedStart! >= b.earliest && draft.promisedStart! <= b.latest) ? (
            <p className="rounded-md bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
              {formatClock(draft.promisedStart)} is outside every workable range. Saving will be
              refused unless the route genuinely allows it.
            </p>
          ) : null}
        </section>

        {saveError ? (
          <p className="rounded-md bg-bad-soft px-2.5 py-2 text-xs text-bad">
            {saveError}
          </p>
        ) : null}

        {draft.appointmentId ? (
          <section className="space-y-2 border-t border-line pt-4">
            <h3 className="text-xs font-medium tracking-wide text-ink-soft uppercase">
              This appointment
            </h3>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={status.isPending}
                onClick={() => status.mutate('COMPLETED')}
              >
                Mark done
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={status.isPending}
                onClick={() => {
                  // Irreversible from the UI's point of view, and it silently reshapes the
                  // rest of the day — worth one deliberate confirmation.
                  if (window.confirm('Cancel this appointment? It will be removed from the route.')) {
                    status.mutate('CANCELLED');
                  }
                }}
              >
                Cancel job
              </Button>
            </div>
            <p className="text-xs text-ink-muted">
              A completed job still occupies its place in the day. A cancelled one is dropped
              from the route entirely.
            </p>
          </section>
        ) : null}
      </div>

      <footer className="flex items-center gap-2 border-t border-line px-5 py-3.5">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!isSavable(draft) || save.isPending}
          onClick={() => {
            setSaveError(null);
            save.mutate();
          }}
        >
          {save.isPending ? 'Saving…' : bookLabel(draft)}
        </Button>
      </footer>
    </div>
  );
}
