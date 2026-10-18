import { describe, it, expect } from 'vitest';
import { buildDock, completeRepairs, dockCount, MAX_DOCKS, nextDock, START_DOCKS, fastRepair, hpFraction, IDockState, isDocked, MS_PER_HP, repairCost, repairTimeMs, setDamage, startRepair } from '@/systems/DockSystem';

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
    expect(repairCost(500, 0.5)).toEqual({ fuel: 63, ammo: 0, steel: 63, bauxite: 0 });
    expect(repairTimeMs(500, 1)).toBe(0);
  });

  it('fills at most the owned docks with damaged ships (#38)', () => {
    let s: IDockState = { ...empty(), docksOwned: 2 };
    for (const id of ['a', 'b', 'c']) s = setDamage(s, id, 0.5);
    expect(startRepair(s, 'undamaged', 100, 0)).toBeNull();
    s = startRepair(s, 'a', 100, 0)!;
    expect(startRepair(s, 'a', 100, 0)).toBeNull();
    s = startRepair(s, 'b', 100, 0)!;
    expect(s.docks).toHaveLength(dockCount(s));
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

  it('a new admiral has one dock and builds more with rank and resources, up to four (#38)', () => {
    const rich = { fuel: 9999, ammo: 9999, steel: 9999, bauxite: 9999 };
    const base = { ...empty(), campaign: [] as string[], merit: 0, resources: rich };
    expect(dockCount(base)).toBe(START_DOCKS);
    expect(nextDock(base)?.state).toBe('rank');
    expect(buildDock(base)).toBeNull();
    let p = { ...base, merit: 100 };
    expect(nextDock(p)?.state).toBe('ready');
    p = buildDock(p)!;
    expect(dockCount(p)).toBe(2);
    expect(p.resources.steel).toBeLessThan(rich.steel);
    expect(nextDock(p)?.rankName).toBe('少佐');
    p = buildDock({ ...p, merit: 900 })!;
    p = buildDock(p)!;
    expect(dockCount(p)).toBe(MAX_DOCKS);
    expect(nextDock(p)).toBeNull();
    expect(nextDock({ ...base, merit: 100, resources: { fuel: 0, ammo: 0, steel: 0, bauxite: 0 } })?.state).toBe('resources');
  });
});
