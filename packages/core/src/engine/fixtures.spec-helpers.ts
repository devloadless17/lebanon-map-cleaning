import type { Coordinate } from '@lebanon/contracts';
import { TravelMatrix } from './TravelMatrix';
import type { DayContext, ProposedStop, ScheduledStop } from './types';

export const BEIRUT: Coordinate = { latitude: 33.8938, longitude: 35.5018 };
export const KHALDE: Coordinate = { latitude: 33.81, longitude: 35.49 };
export const SAIDA: Coordinate = { latitude: 33.5571, longitude: 35.3729 };
export const NABATIEH: Coordinate = { latitude: 33.3789, longitude: 35.4839 };
export const TRIPOLI: Coordinate = { latitude: 34.4367, longitude: 35.8497 };
export const MINA: Coordinate = { latitude: 34.452, longitude: 35.82 };
export const JOUNIEH: Coordinate = { latitude: 33.9808, longitude: 35.6178 };

export const AREA_BEIRUT = 'area-beirut';
export const AREA_SOUTH = 'area-south';
export const AREA_TRIPOLI = 'area-tripoli';

/** Minutes and metres for each ordered pair, mirrored so both directions exist. */
type Row = [Coordinate, Coordinate, number, number];

export function symmetricMatrix(rows: readonly Row[]): TravelMatrix {
  const legs = rows.flatMap(([from, to, minutes, metres]) => [
    { from, to, minutes, metres },
    { from: to, to: from, minutes, metres },
  ]);
  return TravelMatrix.fromLegs(legs);
}

/** Realistic-ish Lebanese driving figures for the scenarios in the brief. */
export const LEBANON_MATRIX = symmetricMatrix([
  [BEIRUT, KHALDE, 20, 15_000],
  [BEIRUT, SAIDA, 50, 45_000],
  [BEIRUT, NABATIEH, 65, 70_000],
  [BEIRUT, TRIPOLI, 80, 85_000],
  [BEIRUT, MINA, 85, 88_000],
  [BEIRUT, JOUNIEH, 25, 20_000],
  [KHALDE, SAIDA, 35, 30_000],
  [KHALDE, NABATIEH, 55, 60_000],
  [KHALDE, TRIPOLI, 95, 100_000],
  [KHALDE, MINA, 100, 103_000],
  [KHALDE, JOUNIEH, 40, 34_000],
  [SAIDA, NABATIEH, 40, 35_000],
  [SAIDA, TRIPOLI, 125, 130_000],
  [SAIDA, MINA, 130, 133_000],
  [SAIDA, JOUNIEH, 70, 64_000],
  // Nabatieh -> Khalde (50) + Khalde -> Beirut (20) = 70 against a 65 direct run, so a second
  // Khalde visit on the way home is barely a detour at all.
  [NABATIEH, KHALDE, 50, 55_000],
  [NABATIEH, TRIPOLI, 140, 150_000],
  [NABATIEH, MINA, 145, 153_000],
  [NABATIEH, JOUNIEH, 85, 88_000],
  [TRIPOLI, MINA, 8, 5_000],
  [TRIPOLI, JOUNIEH, 60, 65_000],
  [MINA, JOUNIEH, 65, 68_000],
]);

export const hhmm = (h: number, m = 0): number => h * 60 + m;

export function context(overrides: Partial<DayContext> = {}): DayContext {
  return {
    date: '2026-09-17',
    depot: BEIRUT,
    depotLabel: 'Beirut',
    workdayStart: hhmm(8),
    workdayEnd: hhmm(19),
    accessBufferMinutes: 0,
    now: null,
    ...overrides,
  };
}

let counter = 0;
export function stop(overrides: Partial<ScheduledStop> & { coordinate: Coordinate }): ScheduledStop {
  counter += 1;
  return {
    appointmentId: `appt-${String(counter).padStart(3, '0')}`,
    label: 'Customer',
    promisedStart: hhmm(10),
    windowStart: hhmm(8),
    windowEnd: hhmm(18),
    serviceDurationMinutes: 120,
    flexibility: 'MOVEABLE_WITHIN_WINDOW',
    planningAreaId: null,
    planningAreaName: null,
    ...overrides,
  };
}

export function proposal(
  overrides: Partial<ProposedStop> & { coordinate: Coordinate },
): ProposedStop {
  return {
    label: 'New customer',
    windowStart: hhmm(8),
    windowEnd: hhmm(18),
    serviceDurationMinutes: 120,
    planningAreaId: null,
    planningAreaName: null,
    ...overrides,
  };
}
