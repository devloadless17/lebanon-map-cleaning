'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { scheduleApi } from './api';

export function useDay(date: string) {
  return useQuery({
    queryKey: ['day', date],
    queryFn: () => scheduleApi.day(date),
    // Without this, stepping to the next day empties the rail to a spinner and collapses the
    // map's stops to just the depot — which refits the view to the whole country and then back
    // again a moment later. Flicking between days looked like the map was malfunctioning.
    placeholderData: keepPreviousData,
  });
}

export function useAppointments(date: string) {
  return useQuery({
    queryKey: ['appointments', date],
    queryFn: () => scheduleApi.appointments(date),
    placeholderData: keepPreviousData,
  });
}

/**
 * Real road geometry, fetched separately from the day itself.
 *
 * Kept apart on purpose: experimenting with times redraws instantly from straight connectors
 * and costs nothing, and only a settled sequence is worth a routing call.
 */
export function useGeometry(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ['geometry', date],
    queryFn: () => scheduleApi.geometry(date),
    enabled,
    staleTime: 5 * 60_000,
  });
}

