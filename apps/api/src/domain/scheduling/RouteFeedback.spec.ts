import { describe, expect, it } from 'vitest';
import { buildFeedback, detourRatio } from './RouteFeedback.js';
import { hhmm, proposal, stop, KHALDE, SAIDA, TRIPOLI, MINA, AREA_TRIPOLI } from './fixtures.spec-helpers.js';

const leg = (minutes: number) => ({ minutes });

describe('detourRatio', () => {
  it('is 1.0 when the proposal sits exactly on the existing leg', () => {
    expect(detourRatio({ toProposal: leg(20), fromProposal: leg(30), direct: leg(50) })).toBe(1);
  });

  it('grows as the proposal pulls the team off its route', () => {
    const ratio = detourRatio({ toProposal: leg(40), fromProposal: leg(40), direct: leg(50) });
    expect(ratio).toBeCloseTo(1.6);
  });

  it('REGRESSION: returns null rather than NaN when the two neighbours are the same place', () => {
    // Two flats in one building, or two locality-precision pins sharing a centroid: the direct
    // leg is zero, and (0 + 0) / 0 is NaN. Every downstream comparison against NaN is silently
    // false, so the guard is what keeps this explicit instead of mysteriously absent feedback.
    expect(detourRatio({ toProposal: leg(0), fromProposal: leg(0), direct: leg(0) })).toBeNull();
  });

  it('REGRESSION: returns null rather than Infinity when leaving and returning to one place', () => {
    // Khalde on the way out and Khalde again on the way home: the direct leg is zero but the
    // detour legs are not, so an unguarded ratio is Infinity.
    expect(detourRatio({ toProposal: leg(25), fromProposal: leg(25), direct: leg(0) })).toBeNull();
  });
});

describe('buildFeedback', () => {
  const base = {
    gap: 1,
    stopCount: 2,
    isFinalGap: false,
    detour: 1.1,
    deltaMinutes: 5,
    returnTime: hhmm(18),
    residualSlackMinutes: 60,
    workdayEnd: hhmm(19),
    neighbours: [],
    proposal: proposal({ coordinate: SAIDA }),
  };

  it('always confirms the customer’s availability is satisfied', () => {
    expect(buildFeedback(base).map((f) => f.code)).toContain('FITS_AVAILABILITY');
  });

  it('REGRESSION: never calls the only stop of an empty day a return journey', () => {
    const codes = buildFeedback({
      ...base, gap: 0, stopCount: 0, isFinalGap: true, detour: null,
    }).map((f) => f.code);

    expect(codes).not.toContain('RETURN_JOURNEY');
  });

  it('calls the last gap of a real day a return journey', () => {
    const codes = buildFeedback({ ...base, isFinalGap: true, detour: 1.08 }).map((f) => f.code);
    expect(codes).toContain('RETURN_JOURNEY');
  });

  it('warns when a slot leaves almost no buffer', () => {
    const codes = buildFeedback({ ...base, residualSlackMinutes: 4 }).map((f) => f.code);
    expect(codes).toContain('LITTLE_BUFFER');
  });

  it('warns when the return would be after the workday ends', () => {
    const codes = buildFeedback({ ...base, returnTime: hhmm(19, 40) }).map((f) => f.code);
    expect(codes).toContain('LATE_RETURN');
  });

  it('warns when the detour adds real driving', () => {
    const codes = buildFeedback({ ...base, deltaMinutes: 35, detour: 2.4 }).map((f) => f.code);
    expect(codes).toContain('ADDS_TRAVEL');
    expect(codes).not.toContain('NO_BACKTRACKING');
  });

  it('recognises a neighbour in the same planning area even in a different locality', () => {
    const feedback = buildFeedback({
      ...base,
      neighbours: [
        stop({
          coordinate: TRIPOLI, label: 'Tripoli job',
          planningAreaId: AREA_TRIPOLI, planningAreaName: 'Tripoli Area',
        }),
      ],
      proposal: proposal({
        coordinate: MINA, planningAreaId: AREA_TRIPOLI, planningAreaName: 'Tripoli Area',
      }),
    });

    const already = feedback.find((f) => f.code === 'ALREADY_IN_AREA');
    expect(already).toBeDefined();
    expect(already!.message).toContain('Tripoli Area');
  });

  it('does not claim proximity to an unrelated neighbour far away', () => {
    const codes = buildFeedback({
      ...base,
      neighbours: [stop({ coordinate: TRIPOLI, label: 'Tripoli', planningAreaId: AREA_TRIPOLI, planningAreaName: 'Tripoli Area' })],
      proposal: proposal({ coordinate: KHALDE, planningAreaId: null, planningAreaName: null }),
    }).map((f) => f.code);

    expect(codes).not.toContain('ALREADY_IN_AREA');
  });
});
