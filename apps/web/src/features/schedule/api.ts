import type {
  DayTimeline,
  LocationPrecision,
  PreviewRequest,
  PreviewResponse,
} from '@lebanon/contracts';
import { api } from '@/lib/api/client';

export interface DayView {
  timeline: DayTimeline;
  estimated: boolean;
}

export interface AppointmentRow {
  id: string;
  date: string;
  promisedStart: number;
  windowStart: number;
  windowEnd: number;
  serviceDurationMinutes: number;
  flexibility: 'HARD' | 'MOVEABLE_WITHIN_WINDOW';
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  customer: { id: string; name: string; phone: string };
  location: {
    id: string;
    addressText: string;
    latitude: string | number;
    longitude: string | number;
    precision: LocationPrecision;
    landmarkNotes: string | null;
    plusCode: string | null;
    locality: { id: string; name: string; planningArea: { id: string; name: string } } | null;
  };
}

export interface PlanningAreaRow {
  id: string;
  name: string;
  colorToken: string;
  localities: Array<{ id: string; name: string }>;
}

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  addressText: string;
  precision: LocationPrecision;
  plusCode: string | null;
  localityId: string | null;
  planningAreaId: string | null;
  source: 'coordinates' | 'maps-link' | 'plus-code' | 'search';
}

export const scheduleApi = {
  day: (date: string) => api.get<DayView>(`/days/${date}`),
  appointments: (date: string) => api.get<AppointmentRow[]>(`/appointments?date=${date}`),
  geometry: (date: string) => api.get<{ encodedPolyline: string | null }>(`/days/${date}/geometry`),
  preview: (date: string, body: PreviewRequest) =>
    api.post<PreviewResponse>(`/days/${date}/preview`, body),
  planningAreas: () => api.get<PlanningAreaRow[]>('/planning-areas'),
  resolveLocation: (input: string) => api.post<ResolvedLocation>('/locations/resolve', { input }),
  reverseLocation: (latitude: number, longitude: number) =>
    api.post<ResolvedLocation>('/locations/reverse', { latitude, longitude }),
};
