import { describe, it, expect } from 'vitest';
import { ShipClass } from '@/types/ShipClass';
import { ALL_MISSIONS_DONE } from '@/systems/RankSystem';
import { buildDock, completeRepairs, dockCount, MAX_DOCKS, nextDock, START_DOCKS, fastRepair, hpFraction, IDockState, isDocked, MIN_REPAIR_MS, MS_PER_HP, repairCost, repairTimeMs, setDamage, startRepair } from '@/systems/DockSystem';

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
    expect(repairCost(500, 0.5)).toEqual({ fuel: 63, ammo: 0, steel: 38, bauxite: 0 });
    expect(repairTimeMs(500, 1)).toBe(0);
  });

  it('repair time depends on the class (#143 / #161 / #176 / #212): light damage at once, 3〜4 minutes for a battleship 大破', () => {
    // 75% HP or more needs no wait (#212).
    expect(repairTimeMs(210, 0.8, 1, ShipClass.Destroyer)).toBe(0);
    expect(repairTimeMs(800, 0.75, 1, ShipClass.Battleship)).toBe(0);
    // Below that, at least half a minute (#275): a destroyer's few seconds looked like an instant finish.
    expect(repairTimeMs(210, 0.74, 1, ShipClass.Destroyer)).toBe(MIN_REPAIR_MS);
    expect(repairTimeMs(210, 0.5, 1, ShipClass.Destroyer) / 1000).toBeLessThanOrEqual(30);
    const bb = repairTimeMs(800, 0.1, 1, ShipClass.Battleship) / 60_000;
    expect(bb).toBeGreaterThanOrEqual(3);
    expect(bb).toBeLessThanOrEqual(4);
    // Bigger classes take longer for the same damage.
    const order = [ShipClass.Destroyer, ShipClass.Cruiser, ShipClass.Carrier, ShipClass.Battleship].map((c) => repairTimeMs(500, 0.3, 1, c));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(repairTimeMs(2000, 0.5, 0.5, ShipClass.Cruiser)).toBe(repairTimeMs(2000, 0.5, 1, ShipClass.Cruiser) / 2);
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

  it('a new base has one dock and builds more with rank and resources, up to eight (#38 #211 #244)', () => {
    const rich = { fuel: 9999, ammo: 9999, steel: 9999, bauxite: 9999 };
    const base = { ...empty(), campaign: [] as string[], merit: 0, resources: rich, rankStats: ALL_MISSIONS_DONE };
    expect(dockCount(base)).toBe(START_DOCKS);
    expect(START_DOCKS).toBe(1);
    expect(nextDock(base)?.state).toBe('rank');
    expect(nextDock(base)?.rankName).toBe('少尉');
    expect(buildDock(base)).toBeNull();
    // The second dock comes early and cheap (#244): 少尉, a few wins in.
    let p = { ...base, merit: 100 };
    expect(nextDock(p)?.state).toBe('ready');
    expect(nextDock(p)?.cost.steel).toBe(150);
    p = buildDock(p)!;
    expect(dockCount(p)).toBe(2);
    expect(p.resources.steel).toBeLessThan(rich.steel);
    expect(nextDock(p)?.rankName).toBe('中尉');
    p = { ...p, merit: 99_999, rankFloor: 13 };
    while (nextDock(p)) p = buildDock(p)!;
    expect(dockCount(p)).toBe(MAX_DOCKS);
    expect(MAX_DOCKS).toBe(8);
    expect(nextDock(p)).toBeNull();
    expect(nextDock({ ...base, merit: 100, resources: { fuel: 0, ammo: 0, steel: 0, bauxite: 0 } })?.state).toBe('resources');
  });
});
