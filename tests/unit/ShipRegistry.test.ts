import { describe, it, expect } from 'vitest';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { IShipData, ShipSubtype } from '@/types/Ship';
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

const FILES: Array<[Nation, IShipData[]]> = [
  [Nation.IJN, ijn.ships as IShipData[]],
  [Nation.USN, usn.ships as IShipData[]],
  [Nation.KM, km.ships as IShipData[]],
  [Nation.RN, rn.ships as IShipData[]],
  [Nation.FR, fr.ships as IShipData[]],
  [Nation.SU, su.ships as IShipData[]],
  [Nation.RM, rm.ships as IShipData[]],
];
const ALL = FILES.flatMap(([, ships]) => ships);

function ship(id: string, nation: Nation, shipClass: ShipClass): IShipData {
  return { id, name: id, nation, shipClass, hp: 100, armor: 10, speed: 100, weapons: [], spriteKey: id };
}

describe('ShipRegistry', () => {
  const registry = new ShipRegistry([
    ship('a', Nation.IJN, ShipClass.Battleship),
    ship('b', Nation.IJN, ShipClass.Destroyer),
    ship('c', Nation.USN, ShipClass.Destroyer),
  ]);

  it('groups ships by nation', () => {
    expect(registry.byNation(Nation.IJN).map((s) => s.id)).toEqual(['a', 'b']);
    expect(registry.byNation(Nation.USN).map((s) => s.id)).toEqual(['c']);
    expect(registry.byNation(Nation.RN)).toEqual([]);
  });

  it('filters by nation and class', () => {
    expect(registry.byClass(Nation.IJN, ShipClass.Destroyer).map((s) => s.id)).toEqual(['b']);
    expect(registry.byClass(Nation.USN, ShipClass.Battleship)).toEqual([]);
  });

  it('looks ships up by id', () => {
    expect(registry.byId('c')?.nation).toBe(Nation.USN);
    expect(registry.byId('missing')).toBeUndefined();
  });

  it('rejects duplicate ids', () => {
    expect(() => new ShipRegistry([ship('x', Nation.IJN, ShipClass.Cruiser), ship('x', Nation.KM, ShipClass.Cruiser)])).toThrow();
  });
});

describe('ship data files', () => {
  const weaponIds = new Set((weapons.weapons as IWeaponData[]).map((w) => w.id));

  it('have unique ids across nations', () => {
    expect(() => new ShipRegistry(ALL)).not.toThrow();
  });

  it.each(FILES)('%s file only contains its own nation', (nation, ships) => {
    expect(ships.every((s) => s.nation === nation)).toBe(true);
  });

  it.each(FILES)('%s has every ship class including a submarine', (_nation, ships) => {
    for (const shipClass of Object.values(ShipClass)) {
      expect(ships.some((s) => s.shipClass === shipClass), shipClass).toBe(true);
    }
  });

  it('covers every nation', () => {
    expect(FILES.map(([n]) => n).sort()).toEqual(Object.values(Nation).sort());
  });

  it.each(FILES)('%s has about ten ships or more', (_nation, ships) => {
    expect(ships.length).toBeGreaterThanOrEqual(10);
  });

  it('gives subtypes only to ships of the matching class', () => {
    const CLASS_OF: Record<ShipSubtype, ShipClass> = {
      [ShipSubtype.BattleCruiser]: ShipClass.Battleship,
      [ShipSubtype.AviationBattleship]: ShipClass.Battleship,
      [ShipSubtype.HeavyCruiser]: ShipClass.Cruiser,
      [ShipSubtype.LightCruiser]: ShipClass.Cruiser,
      [ShipSubtype.LightCarrier]: ShipClass.Carrier,
      [ShipSubtype.EscortCarrier]: ShipClass.Carrier,
      [ShipSubtype.Escort]: ShipClass.Destroyer,
    };
    const wrong = ALL.filter((s) => s.subtype && CLASS_OF[s.subtype] !== s.shipClass).map((s) => s.id);
    expect(wrong).toEqual([]);
    for (const subtype of Object.values(ShipSubtype)) {
      expect(ALL.some((s) => s.subtype === subtype), subtype).toBe(true);
    }
  });

  it('only reference weapons that exist', () => {
    const missing = ALL.flatMap((s) => s.weapons.filter((w) => !weaponIds.has(w)).map((w) => `${s.id}:${w}`));
    expect(missing).toEqual([]);
  });

  it('give every ship at least one weapon and a sprite key equal to its id', () => {
    for (const s of ALL) {
      expect(s.weapons.length, s.id).toBeGreaterThan(0);
      expect(s.spriteKey).toBe(s.id);
    }
  });
});

describe('encyclopedia', () => {
  it('every ship has a history blurb', () => {
    const missing = ALL.filter((s) => !s.description || s.description.length < 10).map((s) => s.id);
    expect(missing).toEqual([]);
  });
});
