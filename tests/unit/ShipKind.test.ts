import { describe, it, expect } from 'vitest';
import { filterAndSort, isHeavyCruiser, isLightCruiser, KindFilter, kindShort, matchesKind, ShipSort } from '@/systems/ShipKind';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import rm from '@/data/ships/rm.json';
import su from '@/data/ships/su.json';

const ship = (id: string, shipClass: ShipClass, hp: number, speed: number, subtype?: ShipSubtype): IShipData => ({
  id, name: id, nation: Nation.IJN, shipClass, subtype, hp, armor: 1, speed, weapons: [], spriteKey: id,
});

describe('ShipKind (#37)', () => {
  const fleet = [
    ship('bb', ShipClass.Battleship, 800, 27),
    ship('ca', ShipClass.Cruiser, 400, 35, ShipSubtype.HeavyCruiser),
    ship('cl', ShipClass.Cruiser, 340, 36, ShipSubtype.LightCruiser),
    ship('dd', ShipClass.Destroyer, 210, 38),
    ship('bc', ShipClass.Battleship, 610, 30, ShipSubtype.BattleCruiser),
  ];

  it('labels cruisers as 重巡 / 軽巡 and other ships by subtype or class', () => {
    expect(fleet.map(kindShort)).toEqual(['戦艦', '重巡', '軽巡', '駆逐艦', '巡戦']);
  });

  it('a cruiser without a subtype counts as light', () => {
    const plain = ship('x', ShipClass.Cruiser, 1, 1);
    expect(isLightCruiser(plain)).toBe(true);
    expect(isHeavyCruiser(plain)).toBe(false);
  });

  it('filters by kind; battlecruisers count as battleships', () => {
    expect(fleet.filter((s) => matchesKind(s, KindFilter.Battleship)).map((s) => s.id)).toEqual(['bb', 'bc']);
    expect(fleet.filter((s) => matchesKind(s, KindFilter.HeavyCruiser)).map((s) => s.id)).toEqual(['ca']);
    expect(fleet.filter((s) => matchesKind(s, KindFilter.LightCruiser)).map((s) => s.id)).toEqual(['cl']);
    expect(fleet.filter((s) => matchesKind(s, KindFilter.All))).toHaveLength(5);
  });

  it('sorts by HP or speed (descending), keeping roster order on ties and by default', () => {
    expect(filterAndSort(fleet, KindFilter.All, ShipSort.Default).map((s) => s.id)).toEqual(['bb', 'ca', 'cl', 'dd', 'bc']);
    expect(filterAndSort(fleet, KindFilter.All, ShipSort.Hp).map((s) => s.id)).toEqual(['bb', 'bc', 'ca', 'cl', 'dd']);
    expect(filterAndSort(fleet, KindFilter.All, ShipSort.Speed).map((s) => s.id)).toEqual(['dd', 'cl', 'ca', 'bc', 'bb']);
    expect(filterAndSort(fleet, KindFilter.Battleship, ShipSort.Hp).map((s) => s.id)).toEqual(['bb', 'bc']);
  });

  it('every cruiser in the data is either heavy or light', () => {
    const all = [ijn, usn, km, rn, fr, rm, su].flatMap((f) => f.ships as IShipData[]).filter((s) => s.shipClass === ShipClass.Cruiser);
    expect(all.length).toBeGreaterThan(20);
    for (const s of all) expect([ShipSubtype.HeavyCruiser, ShipSubtype.LightCruiser], s.id).toContain(s.subtype);
  });
});
