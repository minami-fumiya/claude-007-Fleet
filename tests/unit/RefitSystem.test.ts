import { describe, it, expect } from 'vitest';
import {
  canRefit,
  currentStage,
  maxStage,
  nextStage,
  refit,
  REFIT_TABLE,
  refitModifiers,
  refitName,
  refitShipData,
  refitWeapons,
  RefitShip,
  RefitTable,
  stagesFor,
} from '@/systems/RefitSystem';
import { resources } from '@/systems/ResourceSystem';
import { IShipData } from '@/types/Ship';
import { IShipModifiers, NO_MODIFIERS } from '@/types/Modifiers';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { IWeaponData } from '@/types/Weapon';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import weapons from '@/data/weapons/weapons.json';

const table = REFIT_TABLE;
const rich = resources({ fuel: 9999, ammo: 9999, steel: 9999, bauxite: 9999 });
const SHIPS = [...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships] as IShipData[];
const WEAPON_IDS = new Set((weapons.weapons as IWeaponData[]).map((w) => w.id));
const BB: RefitShip = { id: 'generic_bb', shipClass: ShipClass.Battleship };
const DD: RefitShip = { id: 'generic_dd', shipClass: ShipClass.Destroyer };
const total = (c: Partial<Record<string, number>>): number => Object.values(c).reduce<number>((a, b) => a + (b ?? 0), 0);

/** The flagship-grade ships the sprint promised special refits for. */
const SPECIAL = ['yamato', 'nagato', 'kongo', 'iowa', 'north_carolina', 'bismarck', 'tirpitz', 'hood', 'king_george_v', 'enterprise', 'shokaku', 'akagi', 'prinz_eugen', 'shimakaze', 'yukikaze'];

describe('RefitSystem', () => {
  it('has three stages (改 → 改二 → 改三) for every class', () => {
    for (const c of Object.values(ShipClass)) {
      expect(table.classes[c], c).toHaveLength(3);
      expect(table.classes[c]!.map((s) => s.suffix)).toEqual(['改', '改二', '改三']);
    }
  });

  it('asks for more proficiency and resources at every stage', () => {
    for (const c of Object.values(ShipClass)) {
      const stages = table.classes[c]!;
      for (let i = 1; i < stages.length; i++) {
        expect(stages[i].minProficiency, `${c} ${i}`).toBeGreaterThan(stages[i - 1].minProficiency);
        expect(total(stages[i].cost), `${c} ${i}`).toBeGreaterThan(total(stages[i - 1].cost));
      }
      expect(stages[2].minProficiency).toBeLessThanOrEqual(100);
    }
  });

  it('needs proficiency and resources', () => {
    // Battleships need 40 / 80 / 100 (#305).
    expect(canRefit(table, BB, 0, 39, rich)).toBe(false);
    expect(canRefit(table, BB, 0, 40, rich)).toBe(true);
    expect(canRefit(table, BB, 0, 40, resources())).toBe(false);
    expect(canRefit(table, BB, 1, 70, rich)).toBe(false);
    expect(canRefit(table, BB, 2, 99, rich)).toBe(false);
    expect(canRefit(table, BB, 2, 100, rich)).toBe(true);
    expect(canRefit(table, BB, 3, 100, rich)).toBe(false);
    expect(nextStage(table, BB, 3)).toBeNull();
    expect(maxStage(table, BB)).toBe(3);
  });

  it('pays and advances a stage', () => {
    const r = refit(table, DD, 0, 40, rich)!;
    expect(r.stage).toBe(1);
    expect(r.resources.steel).toBe(9999 - 300);
    expect(refit(table, DD, 0, 10, rich)).toBeNull();
  });

  it('later stages are stronger and replace earlier ones', () => {
    expect(refitModifiers(table, BB, 0).hpMul).toBe(1);
    const s1 = refitModifiers(table, BB, 1);
    const s2 = refitModifiers(table, BB, 2);
    const s3 = refitModifiers(table, BB, 3);
    expect(s2.hpMul).toBeGreaterThan(s1.hpMul);
    expect(s3.hpMul).toBeGreaterThan(s2.hpMul);
    expect(s2.hpMul).toBeCloseTo(1.16);
    expect(s3.hpMul).toBeCloseTo(1.22);
  });

  it('names remodelled ships', () => {
    expect(refitName(table, '大和 (Yamato)', BB, 0)).toBe('大和 (Yamato)');
    expect(refitName(table, '大和 (Yamato)', BB, 2)).toBe('大和改二 (Yamato)');
    expect(refitName(table, '大和 (Yamato)', BB, 3)).toBe('大和改三 (Yamato)');
    expect(refitName(table, '吹雪', DD, 1)).toBe('吹雪改');
  });
});

describe('special refits', () => {
  const t: RefitTable = {
    classes: {
      [ShipClass.Battleship]: [
        { suffix: '改', cost: { steel: 1 }, minProficiency: 0, effects: { hpMul: 1.1 } },
        { suffix: '改二', cost: { steel: 2 }, minProficiency: 0, effects: { hpMul: 1.2 } },
      ],
    },
    ships: {
      ise: [{ stage: 2, suffix: '改二 航', label: '航空戦艦', effects: { aaMul: 2 }, swap: [{ from: 'aft', to: null }, { from: 'sec', to: 'aa' }, { from: 'missing', to: 'x' }], airWing: { fighters: 2, diveBombers: 3, torpedoBombers: 0 } }],
      ghost: [{ stage: 9, label: 'beyond the last stage' }],
    },
  };
  const ise: IShipData = { id: 'ise', name: '伊勢 (Ise)', nation: Nation.IJN, shipClass: ShipClass.Battleship, hp: 100, armor: 10, speed: 100, weapons: ['main', 'aft', 'sec'], spriteKey: 'ise' };

  it('override the class stage for that ship only', () => {
    const stages = stagesFor(t, ise);
    expect(stages[0]).toEqual(t.classes.Battleship![0]);
    expect(stages[1]).toMatchObject({ suffix: '改二 航', label: '航空戦艦', cost: { steel: 2 }, special: true });
    expect(refitModifiers(t, ise, 2)).toEqual({ ...NO_MODIFIERS, aaMul: 2 });
    expect(refitName(t, ise.name, ise, 2)).toBe('伊勢改二 航 (Ise)');
    expect(stagesFor(t, { id: 'other', shipClass: ShipClass.Battleship })[1].special).toBeUndefined();
    // Overrides for stages the class does not have are ignored.
    expect(stagesFor(t, { id: 'ghost', shipClass: ShipClass.Battleship })).toHaveLength(2);
    expect(currentStage(t, ise, 0)).toBeNull();
  });

  it('swap weapons and embark aircraft from their stage on', () => {
    expect(refitWeapons(t, ise, ise.weapons, 1)).toEqual(['main', 'aft', 'sec']);
    expect(refitWeapons(t, ise, ise.weapons, 2)).toEqual(['main', 'aa']);
    expect(refitShipData(t, ise, 0)).toBe(ise);
    expect(refitShipData(t, ise, 1).airWing).toBeUndefined();
    const rebuilt = refitShipData(t, ise, 2);
    expect(rebuilt.weapons).toEqual(['main', 'aa']);
    expect(rebuilt.airWing).toEqual({ fighters: 2, diveBombers: 3, torpedoBombers: 0 });
    expect(ise.weapons).toEqual(['main', 'aft', 'sec']);
  });

  it('exist for the promised flagship-grade ships', () => {
    for (const id of SPECIAL) {
      const ship = SHIPS.find((s) => s.id === id);
      expect(ship, id).toBeDefined();
      expect(stagesFor(table, ship!).some((s) => s.special && s.label), id).toBe(true);
    }
  });

  it('data is valid: real stages, weapons that exist, and a 改三 that costs at least the class 改三', () => {
    const fields = new Set(Object.keys(NO_MODIFIERS));
    for (const [id, overrides] of Object.entries(table.ships ?? {})) {
      const ship = SHIPS.find((s) => s.id === id);
      for (const o of overrides) {
        expect(o.stage, id).toBeGreaterThanOrEqual(1);
        expect(o.stage, id).toBeLessThanOrEqual(3);
        expect(o.label, id).toBeTruthy();
        for (const k of Object.keys(o.effects ?? {})) expect(fields.has(k as keyof IShipModifiers), `${id}.${k}`).toBe(true);
        for (const sw of o.swap ?? []) {
          if (sw.to) expect(WEAPON_IDS.has(sw.to), `${id} → ${sw.to}`).toBe(true);
          // Ships that exist must actually carry the weapon they give up.
          if (ship) expect(ship.weapons, `${id} swaps ${sw.from}`).toContain(sw.from);
        }
        if (ship && o.cost) {
          const base = table.classes[ship.shipClass]![o.stage - 1];
          expect(total(o.cost), id).toBeGreaterThanOrEqual(total(base.cost));
        }
      }
    }
  });

  it('大和改三 trades its secondary battery for AA guns', () => {
    const yamato = SHIPS.find((s) => s.id === 'yamato')!;
    expect(refitShipData(table, yamato, 3).weapons).toEqual(['46cm_main_gun', '12cm_gun']);
    expect(refitShipData(table, yamato, 2).weapons).toEqual(yamato.weapons);
    expect(refitModifiers(table, yamato, 3).aaMul).toBeGreaterThan(refitModifiers(table, BB, 3).aaMul);
  });
});
