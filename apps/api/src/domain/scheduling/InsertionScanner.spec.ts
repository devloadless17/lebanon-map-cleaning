import { describe, expect, it } from 'vitest';
import { InsertionScanner } from './InsertionScanner.js';
import { symmetricMatrix, LEBANON_MATRIX, BEIRUT, KHALDE, SAIDA, NABATIEH, TRIPOLI, MINA,
  AREA_TRIPOLI, context, hhmm, proposal, stop } from './fixtures.spec-helpers.js';
import type { Coordinate } from '@lebanon/contracts';

const scanner = new InsertionScanner();

describe('InsertionScanner — the return-journey scenario from the brief', () => {
  const existing = [
    stop({ coordinate: KHALDE, label: 'Khalde A', promisedStart: hhmm(10), serviceDurationMinutes: 60 }),
    stop({ coordinate: SAIDA, label: 'Saida B', promisedStart: hhmm(12), serviceDurationMinutes: 60 }),
    stop({ coordinate: NABATIEH, label: 'Nabatieh C', promisedStart: hhmm(14), serviceDurationMinutes: 60 }),
  ];

  it('offers a slot in Khalde on the way home, though Khalde was already visited', () => {
    const result = scanner.scan({
      context: context({ workdayEnd: hhmm(20) }),
      stops: existing,
      proposal: proposal({
        coordinate: KHALDE, label: 'Khalde D',
        windowStart: hhmm(16), windowEnd: hhmm(19), serviceDurationMinutes: 120,
      }),
      matrix: LEBANON_MATRIX,
    });

    expect(result.dayFeasible).toBe(true);
    const homeward = result.bands.find((b) => b.position === 'on the way home');
    expect(homeward).toBeDefined();
    expect(homeward!.earliest).toBe(hhmm(16));
    expect(homeward!.feedback.map((f) => f.code)).toContain('RETURN_JOURNEY');
    // Nabatieh->Khalde->Beirut costs barely more than Nabatieh->Beirut.
    expect(homeward!.deltaMinutes).toBeLessThan(10);
  });

  it('does not reject the slot merely because that locality already appears', () => {
    const result = scanner.scan({
      context: context({ workdayEnd: hhmm(20) }),
      stops: existing,
      proposal: proposal({
        coordinate: KHALDE, windowStart: hhmm(16), windowEnd: hhmm(19), serviceDurationMinutes: 120,
      }),
      matrix: LEBANON_MATRIX,
    });

    expect(result.bands.length).toBeGreaterThan(0);
  });
});

describe('InsertionScanner — the upper-bound bug', () => {
  // The review's counter-example. Distinct points so every leg is explicit.
  const D: Coordinate = { latitude: 33.9, longitude: 35.5 };
  const A: Coordinate = { latitude: 33.8, longitude: 35.5 };
  const P: Coordinate = { latitude: 33.7, longitude: 35.5 };
  const B: Coordinate = { latitude: 33.6, longitude: 35.5 };

  const matrix = symmetricMatrix([
    [D, A, 30, 25_000],
    [A, P, 10, 8_000],
    [P, B, 35, 30_000],
    [A, B, 40, 35_000],
    [D, P, 38, 32_000],
    [D, B, 70, 60_000],
  ]);

  it('REGRESSION: refuses a slot that would make an already-confirmed customer late', () => {
    // A runs 09:00-11:00. B is promised 12:00. The proposal needs 90 min plus a 35 min drive
    // to B, so it cannot start later than 09:55 — and it cannot start before 11:10.
    //
    // The intuitive bound ("must start before B's 12:00") would admit 11:10, and the team
    // would reach B at 13:15, seventy-five minutes late.
    const result = scanner.scan({
      context: context({ depot: D, workdayStart: hhmm(8), workdayEnd: hhmm(19) }),
      stops: [
        stop({ coordinate: A, label: 'A', promisedStart: hhmm(9), serviceDurationMinutes: 120, windowEnd: hhmm(19) }),
        stop({ coordinate: B, label: 'B', promisedStart: hhmm(12), serviceDurationMinutes: 120, windowEnd: hhmm(19) }),
      ],
      proposal: proposal({
        coordinate: P, windowStart: hhmm(11), windowEnd: hhmm(13), serviceDurationMinutes: 90,
      }),
      matrix,
    });

    const between = result.bands.find((b) => b.gapIndex === 1);
    expect(between).toBeUndefined();
  });

  it('accepts the same gap once the proposal is short enough to actually fit', () => {
    // 20 min of work: latest start is 12:00 - 20 - 35 = 11:05, earliest is 11:10... still
    // impossible. At 10 minutes' work the latest start becomes 11:15, so it fits.
    const result = scanner.scan({
      context: context({ depot: D, workdayStart: hhmm(8), workdayEnd: hhmm(19) }),
      stops: [
        stop({ coordinate: A, label: 'A', promisedStart: hhmm(9), serviceDurationMinutes: 120, windowEnd: hhmm(19) }),
        stop({ coordinate: B, label: 'B', promisedStart: hhmm(12), serviceDurationMinutes: 120, windowEnd: hhmm(19) }),
      ],
      proposal: proposal({
        coordinate: P, windowStart: hhmm(11), windowEnd: hhmm(13), serviceDurationMinutes: 10,
      }),
      matrix,
    });

    const between = result.bands.find((b) => b.gapIndex === 1);
    expect(between).toBeDefined();
    expect(between!.earliest).toBe(hhmm(11, 10));
    expect(between!.latest).toBe(hhmm(11, 15));
  });
});

describe('InsertionScanner — bounds the naive version forgets', () => {
  it('REGRESSION: will not send the team out before the workday starts', () => {
    const result = scanner.scan({
      context: context({ workdayStart: hhmm(9), workdayEnd: hhmm(20) }),
      stops: [stop({ coordinate: NABATIEH, label: 'N', promisedStart: hhmm(14), serviceDurationMinutes: 60, windowEnd: hhmm(20) })],
      proposal: proposal({
        coordinate: SAIDA, windowStart: hhmm(6), windowEnd: hhmm(13), serviceDurationMinutes: 60,
      }),
      matrix: LEBANON_MATRIX,
    });

    const first = result.bands.find((b) => b.gapIndex === 0);
    // 09:00 start + 50 min to Saida — never earlier, whatever the customer's window says.
    expect(first!.earliest).toBeGreaterThanOrEqual(hhmm(9, 50));
  });

  it('REGRESSION: will not offer a time that has already passed today', () => {
    const result = scanner.scan({
      context: context({ now: hhmm(13), workdayEnd: hhmm(20) }),
      stops: [],
      proposal: proposal({
        coordinate: KHALDE, windowStart: hhmm(8), windowEnd: hhmm(19), serviceDurationMinutes: 60,
      }),
      matrix: LEBANON_MATRIX,
    });

    expect(result.bands[0]!.earliest).toBeGreaterThanOrEqual(hhmm(13, 30));
  });

  it('offers the full morning when the same day is planned in advance', () => {
    const result = scanner.scan({
      context: context({ now: null, workdayEnd: hhmm(20) }),
      stops: [],
      proposal: proposal({
        coordinate: KHALDE, windowStart: hhmm(8), windowEnd: hhmm(19), serviceDurationMinutes: 60,
      }),
      matrix: LEBANON_MATRIX,
    });

    expect(result.bands[0]!.earliest).toBe(hhmm(8, 20));
  });

  it('returns nothing when the window is narrower than the job', () => {
    const result = scanner.scan({
      context: context(),
      stops: [],
      proposal: proposal({
        coordinate: KHALDE, windowStart: hhmm(13), windowEnd: hhmm(14), serviceDurationMinutes: 120,
      }),
      matrix: LEBANON_MATRIX,
    });

    expect(result.bands).toEqual([]);
  });
});

describe('InsertionScanner — degenerate geometry', () => {
  it('REGRESSION: does not label the first stop of an EMPTY day a return journey', () => {
    const result = scanner.scan({
      context: context(),
      stops: [],
      proposal: proposal({ coordinate: SAIDA, windowStart: hhmm(9), windowEnd: hhmm(17), serviceDurationMinutes: 120 }),
      matrix: LEBANON_MATRIX,
    });

    // On an empty day the only gap is ALSO the final gap.
    expect(result.bands).toHaveLength(1);
    expect(result.bands[0]!.feedback.map((f) => f.code)).not.toContain('RETURN_JOURNEY');
    expect(result.bands[0]!.position).toBe('the only stop of the day');
  });

  it('REGRESSION: survives two stops sharing one doorstep (zero direct leg)', () => {
    const run = () =>
      scanner.scan({
        context: context({ workdayEnd: hhmm(21) }),
        stops: [
          stop({ coordinate: TRIPOLI, label: 'Flat 1', promisedStart: hhmm(10), serviceDurationMinutes: 60, windowEnd: hhmm(21) }),
          stop({ coordinate: TRIPOLI, label: 'Flat 2', promisedStart: hhmm(14), serviceDurationMinutes: 60, windowEnd: hhmm(21) }),
        ],
        proposal: proposal({ coordinate: TRIPOLI, windowStart: hhmm(11), windowEnd: hhmm(14), serviceDurationMinutes: 60 }),
        matrix: LEBANON_MATRIX,
      });

    expect(run).not.toThrow();
    const result = run();
    for (const band of result.bands) {
      expect(Number.isFinite(band.deltaMinutes)).toBe(true);
      expect(Number.isFinite(band.deltaMetres)).toBe(true);
    }
  });
});

describe('InsertionScanner — trust', () => {
  it('REGRESSION: reports a day that is already broken rather than answering as if it were fine', () => {
    // B ends at 15:00 and Nabatieh is 40 min further on, so C at 15:00 is already impossible.
    const result = scanner.scan({
      context: context({ workdayEnd: hhmm(21) }),
      stops: [
        stop({ coordinate: SAIDA, label: 'B', promisedStart: hhmm(14), serviceDurationMinutes: 60, windowEnd: hhmm(21) }),
        stop({ coordinate: NABATIEH, label: 'C', promisedStart: hhmm(15), serviceDurationMinutes: 60, windowEnd: hhmm(21) }),
      ],
      proposal: proposal({ coordinate: KHALDE, windowStart: hhmm(8), windowEnd: hhmm(12), serviceDurationMinutes: 60 }),
      matrix: LEBANON_MATRIX,
    });

    expect(result.dayFeasible).toBe(false);
    expect(result.baseline.violations.length).toBeGreaterThan(0);
  });

  it('says "you are already going there" when a neighbour shares the planning area', () => {
    const result = scanner.scan({
      context: context({ workdayEnd: hhmm(21) }),
      stops: [
        stop({
          coordinate: TRIPOLI, label: 'Tripoli job', promisedStart: hhmm(10),
          serviceDurationMinutes: 60, windowEnd: hhmm(21),
          planningAreaId: AREA_TRIPOLI, planningAreaName: 'Tripoli Area',
        }),
      ],
      // Mina is a different locality in the SAME operational area.
      proposal: proposal({
        coordinate: MINA, windowStart: hhmm(11), windowEnd: hhmm(16), serviceDurationMinutes: 60,
        planningAreaId: AREA_TRIPOLI, planningAreaName: 'Tripoli Area',
      }),
      matrix: LEBANON_MATRIX,
    });

    const codes = result.bands.flatMap((b) => b.feedback.map((f) => f.code));
    expect(codes).toContain('ALREADY_IN_AREA');
  });

  it('offers to move one flexible appointment when nothing fits directly', () => {
    const result = scanner.scan({
      context: context({ workdayStart: hhmm(8), workdayEnd: hhmm(20) }),
      stops: [
        stop({
          coordinate: SAIDA, label: 'Mrs Haddad', promisedStart: hhmm(12),
          serviceDurationMinutes: 120, windowStart: hhmm(8), windowEnd: hhmm(18),
          flexibility: 'MOVEABLE_WITHIN_WINDOW',
        }),
      ],
      proposal: proposal({
        coordinate: SAIDA, windowStart: hhmm(11), windowEnd: hhmm(13, 30), serviceDurationMinutes: 120,
      }),
      matrix: LEBANON_MATRIX,
    });

    expect(result.bands).toEqual([]);
    expect(result.bandsRequiringMove.length).toBeGreaterThan(0);
    const offer = result.bandsRequiringMove[0]!;
    expect(offer.move.customerName).toBe('Mrs Haddad');
    expect(offer.move.to).toBeGreaterThan(offer.move.from);
    // The move must stay inside what she actually agreed to.
    expect(offer.move.to + 120).toBeLessThanOrEqual(offer.move.windowEnd);
  });

  it('never offers to move an appointment the customer was held to', () => {
    const result = scanner.scan({
      context: context({ workdayStart: hhmm(8), workdayEnd: hhmm(20) }),
      stops: [
        stop({
          coordinate: SAIDA, label: 'Fixed', promisedStart: hhmm(12),
          serviceDurationMinutes: 120, windowStart: hhmm(8), windowEnd: hhmm(18),
          flexibility: 'HARD',
        }),
      ],
      proposal: proposal({
        coordinate: SAIDA, windowStart: hhmm(11), windowEnd: hhmm(13, 30), serviceDurationMinutes: 120,
      }),
      matrix: LEBANON_MATRIX,
    });

    expect(result.bandsRequiringMove).toEqual([]);
  });
});
