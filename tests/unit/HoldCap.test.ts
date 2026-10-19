import { describe, it, expect } from 'vitest';
import { atHoldCap, gainResources, HOLD_CAP_BASE, HOLD_CAP_PER_LEVEL, lostNote, overflows, resources } from '@/systems/ResourceSystem';
import { holdCap } from '@/systems/FacilitySystem';
import { settleBattle } from '@/systems/ProgressionSystem';
import { emptyProgress, emptySave } from '@/utils/ProgressStore';
import { medalContext } from '@/utils/MedalContext';
import { Nation } from '@/types/Nation';

/** Holding cap (#221): income stops at the cap, facilities raise it, nothing above it is ever taken away. */
describe('holding cap (#221)', () => {
  it('starts at 10,000 (bauxite 5,000) and grows with every base\'s resource facilities', () => {
    expect(holdCap({})).toEqual(HOLD_CAP_BASE);
    const cap = holdCap({ yokosuka: { steelMill: 2, fuelTank: 1 }, kure: { steelMill: 1, airBase: 3 } });
    expect(cap.steel).toBe(HOLD_CAP_BASE.steel + 3 * HOLD_CAP_PER_LEVEL);
    expect(cap.fuel).toBe(HOLD_CAP_BASE.fuel + HOLD_CAP_PER_LEVEL);
    expect(cap.ammo).toBe(HOLD_CAP_BASE.ammo);
    expect(cap.bauxite).toBe(HOLD_CAP_BASE.bauxite + 3 * HOLD_CAP_PER_LEVEL);
  });

  it('stops income at the cap and reports what was lost', () => {
    const cap = holdCap({});
    const g = gainResources(resources({ fuel: 9900, steel: 100 }), resources({ fuel: 300, steel: 300 }), cap);
    expect(g.resources.fuel).toBe(10000);
    expect(g.lost.fuel).toBe(200);
    expect(g.resources.steel).toBe(400);
    expect(g.lost.steel).toBe(0);
    expect(overflows(resources({ fuel: 9900 }), resources({ fuel: 300 }), cap)).toBe(true);
    expect(overflows(resources({ fuel: 9000 }), resources({ fuel: 300 }), cap)).toBe(false);
    expect(lostNote(g.lost)).toBe('  (上限で受け取れず: 燃料 200)');
    expect(lostNote(resources())).toBe('');
  });

  it('never cuts a resource already above the cap', () => {
    const g = gainResources(resources({ steel: 25000 }), resources({ steel: 500 }), holdCap({}));
    expect(g.resources.steel).toBe(25000);
    expect(g.lost.steel).toBe(500);
    // Spending still works from above the cap.
    expect(gainResources(resources({ steel: 25000 }), resources({ steel: -1000 }), holdCap({})).resources.steel).toBe(24000);
  });

  it('caps battle rewards but still pays for lost aircraft', () => {
    const p = { ...emptyProgress(), resources: resources({ fuel: 10000, ammo: 10000, steel: 10000, bauxite: 5000 }) };
    const s = settleBattle(p, { victory: true, enemiesSunk: 2, planesLost: 3, ships: [] });
    expect(s.progress.resources.fuel).toBe(10000);
    expect(s.lost.fuel).toBe(s.reward.fuel);
    // Bauxite: the net of reward and replacement aircraft is what hits the cap.
    expect(s.progress.resources.bauxite).toBe(5000);
    expect(s.lost.bauxite).toBe(s.reward.bauxite - s.aircraftCost.bauxite);
  });

  it('awards the 大備蓄章 when all four resources are full', () => {
    const save = emptySave();
    const np = { ...emptyProgress(), resources: resources({ ...HOLD_CAP_BASE }) };
    const ctx = medalContext({ ...save, nations: { [Nation.IJN]: np } });
    expect(ctx.fullStock).toBe(1);
    expect(ctx.steelCap).toBe(HOLD_CAP_BASE.steel);
    expect(atHoldCap(resources({ ...HOLD_CAP_BASE, ammo: 1 }), holdCap({}))).toBe(false);
  });
});
