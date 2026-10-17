import { FormationSystem } from '@/systems/FormationSystem';
import { Formation } from '@/types/Formation';

const APPROX = (n: number) => expect.closeTo(n, 1);

describe('FormationSystem', () => {
  it('getOffsets(LineAhead) returns 2 slots with zero right offset', () => {
    const offsets = FormationSystem.getOffsets(Formation.LineAhead);
    expect(offsets).toHaveLength(2);
    expect(offsets[0].right).toBe(0);
    expect(offsets[1].right).toBe(0);
  });

  it('getOffsets(DoubleLine) returns slots with non-zero right offsets', () => {
    const offsets = FormationSystem.getOffsets(Formation.DoubleLine);
    expect(offsets).toHaveLength(2);
    expect(offsets[0].right).not.toBe(0);
    expect(offsets[1].right).not.toBe(0);
    expect(offsets[0].right).toBe(-offsets[1].right);
  });

  it('getOffsets(Circle) returns wider right offsets than DoubleLine', () => {
    const dl = FormationSystem.getOffsets(Formation.DoubleLine);
    const circle = FormationSystem.getOffsets(Formation.Circle);
    expect(Math.abs(circle[0].right)).toBeGreaterThan(Math.abs(dl[0].right));
  });

  it('getWorldPositionFromValues: angle=0 (up), slot behind flagship', () => {
    // angle=0 → forward = (0, -1), right = (1, 0)
    // offset {forward: -90, right: 0} → world = (100 + 0*(-90) + 1*0, 200 + (-1)*(-90) + 0*0)
    //                                          = (100, 290)
    const result = FormationSystem.getWorldPositionFromValues(100, 200, 0, { forward: -90, right: 0 });
    expect(result.x).toBeCloseTo(100, 0);
    expect(result.y).toBeCloseTo(290, 0);
  });

  it('getWorldPositionFromValues: angle=90 (right), slot behind flagship', () => {
    // angle=90 → rad = 0 → forward = (1, 0), right = (0, 1)
    // offset {forward: -90, right: 0} → world = (100 + 1*(-90), 200 + 0*(-90)) = (10, 200)
    const result = FormationSystem.getWorldPositionFromValues(100, 200, 90, { forward: -90, right: 0 });
    expect(result.x).toBeCloseTo(10, 0);
    expect(result.y).toBeCloseTo(200, 0);
  });

  it('getWorldPositionFromValues: right offset shifts perpendicular to heading', () => {
    // angle=0 (up): right direction = (1, 0)
    // offset {forward: 0, right: 60} → world = (100 + 1*60, 200 + 0*60) = (160, 200)
    const result = FormationSystem.getWorldPositionFromValues(100, 200, 0, { forward: 0, right: 60 });
    expect(result.x).toBeCloseTo(160, 0);
    expect(result.y).toBeCloseTo(200, 0);
  });
});
