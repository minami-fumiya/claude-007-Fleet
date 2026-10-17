import { describe, it, expect } from 'vitest';
import { duelRatio, shipDps } from '@/systems/BalanceModel';
import { IShipData } from '@/types/Ship';
import { IWeaponData } from '@/types/Weapon';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import weapons from '@/data/weapons/weapons.json';

/** Balance invariants over the ship data (see docs/specs/systems/balance.md). */

const W = new Map((weapons.weapons as IWeaponData[]).map((w) => [w.id, w]));
const ALL = [...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships] as IShipData[];
const loadout = (s: IShipData): IWeaponData[] => s.weapons.map((id) => W.get(id)!);
const of = (cls: ShipClass): IShipData[] => ALL.filter((s) => s.shipClass === cls);
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const BB_TARGET = { shipClass: ShipClass.Battleship, armor: 60 };
const DD_TARGET = { shipClass: ShipClass.Destroyer, armor: 15 };

describe('balance', () => {
  it('keeps battleship firepower against battleships within ±25% of the median', () => {
    const dps = of(ShipClass.Battleship).map((s) => shipDps(loadout(s), BB_TARGET));
    const m = median(dps);
    for (const [i, s] of of(ShipClass.Battleship).entries()) {
      expect(dps[i] / m, s.id).toBeGreaterThan(0.75);
      expect(dps[i] / m, s.id).toBeLessThan(1.25);
    }
  });

  it('lets every battleship, cruiser and destroyer fight off destroyers', () => {
    for (const s of [...of(ShipClass.Battleship), ...of(ShipClass.Cruiser), ...of(ShipClass.Destroyer)]) {
      expect(shipDps(loadout(s), DD_TARGET), s.id).toBeGreaterThanOrEqual(20);
    }
  });

  it('keeps each nation flagship battleship duel within 0.7–1.4 of the others', () => {
    const best = (n: Nation): IShipData =>
      of(ShipClass.Battleship)
        .filter((s) => s.nation === n)
        .sort((a, b) => b.hp * shipDps(loadout(b), BB_TARGET) - a.hp * shipDps(loadout(a), BB_TARGET))[0];
    const nations = [Nation.IJN, Nation.USN, Nation.KM, Nation.RN];
    for (const a of nations) {
      for (const b of nations) {
        if (a === b) continue;
        const r = duelRatio(loadout(best(a)), best(a), loadout(best(b)), best(b));
        expect(r, `${best(a).id} vs ${best(b).id}`).toBeGreaterThan(0.7);
        expect(r, `${best(a).id} vs ${best(b).id}`).toBeLessThan(1.4);
      }
    }
  });

  it('orders hull strength by class: battleship > carrier > cruiser > destroyer > submarine', () => {
    const order = [ShipClass.Battleship, ShipClass.Carrier, ShipClass.Cruiser, ShipClass.Destroyer, ShipClass.Submarine];
    for (let i = 0; i < order.length - 1; i++) {
      const weakestBig = Math.min(...of(order[i]).map((s) => s.hp));
      const strongestSmall = Math.max(...of(order[i + 1]).map((s) => s.hp));
      expect(weakestBig, `${order[i]} > ${order[i + 1]}`).toBeGreaterThan(strongestSmall);
    }
  });

  it('makes small ships faster than big ones on average', () => {
    const avg = (cls: ShipClass): number => of(cls).reduce((n, s) => n + s.speed, 0) / of(cls).length;
    expect(avg(ShipClass.Destroyer)).toBeGreaterThan(avg(ShipClass.Cruiser));
    expect(avg(ShipClass.Cruiser)).toBeGreaterThan(avg(ShipClass.Battleship));
  });
});
