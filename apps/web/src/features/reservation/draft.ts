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

/**
 * What the Book button should say.
 *
 * `isSavable` needs a name, a phone, a location AND a time, but the button used to report only
 * the time — so a user who had not typed a name saw a greyed "Pick a time" and no clue what was
 * actually blocking them.
 */
export function bookLabel(draft: ReservationDraft): string {
  if (draft.customerName.trim().length === 0) return 'Add a customer name';
  if (draft.customerPhone.trim().length < 6) return 'Add a phone number';
  if (draft.latitude === null) return 'Set a location';
  if (draft.promisedStart === null) return 'Pick a time';
  const h24 = Math.floor(draft.promisedStart / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minutes = String(draft.promisedStart % 60).padStart(2, '0');
  return `Book ${h12}:${minutes} ${h24 < 12 ? 'AM' : 'PM'}`;
}
