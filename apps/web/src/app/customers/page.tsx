'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { LocationPrecision } from '@lebanon/contracts';
import { PageShell } from '@/components/layout/PageShell';
import { Badge, Button, Card, EmptyState, Field, Input, Spinner } from '@/components/ui/primitives';
import { PRECISION_LABEL } from '@/features/reservation/draft';
import { api } from '@/lib/api/client';

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  locations: Array<{
    id: string;
    addressText: string;
    precision: LocationPrecision;
    landmarkNotes: string | null;
    plusCode: string | null;
    locality: { id: string; name: string } | null;
  }>;
}

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const customers = useQuery({
    queryKey: ['customers', search],
    queryFn: () =>
      api.get<CustomerRow[]>(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  });

  return (
    <PageShell
      title="Customers"
      description="Everyone you clean for, and the exact locations on file for each of them."
    >
      <Field label="Search">
        <Input
          value={search}
          placeholder="Name or phone number"
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>

      {customers.isLoading ? (
        <Spinner label="Loading customers…" />
      ) : (customers.data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            title={search ? 'No matches' : 'No customers yet'}
            body={
              search
                ? 'Try part of a name or phone number.'
                : 'Customers are added the first time you book them, from the schedule screen.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {(customers.data ?? []).map((customer) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              editing={editing === customer.id}
              onToggleEdit={() => setEditing(editing === customer.id ? null : customer.id)}
              onSaved={async () => {
                setEditing(null);
                await queryClient.invalidateQueries({ queryKey: ['customers'] });
                // Names show on the route, so the day view is stale too.
                await queryClient.invalidateQueries({ queryKey: ['day'] });
                await queryClient.invalidateQueries({ queryKey: ['appointments'] });
              }}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function CustomerCard({
  customer,
  editing,
  onToggleEdit,
  onSaved,
}: {
  customer: CustomerRow;
  editing: boolean;
  onToggleEdit: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: customer.name,
    phone: customer.phone,
    email: customer.email ?? '',
    notes: customer.notes ?? '',
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/customers/${customer.id}`, {
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim() || null,
        notes: draft.notes.trim() || null,
      }),
    onSuccess: onSaved,
  });

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{customer.name}</p>
          <p className="tabular mt-0.5 text-sm text-ink-soft">{customer.phone}</p>
          {customer.email ? (
            <p className="text-sm text-ink-muted">{customer.email}</p>
          ) : null}
        </div>
        <Button variant="ghost" onClick={onToggleEdit}>
          {editing ? 'Cancel' : 'Edit'}
        </Button>
      </div>

      {customer.notes && !editing ? (
        <p className="mt-2 rounded-md bg-surface-sunken px-2.5 py-1.5 text-xs text-ink-soft">
          {customer.notes}
        </p>
      ) : null}

      {editing ? (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={draft.phone}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Email">
            <Input
              value={draft.email}
              placeholder="optional"
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            />
          </Field>
          <Field label="Notes">
            <Input
              value={draft.notes}
              placeholder="Anything the team should know"
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
          </Field>
          <Button
            variant="primary"
            disabled={save.isPending || !draft.name.trim() || draft.phone.trim().length < 6}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          {save.isError ? (
            <p className="text-xs text-bad">
              {save.error instanceof Error ? save.error.message : 'Could not save.'}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">
          {customer.locations.length === 1 ? 'Location' : 'Locations'}
        </p>
        {customer.locations.length === 0 ? (
          <p className="text-xs text-ink-muted">None on file.</p>
        ) : (
          customer.locations.map((location) => (
            <div key={location.id} className="rounded-md bg-surface-sunken px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm">{location.addressText}</p>
                <Badge tone={location.precision === 'EXACT' ? 'good' : 'warn'}>
                  {PRECISION_LABEL[location.precision]}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                {location.locality?.name ?? 'No area'}
                {location.plusCode ? ` · ${location.plusCode}` : ''}
              </p>
              {location.landmarkNotes ? (
                <p className="mt-1 text-xs text-ink-soft">{location.landmarkNotes}</p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
