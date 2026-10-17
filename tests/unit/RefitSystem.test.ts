import { describe, it, expect } from 'vitest';
import { canRefit, nextStage, refit, refitModifiers, refitName, RefitTable } from '@/systems/RefitSystem';
import { resources } from '@/systems/ResourceSystem';
import { ShipClass } from '@/types/ShipClass';
import refits from '@/data/refits.json';

const table = refits.classes as RefitTable;
const rich = resources({ fuel: 9999, ammo: 9999, steel: 9999, bauxite: 9999 });

describe('RefitSystem', () => {
  it('has two stages for every class', () => {
    for (const c of Object.values(ShipClass)) expect(table[c], c).toHaveLength(2);
  });

  it('needs proficiency and resources', () => {
    expect(canRefit(table, ShipClass.Battleship, 0, 29, rich)).toBe(false);
    expect(canRefit(table, ShipClass.Battleship, 0, 30, rich)).toBe(true);
    expect(canRefit(table, ShipClass.Battleship, 0, 30, resources())).toBe(false);
    expect(canRefit(table, ShipClass.Battleship, 1, 50, rich)).toBe(false);
    expect(canRefit(table, ShipClass.Battleship, 2, 100, rich)).toBe(false);
    expect(nextStage(table, ShipClass.Battleship, 2)).toBeNull();
  });

  it('pays and advances a stage', () => {
    const r = refit(table, ShipClass.Destroyer, 0, 40, rich)!;
    expect(r.stage).toBe(1);
    expect(r.resources.steel).toBe(9999 - 300);
    expect(refit(table, ShipClass.Destroyer, 0, 10, rich)).toBeNull();
  });

  it('later stages are stronger and replace earlier ones', () => {
    expect(refitModifiers(table, ShipClass.Battleship, 0).hpMul).toBe(1);
    const s1 = refitModifiers(table, ShipClass.Battleship, 1);
    const s2 = refitModifiers(table, ShipClass.Battleship, 2);
    expect(s2.hpMul).toBeGreaterThan(s1.hpMul);
    expect(s2.hpMul).toBeCloseTo(1.16);
  });

  it('names remodelled ships', () => {
    expect(refitName(table, '大和 (Yamato)', ShipClass.Battleship, 0)).toBe('大和 (Yamato)');
    expect(refitName(table, '大和 (Yamato)', ShipClass.Battleship, 2)).toBe('大和改二 (Yamato)');
    expect(refitName(table, '吹雪', ShipClass.Destroyer, 1)).toBe('吹雪改');
  });
});
