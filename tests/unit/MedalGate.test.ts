import { describe, expect, it } from 'vitest';
import { facilityMedal, hasMedal, medalNeedText, RESEARCH_MEDALS, researchMedal, shipMedal, unlocksOf } from '@/systems/MedalGate';
import { MEDALS, emptyRecord } from '@/systems/RecordSystem';
import { canResearch, research, TECH_TREE } from '@/systems/ResearchSystem';
import { facilityState, startFacility } from '@/systems/FacilitySystem';
import { resources } from '@/systems/ResourceSystem';
import { ShipClass } from '@/types/ShipClass';

const rich = resources({ fuel: 99999, ammo: 99999, steel: 99999, bauxite: 99999 });

describe('medals as prerequisites (#169)', () => {
  it('every gate names a real medal and a real project', () => {
    for (const [id, medal] of Object.entries(RESEARCH_MEDALS)) {
      expect(TECH_TREE.some((n) => n.id === id), id).toBe(true);
      expect(MEDALS.some((m) => m.id === medal), medal).toBe(true);
    }
  });

  it('the opening never needs one: level 1〜2 research (but carriers), small ships, facilities up to Lv3', () => {
    for (const n of TECH_TREE.filter((x) => x.level <= 2 && x.id !== 'build_carrier')) expect(researchMedal(n.id), n.id).toBeUndefined();
    expect(shipMedal({ shipClass: ShipClass.Destroyer }, 0)).toBeUndefined();
    expect(shipMedal({ shipClass: ShipClass.Battleship }, 3)).toBeUndefined();
    expect(shipMedal({ shipClass: ShipClass.Battleship }, 4)).toBe('battleship_slayer');
    expect(shipMedal({ shipClass: ShipClass.Battleship, fictional: true }, 5)).toBe('ace');
    for (const id of ['fuelTank', 'ammoDepot', 'steelMill', 'airBase', 'workshop'] as const) {
      for (const lv of [1, 2, 3]) expect(facilityMedal('ijn_home', id, lv)).toBeUndefined();
      expect(facilityMedal('ijn_home', id, 4)).toBeDefined();
    }
    expect(facilityMedal('ijn_home', 'unique', 2)).toBeUndefined();
    expect(facilityMedal('ijn_home', 'unique', 3)).toBe('pacific');
  });

  it('research waits for the medal; finished research stays', () => {
    const node = TECH_TREE.find((n) => n.id === 'gunnery_4')!;
    const done = ['gunnery_1', 'gunnery_2', 'gunnery_3'];
    expect(canResearch(node, done, rich, 1, [])).toBe(false);
    expect(research(node, done, rich, 1, [])).toBeNull();
    expect(canResearch(node, done, rich, 1, ['battleship_slayer'])).toBe(true);
    expect(canResearch(node, [...done, 'gunnery_4'], rich, 1, [])).toBe(false);
  });

  it('a facility level that needs a medal reads medal, then opens', () => {
    const facilities = { ijn_home: { fuelTank: 3 } };
    expect(facilityState(facilities, [], 'ijn_home', 'fuelTank', rich, [])).toBe('medal');
    expect(facilityState(facilities, [], 'ijn_home', 'fuelTank', rich, ['builder'])).toBe('ready');
    const p = { resources: rich, facilities, facilityJobs: [], record: { medals: [] as string[] } };
    expect(startFacility(p, 'ijn_home', 'fuelTank', 0)).toBeNull();
    expect(startFacility({ ...p, record: { medals: ['builder'] } }, 'ijn_home', 'fuelTank', 0)).not.toBeNull();
  });

  it('says what is missing and how far along, and what a medal opens', () => {
    const r = { ...emptyRecord(), sunk: { [ShipClass.Battleship]: 3 } };
    expect(medalNeedText('battleship_slayer', r, { clearedTheaters: [] })).toBe('要勲章: 戦艦撃沈章 三等 (戦艦を 5 隻撃沈する — 3 / 5)');
    expect(hasMedal(r, undefined)).toBe(true);
    expect(hasMedal(r, 'battleship_slayer')).toBe(false);
    expect(unlocksOf('battleship_slayer').research).toContain('gunnery_4');
    expect(unlocksOf('battleship_slayer').other.length).toBeGreaterThan(0);
  });
});
