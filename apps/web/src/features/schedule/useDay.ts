'use client';

import { useQuery } from '@tanstack/react-query';
import { scheduleApi } from './api';

export function useDay(date: string) {
  return useQuery({
    queryKey: ['day', date],
    queryFn: () => scheduleApi.day(date),
  });
}

export function useAppointments(date: string) {
  return useQuery({
    queryKey: ['appointments', date],
    queryFn: () => scheduleApi.appointments(date),
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

export function usePlanningAreas() {
  return useQuery({
    queryKey: ['planning-areas'],
    queryFn: () => scheduleApi.planningAreas(),
    staleTime: 10 * 60_000,
  });
}
