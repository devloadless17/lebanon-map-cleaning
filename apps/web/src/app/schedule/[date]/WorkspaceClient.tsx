'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Coordinate } from '@lebanon/contracts';
import { AppNav } from '@/components/layout/AppNav';
import { Button, Spinner } from '@/components/ui/primitives';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { MapCanvas, type MapStop } from '@/features/map/MapCanvas';
import { DaySummary } from '@/features/schedule/DaySummary';
import { ScheduleRail } from '@/features/schedule/ScheduleRail';
import { scheduleApi } from '@/features/schedule/api';
import { useAppointments, useDay, useGeometry } from '@/features/schedule/useDay';
import { useSettings } from '@/features/schedule/useSettings';
import { ReservationDrawer } from '@/features/reservation/ReservationDrawer';
import { emptyDraft, type ReservationDraft } from '@/features/reservation/draft';
import { useRoutePreview } from '@/features/reservation/useRoutePreview';
import { beirutToday, formatClock, formatDateLabel, shiftDate } from '@/lib/time';

type MobileTab = 'schedule' | 'map';

export function WorkspaceClient({ date }: { date: string }) {
  const router = useRouter();
  const day = useDay(date);
  const appointments = useAppointments(date);
  const settings = useSettings();
  const geometry = useGeometry(date, (day.data?.timeline.stops.length ?? 0) > 0);

  const [draft, setDraft] = useState<ReservationDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<MobileTab>('schedule');

  const patchDraft = (patch: Partial<ReservationDraft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  // Live preview while a draft is open, so the map shows the proposal in place.
  const preview = useRoutePreview(draft ?? emptyDraft(date, { duration: 120 }));
  const previewTimeline = draft && preview.data?.timeline ? preview.data.timeline : null;

  const timeline = previewTimeline ?? day.data?.timeline ?? null;
  const depot: Coordinate | null = settings.data
    ? { latitude: settings.data.depotLatitude, longitude: settings.data.depotLongitude }
    : null;

  // Memoised so the map only re-renders when the route's SHAPE changes, not on every keystroke.
  const stops: MapStop[] = useMemo(() => {
    const result: MapStop[] = [];
    if (depot && settings.data) {
      result.push({
        id: 'depot',
        sequence: null,
        label: settings.data.depotLabel,
        time: null,
        coordinate: depot,
        kind: 'depot',
      });
    }

    const byId = new Map((appointments.data ?? []).map((a) => [a.id, a]));
    for (const stop of timeline?.stops ?? []) {
      const appointment = stop.appointmentId ? byId.get(stop.appointmentId) : undefined;
      result.push({
        id: stop.appointmentId ?? `stop-${stop.sequence}`,
        sequence: stop.sequence,
        label: stop.label,
        time: formatClock(stop.promisedStart),
        coordinate: stop.coordinate,
        kind: 'stop',
        ...(appointment ? { precision: appointment.location.precision } : {}),
        selected: stop.appointmentId === selectedId,
      });
    }

    if (draft?.latitude != null && draft.longitude != null && draft.promisedStart === null) {
      result.push({
        id: 'proposal',
        sequence: null,
        label: draft.customerName || 'New stop',
        time: null,
        coordinate: { latitude: draft.latitude, longitude: draft.longitude },
        kind: 'proposal',
        precision: draft.precision,
      });
    }

    return result;
  }, [timeline, appointments.data, depot, settings.data, selectedId, draft]);

  // Real road geometry only for the SAVED day; a draft redraws with straight connectors, which
  // is instant and costs nothing.
  const polyline = draft ? null : (geometry.data?.encodedPolyline ?? null);

  const handleMapClick = async (coordinate: Coordinate) => {
    if (!draft) return;
    patchDraft({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      precision: 'EXACT',
      promisedStart: null,
    });
    try {
      const place = await scheduleApi.reverseLocation(coordinate.latitude, coordinate.longitude);
      patchDraft({
        addressText: place.addressText,
        localityId: place.localityId,
        planningAreaId: place.planningAreaId,
        plusCode: place.plusCode,
      });
    } catch {
      // A label is cosmetic — the pin the scheduler placed is the truth, so never block on this.
    }
  };

  const startNew = () =>
    setDraft(emptyDraft(date, { duration: settings.data?.defaultServiceMinutes ?? 120 }));

  const startEdit = (appointmentId: string) => {
    const appointment = (appointments.data ?? []).find((a) => a.id === appointmentId);
    if (!appointment) return;
    setDraft({
      ...emptyDraft(date, { duration: appointment.serviceDurationMinutes }),
      appointmentId: appointment.id,
      customerId: appointment.customer.id,
      customerName: appointment.customer.name,
      customerPhone: appointment.customer.phone,
      locationId: appointment.location.id,
      addressText: appointment.location.addressText,
      landmarkNotes: appointment.location.landmarkNotes ?? '',
      latitude: Number(appointment.location.latitude),
      longitude: Number(appointment.location.longitude),
      precision: appointment.location.precision,
      plusCode: appointment.location.plusCode,
      localityId: appointment.location.locality?.id ?? null,
      planningAreaId: appointment.location.locality?.planningArea.id ?? null,
      windowStart: appointment.windowStart,
      windowEnd: appointment.windowEnd,
      serviceDurationMinutes: appointment.serviceDurationMinutes,
      promisedStart: appointment.promisedStart,
    });
  };

  useEffect(() => {
    if (day.error && (day.error as { status?: number }).status === 401) router.push('/login');
  }, [day.error, router]);

  const loading = day.isLoading || settings.isLoading;
  // Surfaced explicitly: an unexplained empty rail is indistinguishable from an empty day.
  const loadError = day.error ?? settings.error;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-4 border-b border-line bg-surface px-4 py-2.5">
        <span className="text-sm font-semibold tracking-tight">Cleaning Route</span>

        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={() => router.push(`/schedule/${shiftDate(date, -1)}`)} aria-label="Previous day">
            ‹
          </Button>
          <span className="tabular min-w-[8.5rem] text-center text-sm font-medium">
            {formatDateLabel(date)}
          </span>
          <Button variant="ghost" onClick={() => router.push(`/schedule/${shiftDate(date, 1)}`)} aria-label="Next day">
            ›
          </Button>
          {date !== beirutToday() ? (
            <Button variant="ghost" onClick={() => router.push(`/schedule/${beirutToday()}`)}>
              Today
            </Button>
          ) : null}
        </div>

        <div className="ml-auto hidden md:block">
          <AppNav />
        </div>

        {/* Below the breakpoint the rail and map become tabs rather than shrinking: a narrow
            map pane cannot answer "where are we going today?" */}
        <div className="ml-auto flex gap-1 md:hidden">
          <Button variant={tab === 'schedule' ? 'secondary' : 'ghost'} onClick={() => setTab('schedule')}>
            Schedule
          </Button>
          <Button variant={tab === 'map' ? 'secondary' : 'ghost'} onClick={() => setTab('map')}>
            Map
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={[
            'flex w-full min-w-0 flex-col border-r border-line bg-canvas md:w-[380px] md:shrink-0',
            tab === 'schedule' ? 'flex' : 'hidden md:flex',
          ].join(' ')}
        >
          {draft ? (
            <ReservationDrawer draft={draft} onChange={patchDraft} onClose={() => setDraft(null)} />
          ) : loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner label="Loading the day…" />
            </div>
          ) : loadError ? (
            <ErrorPanel
              error={loadError}
              onRetry={() => {
                void day.refetch();
                void settings.refetch();
              }}
            />
          ) : timeline ? (
            <>
              <DaySummary timeline={timeline} estimated={day.data?.estimated ?? false} />
              <ScheduleRail
                timeline={timeline}
                appointments={appointments.data ?? []}
                depotLabel={settings.data?.depotLabel ?? 'Depot'}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  if (id) startEdit(id);
                }}
                onNew={startNew}
              />
            </>
          ) : null}
        </aside>

        <main className={['min-w-0 flex-1', tab === 'map' ? 'block' : 'hidden md:block'].join(' ')}>
          <MapCanvas
            stops={stops}
            polyline={polyline}
            className="h-full w-full"
            onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
            {...(draft ? { onMapClick: handleMapClick } : {})}
          />
        </main>
      </div>
    </div>
  );
}
