import { describe, it, expect } from 'vitest';
import { FORMATION_ORDER, FORMATION_RULES, formationModifiers, formationUnlocked, usableFormation } from '@/systems/FormationRules';
import { FormationSystem } from '@/systems/FormationSystem';
import { combineModifiers } from '@/systems/CustomizationSystem';
import { Formation } from '@/types/Formation';

describe('FormationRules (#59)', () => {
  it('has six formations, each with a name, summary and slots for an 8-ship fleet', () => {
    expect(FORMATION_ORDER).toHaveLength(6);
    expect(new Set(FORMATION_ORDER).size).toBe(6);
    for (const f of FORMATION_ORDER) {
      expect(FORMATION_RULES[f].ja.length).toBeGreaterThan(0);
      expect(FORMATION_RULES[f].summary.length).toBeGreaterThan(0);
      const slots = FormationSystem.getOffsets(f, 7);
      expect(slots).toHaveLength(7);
      // No two escorts share a slot.
      expect(new Set(slots.map((o) => `${o.forward},${o.right}`)).size).toBe(7);
    }
  });

  it('no formation beats another at everything (each one trades something)', () => {
    const KEYS = ['gunPowerMul', 'torpedoPowerMul', 'aaMul', 'depthChargeMul', 'sonarMul', 'evadeAdd'] as const;
    const value = (f: Formation, k: (typeof KEYS)[number]): number => combineModifiers(formationModifiers(f, false), formationModifiers(f, true))[k];
    for (const a of FORMATION_ORDER) {
      for (const b of FORMATION_ORDER) {
        if (a === b) continue;
        const dominates = KEYS.every((k) => value(a, k) >= value(b, k) - 1e-9);
        expect(dominates, `${a} beats ${b} everywhere`).toBe(false);
      }
    }
  });

  it('circle and vanguard screen the flagship; line abreast and echelon hunt submarines', () => {
    expect(FORMATION_RULES[Formation.Circle].flagshipPriority).toBeLessThan(0);
    expect(FORMATION_RULES[Formation.Vanguard].flagshipPriority).toBeLessThan(0);
    expect(FORMATION_RULES[Formation.Circle].all.aaMul).toBeGreaterThan(1);
    expect(FORMATION_RULES[Formation.LineAbreast].all.depthChargeMul).toBeGreaterThan(FORMATION_RULES[Formation.Echelon].all.depthChargeMul!);
  });

  it('vanguard escorts dodge more than its flagship; the extras add onto the fleet-wide value', () => {
    const escort = combineModifiers(formationModifiers(Formation.Vanguard, false));
    const flag = combineModifiers(formationModifiers(Formation.Vanguard, true));
    expect(escort.evadeAdd).toBeCloseTo(0.12);
    expect(flag.evadeAdd).toBeCloseTo(0.06);
    expect(escort.gunPowerMul).toBeCloseTo(0.85);
    expect(combineModifiers(formationModifiers(Formation.LineAhead, true)).evadeAdd).toBeCloseTo(-0.03);
  });

  it('the vanguard puts escorts ahead of the flagship', () => {
    const slots = FormationSystem.getOffsets(Formation.Vanguard, 3);
    expect(slots.every((o) => o.forward > 0)).toBe(true);
  });

  it('only 単縦陣 at first; one more formation a step as the fleet grows (#345)', () => {
    // Rank indices of the 14-rank table (#36): 少尉 2, 中尉 3, 大尉 4, 少佐 6, 中佐 7.
    const steps: Array<[Formation, number]> = [
      [Formation.LineAhead, 0], [Formation.DoubleLine, 2], [Formation.LineAbreast, 3], [Formation.Circle, 4], [Formation.Echelon, 6], [Formation.Vanguard, 7],
    ];
    for (const [f, rank] of steps) {
      expect(formationUnlocked(f, rank), f).toBe(true);
      if (rank > 0) expect(formationUnlocked(f, rank - 1), f).toBe(false);
    }
    expect(usableFormation(Formation.Vanguard, 0)).toBe(Formation.LineAhead);
    expect(usableFormation(Formation.Circle, 0)).toBe(Formation.LineAhead);
    expect(usableFormation(Formation.Circle, 4)).toBe(Formation.Circle);
    expect(usableFormation(undefined, 5)).toBe(Formation.LineAhead);
  });
});
