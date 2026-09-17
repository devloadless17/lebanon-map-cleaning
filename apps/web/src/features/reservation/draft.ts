import type { LocationPrecision } from '@lebanon/contracts';

export interface ReservationDraft {
  /** Set when editing an existing appointment; the original is excluded before scanning. */
  appointmentId: string | null;
  customerId: string | null;
  customerName: string;
  customerPhone: string;

  locationId: string | null;
  locationInput: string;
  addressText: string;
  landmarkNotes: string;
  latitude: number | null;
  longitude: number | null;
  precision: LocationPrecision;
  plusCode: string | null;
  localityId: string | null;
  planningAreaId: string | null;

  date: string;
  windowStart: number;
  windowEnd: number;
  serviceDurationMinutes: number;
  /** null until the scheduler picks a band or types a time. */
  promisedStart: number | null;
}

export function emptyDraft(date: string, defaults: { duration: number }): ReservationDraft {
  return {
    appointmentId: null,
    customerId: null,
    customerName: '',
    customerPhone: '',
    locationId: null,
    locationInput: '',
    addressText: '',
    landmarkNotes: '',
    latitude: null,
    longitude: null,
    precision: 'EXACT',
    plusCode: null,
    localityId: null,
    planningAreaId: null,
    date,
    windowStart: 9 * 60,
    windowEnd: 17 * 60,
    serviceDurationMinutes: defaults.duration,
    promisedStart: null,
  };
}

export function isPlaceable(draft: ReservationDraft): boolean {
  return (
    draft.latitude !== null &&
    draft.longitude !== null &&
    draft.windowEnd > draft.windowStart &&
    draft.serviceDurationMinutes > 0
  );
}

export function isSavable(draft: ReservationDraft): boolean {
  return (
    isPlaceable(draft) &&
    draft.promisedStart !== null &&
    draft.customerName.trim().length > 0 &&
    draft.customerPhone.trim().length >= 6
  );
}

/** Human explanation of how precisely we know where this is. */
export const PRECISION_LABEL: Record<LocationPrecision, string> = {
  LOCALITY: 'Town only — about 3 km',
  SUBLOCALITY: 'Neighbourhood — about 800 m',
  LANDMARK: 'Near a landmark — about 150 m',
  EXACT: 'Exact location',
};
