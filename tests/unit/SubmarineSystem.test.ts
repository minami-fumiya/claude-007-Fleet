import { describe, it, expect } from 'vitest';
import {
  canDive,
  createSubmarineState,
  DIVE_MIN_AIR,
  RECHARGE_RATE,
  speedFactor,
  SUBMERGED_ENDURANCE_SEC,
  SUBMERGED_SPEED_FACTOR,
  updateSubmarine,
} from '@/systems/SubmarineSystem';

describe('SubmarineSystem', () => {
  it('starts surfaced with full air', () => {
    const s = createSubmarineState();
    expect(s).toEqual({ submerged: false, air: 1, forcedSurface: false });
    expect(canDive(s)).toBe(true);
  });

  it('dives on request and drains air while submerged', () => {
    const s = updateSubmarine(createSubmarineState(), SUBMERGED_ENDURANCE_SEC / 2, true);
    expect(s.submerged).toBe(true);
    expect(s.air).toBeCloseTo(0.5);
    expect(speedFactor(s)).toBe(SUBMERGED_SPEED_FACTOR);
  });

  it('forces the boat up when the air runs out', () => {
    const s = updateSubmarine(createSubmarineState(), SUBMERGED_ENDURANCE_SEC + 1, true);
    expect(s.submerged).toBe(false);
    expect(s.forcedSurface).toBe(true);
    expect(canDive(s)).toBe(false);
    expect(speedFactor(s)).toBe(1);
  });

  it('cannot dive again until air reaches the minimum', () => {
    let s = updateSubmarine(createSubmarineState(), SUBMERGED_ENDURANCE_SEC + 1, true);
    const toMin = (DIVE_MIN_AIR * SUBMERGED_ENDURANCE_SEC) / RECHARGE_RATE;
    s = updateSubmarine(s, toMin * 0.5, true);
    expect(s.submerged).toBe(false);
    s = updateSubmarine(s, toMin * 0.6, true);
    expect(s.forcedSurface).toBe(false);
    s = updateSubmarine(s, 0.1, true);
    expect(s.submerged).toBe(true);
  });

  it('recharges on the surface, capped at full', () => {
    let s = updateSubmarine(createSubmarineState(), 10, true);
    s = updateSubmarine(s, 1000, false);
    expect(s.air).toBe(1);
    expect(s.submerged).toBe(false);
  });

  it('does not mutate its input', () => {
    const s = createSubmarineState();
    updateSubmarine(s, 5, true);
    expect(s.air).toBe(1);
  });
});
