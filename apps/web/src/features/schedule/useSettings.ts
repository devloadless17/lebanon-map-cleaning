'use client';

import { useQuery } from '@tanstack/react-query';
import type { DaySettings } from '@lebanon/contracts';
import { api } from '@/lib/api/client';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<DaySettings>('/settings'),
    staleTime: 10 * 60_000,
  });
}
