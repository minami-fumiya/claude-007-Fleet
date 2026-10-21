import { describe, it, expect } from 'vitest';
import { ownFleetPower, powerCompareText, powerTone } from '@/systems/FleetPower';
import { fleetPower } from '@/systems/DifficultyCurve';
import { baseReaches, nationBases } from '@/systems/BaseSystem';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import ijn from '@/data/ships/ijn.json';

const IJN = ijn.ships as IShipData[];
const byId = (id: string): IShipData => IJN.find((s) => s.id === id)!;
const bare = { research: [], upgrades: {}, refits: {}, refitBranches: {} };

describe('自艦隊の戦力 (#280)', () => {
  it('weighs the fleet like an enemy, raised by remodels and research', () => {
    const fleet = [byId('fubuki'), byId('nagato')];
    expect(ownFleetPower(fleet, bare, [])).toBe(fleetPower(fleet));
    expect(ownFleetPower(fleet, { ...bare, refits: { nagato: 2 } }, [])).toBeGreaterThan(fleetPower(fleet));
    expect(ownFleetPower([], bare, [])).toBe(0);
  });

  it('compares with the enemy: below 0.8× is a risk, 1.2× and up is ahead', () => {
    expect(powerTone(700, 1000)).toBe('danger');
    expect(powerTone(1000, 1000)).toBe('even');
    expect(powerTone(1300, 1000)).toBe('ahead');
    expect(powerCompareText(1820, 1560)).toBe('自艦隊 1,820 / 敵 1,560 (×1.17)');
  });
});

describe('作戦地図の戦域 (#282)', () => {
  it("Japan's and the Soviet Union's first bases do not reach the North Pacific; a northern base does", () => {
    const [ijnHome] = nationBases(Nation.IJN);
    const [suHome] = nationBases(Nation.SU);
    expect(baseReaches(ijnHome, 'north_pacific')).toBe(false);
    expect(baseReaches(suHome, 'north_pacific')).toBe(false);
    expect(nationBases(Nation.IJN).some((b) => b.unlockRank <= 2 && baseReaches(b, 'north_pacific'))).toBe(true);
    expect(nationBases(Nation.SU).some((b) => b.unlockRank <= 2 && baseReaches(b, 'north_pacific'))).toBe(true);
  });
});
