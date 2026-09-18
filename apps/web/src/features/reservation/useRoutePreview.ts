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
 * Evaluates the proposal at the time the team chose.
 *
 * `promisedStart` is part of the key. It used to be excluded on purpose: the server returned the
 * whole feasible space at once, so picking a time inside a band it had already sent needed no
 * round trip. Now the time is the question rather than an answer, and each one has to be costed
 * against the day, so the debounce is what keeps typing cheap instead.
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
      promisedStart: draft.promisedStart,
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
          ...(draft.promisedStart !== null ? { promisedStart: draft.promisedStart } : {}),
        },
        overrides: [],
      };
      return scheduleApi.preview(draft.date, body);
    },
  });
}
