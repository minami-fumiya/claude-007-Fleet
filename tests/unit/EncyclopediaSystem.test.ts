import { describe, it, expect } from 'vitest';
import { filterEntries, kindLabel, summarizeWeapons } from '@/systems/EncyclopediaSystem';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';

const ship = (id: string, shipClass: ShipClass): IShipData => ({
  id, name: id, nation: Nation.IJN, shipClass, hp: 1, armor: 1, speed: 1, weapons: [], spriteKey: id,
});

describe('EncyclopediaSystem', () => {
  const ships = [ship('dd', ShipClass.Destroyer), ship('bb1', ShipClass.Battleship), ship('ss', ShipClass.Submarine), ship('bb2', ShipClass.Battleship)];

  it('sorts by class order, keeping roster order within a class', () => {
    expect(filterEntries(ships, null).map((s) => s.id)).toEqual(['bb1', 'bb2', 'dd', 'ss']);
  });

  it('filters by class', () => {
    expect(filterEntries(ships, ShipClass.Battleship).map((s) => s.id)).toEqual(['bb1', 'bb2']);
    expect(filterEntries(ships, ShipClass.Carrier)).toEqual([]);
  });

  it('counts weapon mounts', () => {
    expect(summarizeWeapons(['a', 'b', 'a', 'a'])).toEqual([{ id: 'a', count: 3 }, { id: 'b', count: 1 }]);
  });

  it('labels a ship by its subtype when it has one', () => {
    expect(kindLabel({ shipClass: ShipClass.Battleship })).toBe('戦艦');
    expect(kindLabel({ shipClass: ShipClass.Battleship, subtype: ShipSubtype.BattleCruiser })).toBe('巡洋戦艦');
    expect(kindLabel({ shipClass: ShipClass.Carrier, subtype: ShipSubtype.EscortCarrier })).toBe('護衛空母');
  });
});
