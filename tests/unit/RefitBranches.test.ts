import { describe, expect, it } from 'vitest';
import { branchesFor, maxStage, REFIT_TABLE, refitModifiers, refitName, stagesFor, switchBranch, switchCost } from '@/systems/RefitSystem';
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
    // Ships whose last stage is a special refit get the directions too (#277).
    expect(branchesFor(REFIT_TABLE, { id: 'yamato', shipClass: ShipClass.Battleship }).length).toBeGreaterThanOrEqual(2);
  });

  it('a special last stage keeps its refit and shifts it by the direction (#277)', () => {
    const yamato = { id: 'yamato', shipClass: ShipClass.Battleship };
    const last = maxStage(REFIT_TABLE, yamato);
    const special = stagesFor(REFIT_TABLE, yamato)[last - 1];
    for (const br of branchesFor(REFIT_TABLE, yamato)) {
      const s = stagesFor(REFIT_TABLE, yamato, br.id)[last - 1];
      expect(s.special).toBe(true);
      expect(s.swap).toEqual(special.swap);
      expect(s.cost).toEqual(special.cost);
      expect(s.suffix).not.toBe(special.suffix);
      expect(s.label).toContain(br.label);
      expect(refitModifiers(REFIT_TABLE, yamato, last, br.id)).not.toEqual(refitModifiers(REFIT_TABLE, yamato, last));
    }
  });

  it('every ship with remodels can choose a direction for its last stage (#277)', () => {
    for (const id of Object.keys(REFIT_TABLE.ships ?? {})) {
      for (const cls of Object.values(ShipClass)) {
        if ((REFIT_TABLE.classes[cls] ?? []).length === 0) continue;
        expect(branchesFor(REFIT_TABLE, { id, shipClass: cls }).length, `${id} ${cls}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('a branch replaces the last stage: its name and effects; earlier stages are untouched', () => {
    const last = maxStage(REFIT_TABLE, dd);
    expect(refitName(REFIT_TABLE, '吹雪 (Fubuki)', dd, last, 'asw')).toBe('吹雪改三乙 (Fubuki)');
    expect(refitModifiers(REFIT_TABLE, dd, last, 'asw').depthChargeMul).toBeGreaterThan(refitModifiers(REFIT_TABLE, dd, last).depthChargeMul);
    expect(refitModifiers(REFIT_TABLE, dd, last - 1, 'asw')).toEqual(refitModifiers(REFIT_TABLE, dd, last - 1));
    // An unknown branch reads as the standard stage.
    expect(refitModifiers(REFIT_TABLE, dd, last, 'nope')).toEqual(refitModifiers(REFIT_TABLE, dd, last));
  });

  it('switching direction later costs half the stage (#265); not before the last stage or to the same one', () => {
    const last = maxStage(REFIT_TABLE, dd);
    const left = switchBranch(REFIT_TABLE, dd, last, 'asw', 'fast', rich)!;
    const full = stagesFor(REFIT_TABLE, dd)[last - 1].cost;
    expect(switchCost(REFIT_TABLE, dd).steel).toBe(Math.ceil((full.steel ?? 0) / 2));
    expect(rich.steel - left.steel).toBe(switchCost(REFIT_TABLE, dd).steel);
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
