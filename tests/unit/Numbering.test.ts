import { describe, it, expect } from 'vitest';
import {
  AIRCRAFT_TYPE_CODE, CAPTAIN_TYPE_CODE, COMMON_NATION, composeNo, EQUIPMENT_TYPE_CODE, GROUND_WEAPON_TYPE_CODE, formatNo, GROUND_TYPE_CODE, ITEM_TYPE_CODE, NATION_CODE, nextNo, NoCategory,
  parseNo, SHIP_TYPE_CODE, shipTypeCode, WEAPON_TYPE_CODE,
} from '@/systems/Numbering';
import { shipClasses } from '@/systems/ShipOrder';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { CaptainSkill } from '@/types/Captain';
import { AircraftType } from '@/types/Aircraft';
import { WeaponType } from '@/types/Weapon';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';
import captains from '@/data/captains.json';
import aircraft from '@/data/aircraft.json';
import weapons from '@/data/weapons/weapons.json';
import items from '@/data/items.json';
import special from '@/data/special.json';
import superweapons from '@/data/superweapons.json';
import upgrades from '@/data/upgrades.json';
import groundWeapons from '@/data/ground-weapons.json';

const SHIPS = [ijn, usn, km, rn, fr, su, rm].flatMap((f) => f.ships) as unknown as IShipData[];
type Entry = { id: string; no?: number };
/** Every numbered entry with the prefix (category, nation, type) its number must carry. */
const ALL: Array<{ what: string; entry: Entry; category: number; nation: number; type: number }> = [
  ...SHIPS.map((s) => ({ what: 'ship', entry: s, category: NoCategory.Ship, nation: NATION_CODE[s.nation], type: shipTypeCode(s) })),
  ...superweapons.superweapons.map((s) => ({ what: 'superweapon', entry: s, category: NoCategory.Ship, nation: NATION_CODE[s.nation as Nation], type: SHIP_TYPE_CODE.Superweapon })),
  ...captains.captains.map((c) => ({ what: 'captain', entry: c, category: NoCategory.Captain, nation: NATION_CODE[c.nation as Nation], type: CAPTAIN_TYPE_CODE[c.skill as CaptainSkill] })),
  ...aircraft.aircraft.map((a) => ({ what: 'aircraft', entry: a, category: NoCategory.Aircraft, nation: NATION_CODE[a.nation as Nation], type: AIRCRAFT_TYPE_CODE[a.type as AircraftType] })),
  ...[special.convoy, ...special.landTargets].map((g) => ({ what: 'ground', entry: g, category: NoCategory.Ground, nation: COMMON_NATION, type: GROUND_TYPE_CODE[g.id] })),
  ...weapons.weapons.map((w) => ({ what: 'weapon', entry: w, category: NoCategory.Weapon, nation: COMMON_NATION, type: WEAPON_TYPE_CODE[w.type as WeaponType] })),
  ...items.items.map((i) => ({ what: 'item', entry: i, category: NoCategory.Item, nation: COMMON_NATION, type: ITEM_TYPE_CODE })),
  ...groundWeapons.groundWeapons.map((g) => ({ what: 'ground weapon', entry: g, category: NoCategory.Ground, nation: NATION_CODE[g.nation as Nation], type: GROUND_WEAPON_TYPE_CODE[g.kind] })),
  ...(upgrades.upgrades as Array<Entry & { nations?: string[]; dropFrom?: string[] }>).map((u) => ({
    what: 'equipment', entry: u, category: NoCategory.Equipment,
    nation: u.nations?.length ? NATION_CODE[u.nations[0] as Nation] : COMMON_NATION,
    type: u.dropFrom ? EQUIPMENT_TYPE_CODE.part : EQUIPMENT_TYPE_CODE.developed,
  })),
];

describe('通し番号 (#249)', () => {
  it('composes and parses: 艦 · 日本 · 戦艦 · 3rd = 1101003, shown as No.1101003', () => {
    const no = composeNo({ category: NoCategory.Ship, nation: NATION_CODE.IJN, type: SHIP_TYPE_CODE.Battleship, serial: 3 });
    expect(no).toBe(1101003);
    expect(parseNo(no)).toEqual({ category: 1, nation: 1, type: 1, serial: 3 });
    expect(formatNo(no)).toBe('No.1101003');
    expect(formatNo(undefined)).toBe('');
    expect(nextNo(1101000, new Set([1101001, 1101002, 1101004]))).toBe(1101003);
  });

  it('everything numbered has a number, unique across all of it', () => {
    const missing = ALL.filter((a) => typeof a.entry.no !== 'number').map((a) => `${a.what} ${a.entry.id}`);
    expect(missing).toEqual([]);
    const seen = new Map<number, string>();
    const dupes: string[] = [];
    for (const a of ALL) {
      const other = seen.get(a.entry.no!);
      if (other) dupes.push(`${a.entry.no}: ${other} / ${a.entry.id}`);
      seen.set(a.entry.no!, a.entry.id);
    }
    expect(dupes).toEqual([]);
  });

  it('each number says what it numbers: category, nation and type match the entry, serial 1〜999', () => {
    const wrong = ALL.filter((a) => {
      const p = parseNo(a.entry.no!);
      return p.category !== a.category || p.nation !== a.nation || p.type !== a.type || p.serial < 1 || p.serial > 999;
    }).map((a) => `${a.what} ${a.entry.id} ${a.entry.no}`);
    expect(wrong).toEqual([]);
  });

  it('inside a class, numbers follow the hull order (the first numbering went oldest first, list order #246)', () => {
    for (const roster of [ijn, usn, km, rn, fr, su, rm].map((f) => f.ships as unknown as IShipData[])) {
      for (const g of shipClasses(roster)) {
        const byType = new Map<number, number[]>();
        for (const s of g.ships) byType.set(shipTypeCode(s), [...(byType.get(shipTypeCode(s)) ?? []), s.no!]);
        for (const nos of byType.values()) expect(nos, `${roster[0].nation} ${g.key}`).toEqual([...nos].sort((a, b) => a - b));
      }
    }
    const at = (id: string): number => SHIPS.find((s) => s.id === id)!.no!;
    expect(at('mutsu')).toBe(at('nagato') + 1);
    expect(at('hiei')).toBe(at('kongo') + 1);
  });
});
