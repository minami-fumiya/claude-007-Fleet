import { describe, it, expect } from 'vitest';
import { addResources, battleReward, canAfford, formatResources, pay, RESOURCE_CAP, resources, SINK_STEEL, sortieCost } from '@/systems/ResourceSystem';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';

const ship = (shipClass: ShipClass): IShipData => ({ id: shipClass, name: shipClass, nation: Nation.IJN, shipClass, hp: 100, armor: 1, speed: 1, weapons: [], spriteKey: shipClass });

describe('ResourceSystem', () => {
  it('adds, scales and clamps', () => {
    expect(addResources({ fuel: 10 }, { fuel: 5, steel: 2 })).toEqual({ fuel: 15, ammo: 0, steel: 2, bauxite: 0 });
    expect(addResources({ fuel: 10 }, { fuel: 50 }, -1).fuel).toBe(0);
    expect(addResources({ fuel: RESOURCE_CAP }, { fuel: 1 }).fuel).toBe(RESOURCE_CAP);
  });

  it('pays only when every resource is covered', () => {
    expect(canAfford({ fuel: 10, ammo: 10 }, { fuel: 10 })).toBe(true);
    expect(pay({ fuel: 10, ammo: 10 }, { fuel: 4, ammo: 10 })).toEqual(resources({ fuel: 6 }));
    expect(pay({ fuel: 10 }, { fuel: 11 })).toBeNull();
  });

  it('charges more to sortie big ships, bauxite for carriers', () => {
    const bb = sortieCost([ship(ShipClass.Battleship)]);
    const dd = sortieCost([ship(ShipClass.Destroyer)]);
    expect(bb.fuel).toBeGreaterThan(dd.fuel);
    expect(sortieCost([ship(ShipClass.Carrier)]).bauxite).toBeGreaterThan(0);
    expect(sortieCost([ship(ShipClass.Battleship), ship(ShipClass.Destroyer)]).ammo).toBe(bb.ammo + dd.ammo);
    // Light cruisers are cheaper to sortie than heavy ones (#37).
    const heavy = sortieCost([{ ...ship(ShipClass.Cruiser), subtype: ShipSubtype.HeavyCruiser }]);
    const light = sortieCost([{ ...ship(ShipClass.Cruiser), subtype: ShipSubtype.LightCruiser }]);
    expect(light.fuel).toBeLessThan(heavy.fuel);
    expect(light.ammo).toBeLessThan(heavy.ammo);
  });

  it('rewards victories and kills', () => {
    const win = battleReward(true, 3);
    const loss = battleReward(false, 3);
    expect(win.steel).toBeGreaterThan(loss.steel);
    expect(battleReward(false, 0)).toEqual(resources());
    expect(battleReward(true, 0).fuel).toBeGreaterThan(0);
    // Steel by the class sunk (#132): a battleship's wreck gives more than a destroyer's.
    const bb = battleReward(true, 1, [ShipClass.Battleship]).steel;
    const dd = battleReward(true, 1, [ShipClass.Destroyer]).steel;
    expect(bb - dd).toBe(SINK_STEEL[ShipClass.Battleship]! - SINK_STEEL[ShipClass.Destroyer]!);
    expect(battleReward(false, 1, [ShipClass.Battleship]).steel).toBe(SINK_STEEL[ShipClass.Battleship]! / 2);
  });

  it('formats non-zero resources', () => {
    expect(formatResources({ fuel: 5, steel: 2 })).toBe('燃料 5  鋼材 2');
  });
});
