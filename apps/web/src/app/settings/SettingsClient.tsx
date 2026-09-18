'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { DaySettings } from '@lebanon/contracts';
import { PageShell } from '@/components/layout/PageShell';
import { Button, Card, Field, Input, Spinner } from '@/components/ui/primitives';
import { TimeInput } from '@/components/ui/TimeInput';
import { api } from '@/lib/api/client';
import { DepotPicker } from './DepotPicker';

export function SettingsClient() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<DaySettings>('/settings'),
  });

  const [draft, setDraft] = useState<DaySettings | null>(null);
  useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data);
  }, [settings.data, draft]);

  const save = useMutation({
    mutationFn: (value: DaySettings) => api.patch<DaySettings>('/settings', value),
    onSuccess: async () => {
      // The depot and workday bounds feed every route calculation, so every cached day is stale.
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['day'] });
      await queryClient.invalidateQueries({ queryKey: ['preview'] });
    },
  });

  const patch = (changes: Partial<DaySettings>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current));

  return (
    <PageShell
      title="Settings"
      description="Where the team starts and ends each day, and how long a job takes by default. These feed every route calculation."
    >
      {settings.isLoading || !draft ? (
        <Spinner label="Loading settings…" />
      ) : (
        <>
          <Card className="p-5">
            <h2 className="text-sm font-semibold">The depot</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Every day starts and ends here. Use the team’s actual yard or office, not the city
              centre — the return-time estimate is only as good as this point.
            </p>

            <div className="mt-4">
              <DepotPicker draft={draft} onChange={patch} />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold">The working day</h2>
            <p className="mt-1 text-sm text-ink-muted">
              No slot is ever offered that would need the team out before the start or back after
              the end.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Day starts">
                <TimeInput
                  value={draft.workdayStart}
                  aria-label="Workday start"
                  onCommit={(minutes) => patch({ workdayStart: minutes })}
                />
              </Field>
              <Field label="Day ends">
                <TimeInput
                  value={draft.workdayEnd}
                  aria-label="Workday end"
                  onCommit={(minutes) => patch({ workdayEnd: minutes })}
                />
              </Field>
              <Field label="Default job">
                <select
                  value={draft.defaultServiceMinutes}
                  onChange={(event) =>
                    patch({ defaultServiceMinutes: Number(event.target.value) })
                  }
                  className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  {[30, 60, 90, 120, 180, 240].map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} min` : `${m / 60} h`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Access buffer">
                <select
                  value={draft.accessBufferMinutes}
                  onChange={(event) => patch({ accessBufferMinutes: Number(event.target.value) })}
                  className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  {[0, 5, 10, 15, 20, 30].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              The access buffer is parking, finding the door and getting inside — real time that
              isn’t driving. It’s also what stops a second flat in the same building looking free.
            </p>
          </Card>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              disabled={save.isPending || draft.workdayEnd <= draft.workdayStart}
              onClick={() => save.mutate(draft)}
            >
              {save.isPending ? 'Saving…' : 'Save settings'}
            </Button>
            {draft.workdayEnd <= draft.workdayStart ? (
              <span className="text-sm text-bad">The day has to end after it starts.</span>
            ) : save.isSuccess ? (
              <span className="text-sm text-good">Saved — every day recalculates.</span>
            ) : save.isError ? (
              <span className="text-sm text-bad">
                {save.error instanceof Error ? save.error.message : 'Could not save.'}
              </span>
            ) : null}
          </div>
        </>
      )}
    </PageShell>
  );
}
