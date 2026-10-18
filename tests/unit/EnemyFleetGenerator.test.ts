import { describe, it, expect } from 'vitest';
import { ENEMY_FLEET_SIZE, generateEnemyFleet } from '@/systems/EnemyFleetGenerator';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { BattleMode } from '@/types/Battle';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';

const registry = new ShipRegistry([...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships, ...fr.ships, ...su.ships, ...rm.ships] as IShipData[]);
const first = (): number => 0;
const last = (): number => 0.999;

function ship(id: string, shipClass: ShipClass): IShipData {
  return { id, name: id, nation: Nation.KM, shipClass, hp: 1, armor: 1, speed: 1, weapons: ['x'], spriteKey: id };
}

describe('generateEnemyFleet', () => {
  it.each(Object.values(Nation))('builds a battleship-led surface group for %s', (nation) => {
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

describe('nations without a historical carrier', () => {
  it.each([Nation.SU, Nation.RM])('%s leads a carrier strike with a battleship instead', (nation) => {
    const fleet = generateEnemyFleet(registry, nation, BattleMode.CarrierStrike, first);
    expect(fleet[0].shipClass).toBe(ShipClass.Battleship);
  });
});

describe('fictional ships', () => {
  it('never appear in generated enemy fleets', () => {
    for (const nation of Object.values(Nation)) {
      for (const mode of [BattleMode.Surface, BattleMode.CarrierStrike, BattleMode.ASW]) {
        for (const rng of [first, last, () => 0.5]) {
          expect(generateEnemyFleet(registry, nation, mode, rng).some((s) => s.fictional), `${nation} ${mode}`).toBe(false);
        }
      }
    }
  });
});
