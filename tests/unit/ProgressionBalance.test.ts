import { describe, it, expect } from 'vitest';
import { duelRatio, shipDps } from '@/systems/BalanceModel';
import { applyToWeapons, combineModifiers } from '@/systems/CustomizationSystem';
import { researchModifiers, TECH_TREE } from '@/systems/ResearchSystem';
import { maxStage, REFIT_TABLE, refitModifiers, refitShipData, RefitTable } from '@/systems/RefitSystem';
import { IShipModifiers } from '@/types/Modifiers';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { IWeaponData } from '@/types/Weapon';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import weapons from '@/data/weapons/weapons.json';

/**
 * Balance of the progression bonuses (research I–V and 改三 / special refits, see docs/specs/systems/refit.md and progression.md):
 * a fully researched, fully remodelled ship must stay within sane bounds of the original and of other nations.
 */

const W = new Map((weapons.weapons as IWeaponData[]).map((w) => [w.id, w]));
const ALL = ([...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships] as IShipData[]).filter((s) => !s.fictional);
const SURFACE = ALL.filter((s) => s.shipClass !== ShipClass.Carrier && s.shipClass !== ShipClass.Submarine);
const BB_TARGET = { shipClass: ShipClass.Battleship, armor: 60 };
const RESEARCH = researchModifiers(TECH_TREE, TECH_TREE.map((n) => n.id));
/** The same table without special refits: every ship gets its class stages. */
const CLASS_ONLY: RefitTable = { classes: REFIT_TABLE.classes };

const loadout = (s: IShipData): IWeaponData[] => s.weapons.map((id) => W.get(id)).filter((w): w is IWeaponData => w !== undefined);

/** Research + remodel stage bonus for a ship. */
function progressionMods(ship: IShipData, stage: number, table: RefitTable = REFIT_TABLE): IShipModifiers {
  return combineModifiers(RESEARCH, refitModifiers(table, ship, stage));
}

/** The ship and loadout as fielded with every research done and the final remodel. */
function maxed(ship: IShipData, table: RefitTable = REFIT_TABLE): { ship: IShipData; loadout: IWeaponData[] } {
  const stage = maxStage(table, ship);
  const m = progressionMods(ship, stage, table);
  const rebuilt = refitShipData(table, ship, stage);
  return {
    ship: { ...rebuilt, hp: Math.round(ship.hp * m.hpMul), armor: ship.armor + m.armorAdd },
    loadout: applyToWeapons(loadout(rebuilt), m),
  };
}

/** Upper (or lower, for "lower is better") bounds on research × any remodel stage. */
const CAPS: Array<{ key: keyof IShipModifiers; max?: number; min?: number }> = [
  { key: 'hpMul', max: 1.65 },
  { key: 'armorAdd', max: 18 },
  { key: 'speedMul', max: 1.22 },
  { key: 'gunPowerMul', max: 1.4 },
  { key: 'gunReloadMul', min: 0.8 },
  { key: 'torpedoPowerMul', max: 1.75 },
  { key: 'visionMul', max: 1.45 },
  { key: 'aaMul', max: 3.4 },
  { key: 'airPowerMul', max: 1.35 },
  { key: 'planesAdd', max: 2 },
  { key: 'rearmMul', min: 0.7 },
  { key: 'sonarMul', max: 1.65 },
  { key: 'depthChargeMul', max: 1.65 },
  { key: 'nightAimMul', min: 0.75 },
  { key: 'nightVisionMul', max: 1.35 },
];

describe('progression balance (research + remodel)', () => {
  it('caps every stat multiplier of a fully researched ship at any remodel stage', () => {
    for (const ship of ALL) {
      for (let stage = 0; stage <= maxStage(REFIT_TABLE, ship); stage++) {
        const m = progressionMods(ship, stage);
        for (const c of CAPS) {
          if (c.max !== undefined) expect(m[c.key], `${ship.id} 改${stage} ${c.key}`).toBeLessThanOrEqual(c.max);
          if (c.min !== undefined) expect(m[c.key], `${ship.id} 改${stage} ${c.key}`).toBeGreaterThanOrEqual(c.min);
        }
        // Gun damage per second × hull: the combined surface-combat gain stays below 2.6×.
        expect((m.gunPowerMul / m.gunReloadMul) * m.hpMul, ship.id).toBeLessThan(2.6);
      }
    }
  });

  it('a maxed ship beats its original, but not by more than about 3.5×', () => {
    for (const ship of SURFACE) {
      const best = maxed(ship);
      const r = duelRatio(best.loadout, best.ship, loadout(ship), ship);
      expect(r, ship.id).toBeLessThan(1);
      expect(r, ship.id).toBeGreaterThan(0.28);
    }
  });

  it('special refits are a flavour, not a power spike: within ±25% of the class 改三', () => {
    for (const [id, stages] of Object.entries(REFIT_TABLE.ships ?? {})) {
      const ship = SURFACE.find((s) => s.id === id);
      // Aviation conversions (伊勢・日向) trade gunfire for an air wing, which this gun duel can't weigh.
      if (!ship || stages.some((st) => st.airWing)) continue;
      const special = maxed(ship);
      const plain = maxed(ship, CLASS_ONLY);
      const r = duelRatio(special.loadout, special.ship, plain.loadout, plain.ship);
      expect(r, id).toBeGreaterThan(0.8);
      expect(r, id).toBeLessThan(1.25);
    }
  });

  it("keeps each nation's maxed flagship battleship within 0.65–1.5 of the others", () => {
    const best = (n: Nation): IShipData =>
      ALL.filter((s) => s.shipClass === ShipClass.Battleship && s.nation === n).sort(
        (a, b) => b.hp * shipDps(loadout(b), BB_TARGET) - a.hp * shipDps(loadout(a), BB_TARGET),
      )[0];
    const nations = [...new Set(ALL.map((s) => s.nation))].filter((n) => ALL.some((s) => s.nation === n && s.shipClass === ShipClass.Battleship));
    for (const a of nations) {
      for (const b of nations) {
        if (a === b) continue;
        const A = maxed(best(a));
        const B = maxed(best(b));
        const r = duelRatio(A.loadout, A.ship, B.loadout, B.ship);
        expect(r, `${A.ship.id} vs ${B.ship.id}`).toBeGreaterThan(0.65);
        expect(r, `${A.ship.id} vs ${B.ship.id}`).toBeLessThan(1.5);
      }
    }
  });

  it('a maxed ship still loses to two unmodified sisters (progression never makes a ship invincible)', () => {
    for (const ship of SURFACE) {
      const best = maxed(ship);
      // Two originals deal twice the damage and soak twice the hull.
      const pair = { ...ship, hp: ship.hp * 2 };
      const r = duelRatio(best.loadout, best.ship, [...loadout(ship), ...loadout(ship)], pair);
      expect(r, ship.id).toBeGreaterThan(1);
    }
  });
});
