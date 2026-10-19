import { describe, expect, it } from 'vitest';
import { branchesFor, maxStage, REFIT_TABLE, refitModifiers, refitName, switchBranch } from '@/systems/RefitSystem';
import { parseSave } from '@/utils/ProgressStore';
import { ShipClass } from '@/types/ShipClass';

/** 改三甲 / 乙 / 丙 (#86): the last stage takes a direction per class. */
describe('refit branches (#86)', () => {
  const dd = { id: 'fubuki', shipClass: ShipClass.Destroyer };
  const rich = { fuel: 99999, ammo: 99999, steel: 99999, bauxite: 99999 };

  it('every class has two or three directions for its last stage, with different effects', () => {
    for (const cls of Object.values(ShipClass)) {
      const ship = { id: `x_${cls}`, shipClass: cls };
      const list = branchesFor(REFIT_TABLE, ship);
      expect(list.length, cls).toBeGreaterThanOrEqual(2);
      expect(new Set(list.map((b) => b.suffix)).size).toBe(list.length);
    }
    // Ships whose last stage is a special refit keep it, no branches.
    expect(branchesFor(REFIT_TABLE, { id: 'yamato', shipClass: ShipClass.Battleship })).toEqual([]);
  });

  it('a branch replaces the last stage: its name and effects; earlier stages are untouched', () => {
    const last = maxStage(REFIT_TABLE, dd);
    expect(refitName(REFIT_TABLE, '吹雪 (Fubuki)', dd, last, 'asw')).toBe('吹雪改三乙 (Fubuki)');
    expect(refitModifiers(REFIT_TABLE, dd, last, 'asw').depthChargeMul).toBeGreaterThan(refitModifiers(REFIT_TABLE, dd, last).depthChargeMul);
    expect(refitModifiers(REFIT_TABLE, dd, last - 1, 'asw')).toEqual(refitModifiers(REFIT_TABLE, dd, last - 1));
    // An unknown branch reads as the standard stage.
    expect(refitModifiers(REFIT_TABLE, dd, last, 'nope')).toEqual(refitModifiers(REFIT_TABLE, dd, last));
  });

  it('switching direction later costs the stage again; not before the last stage or to the same one', () => {
    const last = maxStage(REFIT_TABLE, dd);
    const left = switchBranch(REFIT_TABLE, dd, last, 'asw', 'fast', rich)!;
    expect(left.steel).toBeLessThan(rich.steel);
    expect(switchBranch(REFIT_TABLE, dd, last, 'asw', 'asw', rich)).toBeNull();
    expect(switchBranch(REFIT_TABLE, dd, last - 1, undefined, 'asw', rich)).toBeNull();
    expect(switchBranch(REFIT_TABLE, dd, last, undefined, 'nope', rich)).toBeNull();
    expect(switchBranch(REFIT_TABLE, dd, last, 'asw', 'standard', rich)).not.toBeNull();
  });

  it('save v17: old saves keep their standard last stage (no branch)', () => {
    const raw = { version: 16, current: 'IJN', record: {}, tutorial: { step: 0, done: true }, nations: { IJN: { ships: ['fubuki'], refits: { fubuki: 3 } } } };
    const np = parseSave(JSON.stringify(raw)).nations.IJN!;
    expect(np.refits.fubuki).toBe(3);
    expect(np.refitBranches).toEqual({});
  });
});
