import { describe, it, expect } from 'vitest';
import { fleetPowerBreakdown, ownFleetPower, powerBreakdownText, powerCompareText, powerTone, proficiencyValue } from '@/systems/FleetPower';
import { Formation } from '@/types/Formation';
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

describe('総戦力 (#342)', () => {
  const fleet = [byId('nagato'), byId('fubuki')];
  const T = 1_700_000_000_000;

  it('is the ships as built with nothing done, and each source adds its share', () => {
    const none = fleetPowerBreakdown(fleet, bare, [], { now: T });
    expect(none.total).toBe(fleetPower(fleet));
    expect(Object.values(none.steps).every((v) => Math.abs(v) < 1e-9)).toBe(true);
    const trained = fleetPowerBreakdown(fleet, { ...bare, refits: { nagato: 2 }, proficiency: { nagato: 80, fubuki: 40 } }, [], { now: T });
    expect(trained.steps.refit).toBeGreaterThan(0);
    expect(trained.steps.proficiency).toBeGreaterThan(0.2);
    expect(trained.total).toBeGreaterThan(none.total);
    expect(powerBreakdownText(trained)).toContain('改装 +');
    expect(proficiencyValue(0)).toBe(1);
  });

  it('a tired crew takes some away; a formation trades one thing for another', () => {
    const tired = fleetPowerBreakdown(fleet, { ...bare, morale: { nagato: 10, fubuki: 10 }, moraleAt: { nagato: T, fubuki: T } }, [], { now: T });
    expect(tired.steps.morale).toBeLessThan(0);
    expect(powerBreakdownText(tired)).toContain('士気 −');
    const line = fleetPowerBreakdown(fleet, bare, [], { now: T, formation: Formation.LineAhead });
    expect(line.steps.formation).not.toBe(0);
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
