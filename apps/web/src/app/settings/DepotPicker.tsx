'use client';

import { useMemo, useState } from 'react';
import type { Coordinate, DaySettings } from '@lebanon/contracts';
import { Badge, Button, Field, Input } from '@/components/ui/primitives';
import { MapCanvas, type MapStop } from '@/features/map/MapCanvas';
import { scheduleApi } from '@/features/schedule/api';

interface Props {
  draft: DaySettings;
  onChange: (patch: Partial<DaySettings>) => void;
}

/**
 * Sets the depot the same way a booking sets a customer's address: search, paste a link, or
 * click the map.
 *
 * It used to be two raw latitude/longitude boxes, which in practice means nobody ever changes
 * it — and since every leg of every day is measured from this point, a team left on whatever
 * we seeded is carrying that error through their whole schedule.
 */
export function DepotPicker({ draft, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stops: MapStop[] = useMemo(
    () => [
      {
        id: 'depot',
        sequence: null,
        label: draft.depotLabel || 'Depot',
        time: null,
        coordinate: { latitude: draft.depotLatitude, longitude: draft.depotLongitude },
        kind: 'depot',
      },
    ],
    [draft.depotLabel, draft.depotLatitude, draft.depotLongitude],
  );

  const place = async (coordinate: Coordinate, label?: string) => {
    onChange({ depotLatitude: coordinate.latitude, depotLongitude: coordinate.longitude });
    if (label) onChange({ depotLabel: label });
  };

  const search = async () => {
    const input = query.trim();
    if (!input) return;

    setResolving(true);
    setError(null);
    try {
      const found = await scheduleApi.resolveLocation(input);
      await place({ latitude: found.latitude, longitude: found.longitude }, found.addressText || input);
      setQuery('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not find that place.');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Find your depot" hint="Search a place, paste a Google Maps link, or click the map below.">
        <div className="flex gap-2">
          <Input
            value={query}
            placeholder="e.g. Hamra, Beirut — or a maps.app.goo.gl link"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void search();
              }
            }}
          />
          <Button onClick={() => void search()} disabled={resolving || !query.trim()}>
            {resolving ? '…' : 'Find'}
          </Button>
        </div>
      </Field>

      {error ? (
        <p className="rounded-md bg-bad-soft px-2.5 py-1.5 text-xs text-bad">{error}</p>
      ) : null}

      <div className="h-72 overflow-hidden rounded-lg border border-line">
        <MapCanvas
          stops={stops}
          polyline={null}
          className="h-full w-full"
          // Street level: you are placing one pin, not reading a route.
          focus={{
            coordinate: { latitude: draft.depotLatitude, longitude: draft.depotLongitude },
            zoom: 14,
          }}
          onMapClick={(coordinate) => void place(coordinate)}
        />
      </div>

      <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2.5">
        <div className="min-w-0">
          <Field label="Name this place">
            <Input
              value={draft.depotLabel}
              placeholder="Hamra, Beirut"
              onChange={(event) => onChange({ depotLabel: event.target.value })}
            />
          </Field>
        </div>
        <Badge tone="good">
          {draft.depotLatitude.toFixed(5)}, {draft.depotLongitude.toFixed(5)}
        </Badge>
      </div>
    </div>
  );
}
