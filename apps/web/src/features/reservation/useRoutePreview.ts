'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { PreviewRequest } from '@lebanon/contracts';
import { scheduleApi } from '@/features/schedule/api';
import { isPlaceable, type ReservationDraft } from './draft';

/** Long enough to skip intermediate keystrokes, short enough to feel immediate. */
const DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Asks the server for the whole feasible space ONCE per proposal, not once per interaction.
 *
 * The key deliberately excludes `promisedStart`: choosing a time inside an already-returned band
 * needs no new request, which is what makes picking a slot feel instant rather than merely fast.
 */
export function useRoutePreview(draft: ReservationDraft) {
  const key = useDebounced(
    JSON.stringify({
      appointmentId: draft.appointmentId,
      latitude: draft.latitude,
      longitude: draft.longitude,
      windowStart: draft.windowStart,
      windowEnd: draft.windowEnd,
      duration: draft.serviceDurationMinutes,
      planningAreaId: draft.planningAreaId,
      date: draft.date,
    }),
    DEBOUNCE_MS,
  );

  const ready = isPlaceable(draft);

  return useQuery({
    queryKey: ['preview', key],
    enabled: ready,
    // The map keeps the previous route while the next one loads, instead of flashing empty.
    placeholderData: keepPreviousData,
    queryFn: () => {
      const body: PreviewRequest = {
        proposal: {
          ...(draft.appointmentId ? { appointmentId: draft.appointmentId } : {}),
          coordinate: { latitude: draft.latitude!, longitude: draft.longitude! },
          windowStart: draft.windowStart,
          windowEnd: draft.windowEnd,
          serviceDurationMinutes: draft.serviceDurationMinutes,
          ...(draft.planningAreaId ? { planningAreaId: draft.planningAreaId } : {}),
        },
        overrides: [],
      };
      return scheduleApi.preview(draft.date, body);
    },
  });
}
