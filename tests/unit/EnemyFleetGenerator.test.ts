import { describe, it, expect } from 'vitest';
import { ENEMY_FLEET_SIZE, enemyFleetSize, generateEnemyFleet, MAX_ENEMY_FLEET_SIZE } from '@/systems/EnemyFleetGenerator';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { BattleMode } from '@/types/Battle';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';

const registry = new ShipRegistry([...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships] as IShipData[]);
const first = (): number => 0;
const last = (): number => 0.999;

function ship(id: string, shipClass: ShipClass): IShipData {
  return { id, name: id, nation: Nation.KM, shipClass, hp: 1, armor: 1, speed: 1, weapons: ['x'], spriteKey: id };
}

describe('generateEnemyFleet', () => {
  it.each([Nation.IJN, Nation.USN, Nation.KM, Nation.RN])('builds a battleship-led surface group for %s', (nation) => {
    const fleet = generateEnemyFleet(registry, nation, BattleMode.Surface, first);
    expect(fleet).toHaveLength(ENEMY_FLEET_SIZE);
    expect(fleet.map((s) => s.shipClass)).toEqual([ShipClass.Battleship, ShipClass.Cruiser, ShipClass.Destroyer]);
    expect(fleet.every((s) => s.nation === nation)).toBe(true);
  });

  it('uses the rng to choose between ships of the same class', () => {
    const a = generateEnemyFleet(registry, Nation.USN, BattleMode.Surface, first)[0];
    const b = generateEnemyFleet(registry, Nation.USN, BattleMode.Surface, last)[0];
    expect(a.id).not.toBe(b.id);
  });

  it('builds a carrier task force', () => {
    const fleet = generateEnemyFleet(registry, Nation.RN, BattleMode.CarrierStrike, first);
    expect(fleet.map((s) => s.shipClass)).toEqual([ShipClass.Carrier, ShipClass.Cruiser, ShipClass.Destroyer]);
  });

  it('builds a submarine wolfpack in ASW mode', () => {
    const fleet = generateEnemyFleet(registry, Nation.KM, BattleMode.ASW, first);
    expect(fleet).toHaveLength(ENEMY_FLEET_SIZE);
    expect(fleet.every((s) => s.shipClass === ShipClass.Submarine)).toBe(true);
  });

  it('falls back to other classes when a nation lacks the wanted ones', () => {
    const small = new ShipRegistry([ship('dd', ShipClass.Destroyer), ship('ss', ShipClass.Submarine)]);
    const surface = generateEnemyFleet(small, Nation.KM, BattleMode.Surface, first);
    expect(surface.map((s) => s.id)).toEqual(['dd', 'dd', 'dd']);
    const onlySurface = new ShipRegistry([ship('ca', ShipClass.Cruiser)]);
    expect(generateEnemyFleet(onlySurface, Nation.KM, BattleMode.ASW, first).map((s) => s.id)).toEqual(['ca', 'ca', 'ca']);
  });

  it('returns an empty fleet for a nation without ships', () => {
    expect(generateEnemyFleet(new ShipRegistry([]), Nation.RN, BattleMode.Surface)).toEqual([]);
  });
});

describe('fleet size', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('builds %i ships, flagship class first', (n) => {
    for (const mode of [BattleMode.Surface, BattleMode.CarrierStrike, BattleMode.ASW]) {
      const fleet = generateEnemyFleet(registry, Nation.USN, mode, first, n);
      expect(fleet, mode).toHaveLength(n);
    }
    expect(generateEnemyFleet(registry, Nation.USN, BattleMode.Surface, first, n)[0].shipClass).toBe(ShipClass.Battleship);
    expect(generateEnemyFleet(registry, Nation.USN, BattleMode.CarrierStrike, first, n)[0].shipClass).toBe(ShipClass.Carrier);
  });

  it('keeps the default 3-ship fleet', () => {
    expect(generateEnemyFleet(registry, Nation.IJN, BattleMode.Surface, first, 3)).toEqual(generateEnemyFleet(registry, Nation.IJN, BattleMode.Surface, first));
  });

  it('prefers ships not already in the fleet', () => {
    for (const nation of [Nation.IJN, Nation.USN, Nation.KM, Nation.RN]) {
      const fleet = generateEnemyFleet(registry, nation, BattleMode.Surface, first, 8);
      const ids = fleet.map((s) => s.id);
      const destroyers = registry.byNation(nation).filter((s) => s.shipClass === ShipClass.Destroyer && !s.fictional).length;
      const ddInFleet = fleet.filter((s) => s.shipClass === ShipClass.Destroyer).map((s) => s.id);
      expect(new Set(ddInFleet).size, nation).toBe(Math.min(destroyers, ddInFleet.length));
      expect(ids).toHaveLength(8);
    }
  });

  it('clamps the requested size to 1..8', () => {
    expect(enemyFleetSize(0)).toBe(1);
    expect(enemyFleetSize(12)).toBe(MAX_ENEMY_FLEET_SIZE);
    expect(enemyFleetSize(Number.NaN)).toBe(ENEMY_FLEET_SIZE);
    expect(generateEnemyFleet(registry, Nation.KM, BattleMode.Surface, first, 20)).toHaveLength(8);
  });
});

describe('fictional ships', () => {
  it('never appear in generated enemy fleets', () => {
    for (const nation of [Nation.IJN, Nation.USN, Nation.KM, Nation.RN]) {
      for (const mode of [BattleMode.Surface, BattleMode.CarrierStrike, BattleMode.ASW]) {
        for (const rng of [first, last, () => 0.5]) {
          expect(generateEnemyFleet(registry, nation, mode, rng).some((s) => s.fictional), `${nation} ${mode}`).toBe(false);
        }
      }
    }
  });
});
