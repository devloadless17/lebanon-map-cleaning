'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Button, Card, Field, Input, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api/client';
import { scheduleApi, type PlanningAreaRow } from '@/features/schedule/api';

const COLOURS = ['indigo', 'sky', 'amber', 'emerald', 'rose', 'violet', 'slate'] as const;

/**
 * Planning areas and the places inside them.
 *
 * This is the team's own vocabulary, not official geography: "Tripoli Area" holding Tripoli,
 * Mina, Anfeh and Koura is an operational grouping, which is why it is editable here rather
 * than baked into the code. Routing never reads these names — it always uses coordinates — but
 * the scheduler sees them, and the engine uses them to say "you're already going to Tripoli Area".
 */
export function AreasSection() {
  const queryClient = useQueryClient();
  const areas = useQuery({ queryKey: ['planning-areas'], queryFn: () => scheduleApi.planningAreas() });
  const [newArea, setNewArea] = useState('');
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['planning-areas'] });
    await queryClient.invalidateQueries({ queryKey: ['localities'] });
  };

  const createArea = useMutation({
    mutationFn: (name: string) =>
      api.post('/planning-areas', {
        name,
        colorToken: COLOURS[(areas.data?.length ?? 0) % COLOURS.length],
      }),
    onSuccess: async () => {
      setNewArea('');
      await refresh();
    },
  });

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">Planning areas</h2>
      <p className="mt-1 text-sm text-ink-muted">
        How the team thinks about the country. Anfeh, Koura and Mina all sitting in “Tripoli
        Area” is what lets the app say <em>“you’re already going to Tripoli Area”</em> when a new
        request comes in nearby.
      </p>

      {areas.isLoading ? (
        <div className="mt-4">
          <Spinner label="Loading areas…" />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {(areas.data ?? []).map((area) => (
            <AreaRow
              key={area.id}
              area={area}
              adding={addingTo === area.id}
              onToggleAdd={() => setAddingTo(addingTo === area.id ? null : area.id)}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <div className="mt-5 flex items-end gap-2 border-t border-line pt-4">
        <Field label="New area">
          <Input
            value={newArea}
            placeholder="e.g. Bekaa"
            onChange={(event) => setNewArea(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && newArea.trim()) createArea.mutate(newArea.trim());
            }}
          />
        </Field>
        <Button
          onClick={() => createArea.mutate(newArea.trim())}
          disabled={!newArea.trim() || createArea.isPending}
        >
          Add area
        </Button>
      </div>
    </Card>
  );
}

function AreaRow({
  area,
  adding,
  onToggleAdd,
  onChanged,
}: {
  area: PlanningAreaRow;
  adding: boolean;
  onToggleAdd: () => void;
  onChanged: () => Promise<void>;
}) {
  const [placeName, setPlaceName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addLocality = useMutation({
    mutationFn: async (name: string) => {
      // Look the place up so the centroid is real. That coordinate is what a vague booking
      // ("just Saida") actually routes to, so a guessed one would quietly skew every estimate.
      const place = await scheduleApi.resolveLocation(name);
      return api.post('/localities', {
        name,
        planningAreaId: area.id,
        centroidLatitude: place.latitude,
        centroidLongitude: place.longitude,
      });
    },
    onSuccess: async () => {
      setPlaceName('');
      setError(null);
      await onChanged();
    },
    onError: (cause: unknown) =>
      setError(cause instanceof Error ? cause.message : 'Could not add that place.'),
  });

  return (
    <div className="rounded-lg border border-line px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{area.name}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {area.localities.length === 0 ? (
              <span className="text-xs text-ink-muted">No places yet</span>
            ) : (
              area.localities.map((locality) => <Badge key={locality.id}>{locality.name}</Badge>)
            )}
          </div>
        </div>
        <Button variant="ghost" onClick={onToggleAdd}>
          {adding ? 'Cancel' : '+ Place'}
        </Button>
      </div>

      {adding ? (
        <div className="mt-3 flex items-end gap-2 border-t border-line pt-3">
          <Field label="Place name" hint="Looked up on the map to store its centre point.">
            <Input
              value={placeName}
              placeholder="e.g. Anfeh"
              autoFocus
              onChange={(event) => setPlaceName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && placeName.trim()) addLocality.mutate(placeName.trim());
              }}
            />
          </Field>
          <Button
            onClick={() => addLocality.mutate(placeName.trim())}
            disabled={!placeName.trim() || addLocality.isPending}
          >
            {addLocality.isPending ? 'Finding…' : 'Add'}
          </Button>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-bad">{error}</p> : null}
    </div>
  );
}
