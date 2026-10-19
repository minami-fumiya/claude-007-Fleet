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
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';
import weapons from '@/data/weapons/weapons.json';

/** Balance invariants over the ship data (see docs/specs/systems/balance.md). */

const W = new Map((weapons.weapons as IWeaponData[]).map((w) => [w.id, w]));
const EVERY = [...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships, ...fr.ships, ...su.ships, ...rm.ships] as IShipData[];
/** Historical ships, one per class (sister ships share their lead's performance, #85); fictional ones are a research reward and are checked separately. */
const ALL = EVERY.filter((s) => !s.fictional && !s.sisterOf);
/** Fictional battleships; fictional carriers (USSR, Italy) only have to keep the hull order. */
const FICTIONAL = EVERY.filter((s) => s.fictional && s.shipClass === ShipClass.Battleship);
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
    const nations = Object.values(Nation);
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

  it('keeps fictional carriers in the carrier hull band', () => {
    const fictionalCarriers = EVERY.filter((s) => s.fictional && s.shipClass === ShipClass.Carrier);
    expect(fictionalCarriers.length).toBeGreaterThan(0);
    const minBattleship = Math.min(...of(ShipClass.Battleship).map((s) => s.hp));
    const maxCruiser = Math.max(...of(ShipClass.Cruiser).map((s) => s.hp));
    for (const c of fictionalCarriers) {
      expect(c.hp, c.id).toBeLessThan(minBattleship);
      expect(c.hp, c.id).toBeGreaterThan(maxCruiser);
    }
  });

  it('grows stronger with the year within each nation\'s class and type (#85)', () => {
    // A ship ten years or more younger than another of its kind is not weaker (hull × firepower, 10% grace).
    const refArmor: Partial<Record<ShipClass, number>> = { [ShipClass.Battleship]: 55, [ShipClass.Cruiser]: 35, [ShipClass.Destroyer]: 15, [ShipClass.Submarine]: 6 };
    const power = (s: IShipData): number => s.hp * (1 + s.armor / 100) * shipDps(loadout(s), { shipClass: s.shipClass, armor: refArmor[s.shipClass] ?? 30 });
    const dated = ALL.filter((s) => s.year !== undefined && s.shipClass !== ShipClass.Carrier);
    for (const a of dated) {
      for (const b of dated) {
        if (a.nation !== b.nation || a.shipClass !== b.shipClass || a.subtype !== b.subtype || b.year! - a.year! < 10) continue;
        expect(power(b) / power(a), `${b.id} (${b.year}) vs ${a.id} (${a.year})`).toBeGreaterThan(0.9);
      }
    }
  });

  it('makes small ships faster than big ones on average', () => {
    const avg = (cls: ShipClass): number => of(cls).reduce((n, s) => n + s.speed, 0) / of(cls).length;
    expect(avg(ShipClass.Destroyer)).toBeGreaterThan(avg(ShipClass.Cruiser));
    expect(avg(ShipClass.Cruiser)).toBeGreaterThan(avg(ShipClass.Battleship));
  });

  it('makes each fictional battleship a step above its nation\'s best historical one, but not overwhelming', () => {
    for (const f of FICTIONAL) {
      const rivals = of(ShipClass.Battleship).filter((s) => s.nation === f.nation);
      const best = rivals.sort((a, b) => b.hp * shipDps(loadout(b), BB_TARGET) - a.hp * shipDps(loadout(a), BB_TARGET))[0];
      const r = duelRatio(loadout(f), f, loadout(best), best);
      // duelRatio < 1 means the first ship wins.
      expect(r, `${f.id} vs ${best.id}`).toBeLessThan(0.95);
      expect(r, `${f.id} vs ${best.id}`).toBeGreaterThan(0.6);
    }
  });

  it('keeps the fictional battleships even with each other', () => {
    expect(FICTIONAL.length).toBe(5);
    for (const a of FICTIONAL) {
      for (const b of FICTIONAL) {
        if (a === b) continue;
        const r = duelRatio(loadout(a), a, loadout(b), b);
        expect(r, `${a.id} vs ${b.id}`).toBeGreaterThan(0.7);
        expect(r, `${a.id} vs ${b.id}`).toBeLessThan(1.4);
      }
    }
  });
});
