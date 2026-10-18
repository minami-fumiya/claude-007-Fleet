import { describe, it, expect } from 'vitest';
import { paySortie, settleBattle, sortieBlockers, startingHp } from '@/systems/ProgressionSystem';
import { SUNK_HP_FRACTION } from '@/systems/DockSystem';
import { resources } from '@/systems/ResourceSystem';
import { emptyProgress } from '@/utils/ProgressStore';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';

const bb: IShipData = { id: 'bb', name: '戦艦', nation: Nation.IJN, shipClass: ShipClass.Battleship, hp: 500, armor: 50, speed: 100, weapons: [], spriteKey: 'bb' };

describe('ProgressionSystem', () => {
  it('pays for a sortie and refuses when short', () => {
    const p = { ...emptyProgress(), resources: resources({ fuel: 500, ammo: 500 }) };
    const after = paySortie(p, [bb])!;
    expect(after.resources.fuel).toBeLessThan(p.resources.fuel);
    expect(paySortie({ ...p, resources: resources() }, [bb])).toBeNull();
  });

  it('blocks sorties for docked ships or missing resources', () => {
    const p = { ...emptyProgress(), resources: resources({ fuel: 500, ammo: 500 }) };
    expect(sortieBlockers(p, [bb], 0)).toEqual([]);
    const docked = { ...p, damage: { bb: 0.5 }, docks: [{ shipId: 'bb', endsAt: 1000 }] };
    expect(sortieBlockers(docked, [bb], 0)).toEqual(['戦艦 は入渠中']);
    expect(sortieBlockers(docked, [bb], 1000)).toEqual([]);
    expect(sortieBlockers({ ...p, resources: resources() }, [bb], 0)).toEqual(['資源が不足しています']);
  });

  it('settles rewards, aircraft losses and damage', () => {
    const p = emptyProgress();
    const s = settleBattle(p, {
      victory: true,
      enemiesSunk: 2,
      planesLost: 3,
      ships: [
        { shipId: 'bb', hpFraction: 0.4, sunk: false },
        { shipId: 'dd', hpFraction: 0, sunk: true },
        { shipId: 'ca', hpFraction: 1, sunk: false },
      ],
    });
    expect(s.reward.steel).toBeGreaterThan(0);
    expect(s.aircraftCost.bauxite).toBe(18);
    expect(s.progress.resources.steel).toBe(p.resources.steel + s.reward.steel);
    expect(s.progress.resources.bauxite).toBe(p.resources.bauxite + s.reward.bauxite - 18);
    expect(s.progress.damage).toEqual({ bb: 0.4, dd: SUNK_HP_FRACTION });
  });

  it('starts damaged ships with their remaining HP, never below the sunk floor', () => {
    const p = { ...emptyProgress(), damage: { a: 0.6, b: 0 } };
    expect(startingHp(p, 'a')).toBe(0.6);
    expect(startingHp(p, 'b')).toBe(SUNK_HP_FRACTION);
    expect(startingHp(p, 'c')).toBe(1);
  });
});
