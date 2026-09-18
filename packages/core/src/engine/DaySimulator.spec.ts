import { describe, expect, it } from 'vitest';
import { DaySimulator } from './DaySimulator';
import {
  BEIRUT, KHALDE, LEBANON_MATRIX, NABATIEH, SAIDA, TRIPOLI,
  context, hhmm, stop,
} from './fixtures.spec-helpers';

const simulator = new DaySimulator();
const sim = (stops: Parameters<typeof simulator.simulate>[0]['stops'], ctx = context()) =>
  simulator.simulate({ context: ctx, stops, matrix: LEBANON_MATRIX });

describe('DaySimulator — the scenarios from the brief', () => {
  it('runs the simplest possible day: Beirut -> Saida -> Beirut', () => {
    const day = sim([
      stop({ coordinate: SAIDA, label: 'Saida', promisedStart: hhmm(10) }),
    ]);

    expect(day.violations).toEqual([]);
    expect(day.totals.departure).toBe(hhmm(9, 10)); // 10:00 less 50 min of driving
    expect(day.totals.returnTime).toBe(hhmm(12, 50)); // 12:00 finish + 50 min home
    expect(day.totals.drivingMinutes).toBe(100);
    expect(day.totals.serviceMinutes).toBe(120);
  });

  it('crosses several areas in one day', () => {
    const day = sim([
      stop({ coordinate: TRIPOLI, label: 'Tripoli', promisedStart: hhmm(9, 30), serviceDurationMinutes: 90 }),
      stop({ coordinate: SAIDA, label: 'Saida', promisedStart: hhmm(14), serviceDurationMinutes: 90 }),
    ]);

    expect(day.violations).toEqual([]);
    expect(day.stops.map((s) => s.label)).toEqual(['Tripoli', 'Saida']);
  });

  it('ALWAYS evaluates the return to Beirut, not just the outbound legs', () => {
    const day = sim([
      stop({ coordinate: NABATIEH, label: 'Nabatieh', promisedStart: hhmm(16), serviceDurationMinutes: 120 }),
    ]);

    // 16:00 + 2h = 18:00, then 65 min home = 19:05, past the 19:00 finish.
    expect(day.totals.returnTime).toBe(hhmm(19, 5));
    expect(day.violations.map((v) => v.code)).toContain('LATE_RETURN');
  });

  it('allows the SAME locality twice in one day (the return-journey case)', () => {
    // Beirut -> Khalde 10:00 -> Saida 12:00 -> Nabatieh 15:00 -> Khalde 17:00 -> Beirut
    const day = sim(
      [
        stop({ coordinate: KHALDE, label: 'Khalde A', promisedStart: hhmm(10), serviceDurationMinutes: 60 }),
        stop({ coordinate: SAIDA, label: 'Saida', promisedStart: hhmm(12), serviceDurationMinutes: 60 }),
        stop({ coordinate: NABATIEH, label: 'Nabatieh', promisedStart: hhmm(14), serviceDurationMinutes: 60 }),
        stop({ coordinate: KHALDE, label: 'Khalde D', promisedStart: hhmm(16), serviceDurationMinutes: 60, windowEnd: hhmm(19) }),
      ],
      context({ workdayEnd: hhmm(20) }),
    );

    expect(day.violations).toEqual([]);
    expect(day.stops.map((s) => s.label)).toEqual(['Khalde A', 'Saida', 'Nabatieh', 'Khalde D']);
    // Nothing anywhere tracks which places have already been visited.
    expect(day.totals.stops).toBe(4);
  });

  it('detects a schedule that cannot physically work', () => {
    const day = sim([
      stop({ coordinate: SAIDA, label: 'Saida', promisedStart: hhmm(10), serviceDurationMinutes: 60 }),
      // Tripoli is 125 min from Saida; 11:00 + 125 = 13:05, far past 11:30.
      stop({ coordinate: TRIPOLI, label: 'Tripoli', promisedStart: hhmm(11, 30), serviceDurationMinutes: 60 }),
    ]);

    expect(day.violations.map((v) => v.code)).toContain('ARRIVES_LATE');
  });

  it('recalculates when an appointment moves', () => {
    const before = sim([stop({ coordinate: NABATIEH, label: 'N', promisedStart: hhmm(15) })]);
    const after = sim([stop({ coordinate: NABATIEH, label: 'N', promisedStart: hhmm(14) })]);

    expect(after.totals.returnTime).toBe(before.totals.returnTime - 60);
    expect(after.totals.departure).toBe(before.totals.departure - 60);
  });
});

describe('DaySimulator — window enforcement', () => {
  it('flags a visit that would still be running after availability ends', () => {
    const day = sim([
      stop({
        coordinate: SAIDA, label: 'Saida',
        promisedStart: hhmm(16), serviceDurationMinutes: 120,
        windowStart: hhmm(14), windowEnd: hhmm(17),
      }),
    ]);

    expect(day.violations.map((v) => v.code)).toContain('WINDOW_OVERRUN');
  });

  it('REGRESSION: flags a visit that would start before the customer is available', () => {
    // Checking only windowEnd enforces half the rule — the team knocks an hour early and
    // nothing reports it.
    const day = sim([
      stop({
        coordinate: SAIDA, label: 'Saida',
        promisedStart: hhmm(12), serviceDurationMinutes: 120,
        windowStart: hhmm(13), windowEnd: hhmm(17),
      }),
    ]);

    expect(day.violations.map((v) => v.code)).toContain('WINDOW_UNDERRUN');
  });
});

describe('DaySimulator — regressions', () => {
  it('REGRESSION: reports an impossible first stop instead of a departure in the past', () => {
    const day = sim(
      [stop({ coordinate: SAIDA, label: 'Saida', promisedStart: hhmm(8, 15) })],
      context({ workdayStart: hhmm(8) }),
    );

    expect(day.violations.map((v) => v.code)).toContain('IMPOSSIBLE_FIRST_STOP');
    // Clamped to the workday start rather than 07:25.
    expect(day.totals.departure).toBe(hhmm(8));
  });

  it('REGRESSION: never wraps a past-midnight return into the same morning', () => {
    const day = sim(
      [stop({ coordinate: NABATIEH, label: 'Late', promisedStart: hhmm(21), serviceDurationMinutes: 120 })],
      context({ workdayEnd: hhmm(23, 59) }),
    );

    // 21:00 + 2h + 65 min = 00:05 the next day = 1445 minutes, NOT 5.
    expect(day.totals.returnTime).toBe(1445);
    expect(day.totals.returnTime).toBeGreaterThan(1440);
  });

  it('REGRESSION: orders equal promised times deterministically', () => {
    const a = stop({ coordinate: KHALDE, label: 'A', appointmentId: 'appt-zzz', promisedStart: hhmm(10), serviceDurationMinutes: 30 });
    const b = stop({ coordinate: SAIDA, label: 'B', appointmentId: 'appt-aaa', promisedStart: hhmm(10), serviceDurationMinutes: 30 });

    const forwards = sim([a, b]).stops.map((s) => s.appointmentId);
    const backwards = sim([b, a]).stops.map((s) => s.appointmentId);

    expect(forwards).toEqual(backwards);
    expect(forwards).toEqual(['appt-aaa', 'appt-zzz']);
  });

  it('REGRESSION: calls a genuine overlap a double booking, not "arrives late"', () => {
    const day = sim([
      stop({ coordinate: KHALDE, label: 'A', appointmentId: 'appt-a', promisedStart: hhmm(10), serviceDurationMinutes: 120 }),
      stop({ coordinate: SAIDA, label: 'B', appointmentId: 'appt-b', promisedStart: hhmm(11), serviceDurationMinutes: 60 }),
    ]);

    expect(day.violations.map((v) => v.code)).toContain('DOUBLE_BOOKED');
  });

  it('REGRESSION: attributes a cascade to ONE origin rather than blaming every later stop', () => {
    const day = sim([
      stop({ coordinate: KHALDE, label: 'A', promisedStart: hhmm(9), serviceDurationMinutes: 240, windowEnd: hhmm(19) }),
      stop({ coordinate: SAIDA, label: 'B', promisedStart: hhmm(11), serviceDurationMinutes: 60, windowEnd: hhmm(19) }),
      stop({ coordinate: NABATIEH, label: 'C', promisedStart: hhmm(12), serviceDurationMinutes: 60, windowEnd: hhmm(21) }),
    ]);

    const late = day.violations.filter((v) => v.code === 'ARRIVES_LATE');
    expect(late).toHaveLength(1);
    expect(late[0]!.message).toContain('B');
    expect(late[0]!.cascadeMinutes).toBeGreaterThan(0);
  });

  it('handles an empty day without inventing a journey', () => {
    const day = sim([]);

    expect(day.stops).toEqual([]);
    expect(day.totals.stops).toBe(0);
    expect(day.totals.distanceMetres).toBe(0);
    expect(day.violations).toEqual([]);
  });

  it('charges the access buffer even when two stops share one doorstep', () => {
    const day = sim(
      [
        stop({ coordinate: TRIPOLI, label: 'Flat 1', promisedStart: hhmm(10), serviceDurationMinutes: 60 }),
        stop({ coordinate: TRIPOLI, label: 'Flat 2', promisedStart: hhmm(11, 15), serviceDurationMinutes: 60 }),
      ],
      context({ accessBufferMinutes: 10 }),
    );

    expect(day.violations).toEqual([]);
    // Zero travel between the flats, but arriving still costs the buffer.
    expect(day.stops[1]!.travelMinutesFromPrevious).toBe(0);
    expect(day.stops[1]!.arrival).toBe(hhmm(11, 10));
  });

  it('reports waiting time as a first-class number', () => {
    const day = sim([
      stop({ coordinate: KHALDE, label: 'A', promisedStart: hhmm(9), serviceDurationMinutes: 60 }),
      stop({ coordinate: KHALDE, label: 'B', promisedStart: hhmm(13), serviceDurationMinutes: 60 }),
    ]);

    // Finishes A at 10:00, B is not until 13:00 — three hours of dead time, and the scheduler
    // needs to see it.
    expect(day.stops[1]!.waitMinutes).toBe(180);
    expect(day.totals.waitingMinutes).toBe(180);
  });
});
