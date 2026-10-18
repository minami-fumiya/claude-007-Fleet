import { describe, it, expect } from 'vitest';
import { completeRepairs, DOCK_COUNT, fastRepair, hpFraction, IDockState, isDocked, MS_PER_HP, repairCost, repairTimeMs, setDamage, startRepair } from '@/systems/DockSystem';

const empty = (): IDockState => ({ damage: {}, docks: [] });

describe('DockSystem', () => {
  it('treats unknown ships as undamaged and clears full repairs', () => {
    expect(hpFraction(empty(), 'x')).toBe(1);
    const s = setDamage(empty(), 'x', 0.4);
    expect(hpFraction(s, 'x')).toBe(0.4);
    expect(setDamage(s, 'x', 1).damage).toEqual({});
  });

  it('prices and times repairs by missing HP', () => {
    expect(repairTimeMs(500, 0.5)).toBe(250 * MS_PER_HP);
    expect(repairCost(500, 0.5)).toEqual({ fuel: 50, ammo: 0, steel: 100, bauxite: 0 });
    expect(repairTimeMs(500, 1)).toBe(0);
  });

  it('fills at most DOCK_COUNT docks with damaged ships', () => {
    let s = empty();
    for (const id of ['a', 'b', 'c']) s = setDamage(s, id, 0.5);
    expect(startRepair(s, 'undamaged', 100, 0)).toBeNull();
    s = startRepair(s, 'a', 100, 0)!;
    expect(startRepair(s, 'a', 100, 0)).toBeNull();
    s = startRepair(s, 'b', 100, 0)!;
    expect(s.docks).toHaveLength(DOCK_COUNT);
    expect(startRepair(s, 'c', 100, 0)).toBeNull();
  });

  it('releases finished repairs', () => {
    let s = startRepair(setDamage(empty(), 'a', 0.5), 'a', 100, 0)!;
    const t = repairTimeMs(100, 0.5);
    expect(completeRepairs(s, t - 1)).toBe(s);
    s = completeRepairs(s, t);
    expect(isDocked(s, 'a')).toBe(false);
    expect(hpFraction(s, 'a')).toBe(1);
  });

  it('fast repair finishes a docked ship at once', () => {
    const s = startRepair(setDamage(empty(), 'a', 0.2), 'a', 500, 0)!;
    const done = fastRepair(s, 'a');
    expect(done.docks).toEqual([]);
    expect(hpFraction(done, 'a')).toBe(1);
    expect(fastRepair(empty(), 'a')).toEqual(empty());
  });
});
