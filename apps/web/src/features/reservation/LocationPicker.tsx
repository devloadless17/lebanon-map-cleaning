'use client';

import { useState } from 'react';
import { Badge, Button, Field, Input, Spinner } from '@/components/ui/primitives';
import { scheduleApi } from '@/features/schedule/api';
import { PRECISION_LABEL, type ReservationDraft } from './draft';

interface Props {
  draft: ReservationDraft;
  onChange: (patch: Partial<ReservationDraft>) => void;
}

/**
 * One field that accepts every shape a location arrives in — a WhatsApp Maps link, "Tripoli,
 * Mina", a Plus Code, or raw coordinates — because customers give whatever detail they have.
 *
 * Every path ends at the same place: a point on the map that the scheduler can drag. The
 * precision badge says out loud how much we actually know, rather than implying a doorstep when
 * all we were told was a town.
 */
export function LocationPicker({ draft, onChange }: Props) {
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async () => {
    const input = draft.locationInput.trim();
    if (!input) return;

    setResolving(true);
    setError(null);
    try {
      const place = await scheduleApi.resolveLocation(input);
      onChange({
        latitude: place.latitude,
        longitude: place.longitude,
        addressText: place.addressText || input,
        precision: place.precision,
        plusCode: place.plusCode,
        localityId: place.localityId,
        planningAreaId: place.planningAreaId,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not find that location.');
    } finally {
      setResolving(false);
    }
  };

  const placed = draft.latitude !== null && draft.longitude !== null;

  return (
    <div className="space-y-3">
      <Field
        label="Location"
        hint="Paste a Google Maps link, type a place, or click the map to drop a pin."
      >
        <div className="flex gap-2">
          <Input
            value={draft.locationInput}
            placeholder="maps.app.goo.gl/… or “Tripoli, Mina”"
            onChange={(event) => onChange({ locationInput: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void resolve();
              }
            }}
          />
          <Button onClick={() => void resolve()} disabled={resolving || !draft.locationInput.trim()}>
            {resolving ? '…' : 'Find'}
          </Button>
        </div>
      </Field>

      {error ? (
        <p className="rounded-md bg-bad-soft px-2.5 py-1.5 text-xs text-bad">
          {error}
        </p>
      ) : null}

      {resolving ? <Spinner label="Looking that up…" /> : null}

      {placed ? (
        <div className="rounded-lg border border-line bg-surface-sunken px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-sm">{draft.addressText || 'Pinned location'}</p>
            <Badge tone={draft.precision === 'EXACT' ? 'good' : 'warn'}>
              {PRECISION_LABEL[draft.precision]}
            </Badge>
          </div>
          <p className="tabular mt-1 text-xs text-ink-muted">
            {draft.latitude!.toFixed(5)}, {draft.longitude!.toFixed(5)}
            {draft.plusCode ? ` · ${draft.plusCode}` : ''}
          </p>
          {draft.precision !== 'EXACT' ? (
            <p className="mt-1.5 text-xs text-warn">
              Click the exact spot on the map to place the pin — the circle shows how much
              we’re guessing until you do.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-center text-xs text-ink-muted">
          Click anywhere on the map to place this customer.
        </p>
      )}

      <Field label="Landmark notes" hint="How the team will actually find the door.">
        <Input
          value={draft.landmarkNotes}
          placeholder="Blue building, entrance behind the pharmacy"
          onChange={(event) => onChange({ landmarkNotes: event.target.value })}
        />
      </Field>
    </div>
  );
}
