import { describe, it, expect } from 'vitest';
import { BASES, baseBonusLines, baseLockText, buildMultiplier, currentBase, isBaseOpen, moveBase, nationBases, repairTimeMultiplier, researchMultiplier } from '@/systems/BaseSystem';
import { scaleCost } from '@/systems/ResourceSystem';
import { buildCost, buildCostAt, buildShip, buildState, isRewardOnly, shipGrade } from '@/systems/ShipyardSystem';
import { canResearch, research } from '@/systems/ResearchSystem';
import { repairTimeMs, startRepair } from '@/systems/DockSystem';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import { ShipClass } from '@/types/ShipClass';
import { IShipData } from '@/types/Ship';
import { ITechNode } from '@/types/Progression';
import { emptyNationProgress, IProgress } from '@/utils/ProgressStore';
import { Nation } from '@/types/Nation';
import { ALL_MISSIONS_DONE } from '@/systems/RankSystem';
import shipsIjn from '@/data/ships/ijn.json';

const at = (merit: number, base = ''): IProgress => ({
  ...emptyNationProgress(), nation: Nation.IJN, merit, base, rankStats: ALL_MISSIONS_DONE,
  record: { sorties: 0, victories: 0, perfectVictories: 0, sunk: {}, damageDealt: 0, bestDamage: 0, shipsLost: 0, medals: [] },
});

describe('bases (#88)', () => {
  it('every playable nation has four bases, the first open from the start', () => {
    for (const n of PLAYABLE_NATIONS) {
      const list = nationBases(n);
      expect(list, n).toHaveLength(4);
      expect(list[0].unlockRank).toBe(0);
      expect(baseBonusLines(list[0]).length).toBeGreaterThan(0);
    }
    expect(new Set(BASES.map((b) => b.id)).size).toBe(BASES.length);
  });

  it('opens more bases on promotion and falls back to the first for an unknown or locked one', () => {
    const [home, light] = nationBases(Nation.IJN);
    expect(isBaseOpen(light, at(0))).toBe(false);
    expect(baseLockText(light)).toBe('少尉に昇進で解放');
    expect(currentBase(Nation.IJN, at(0, light.id))?.id).toBe(home.id);
    expect(currentBase(Nation.IJN, at(0, 'nope'))?.id).toBe(home.id);
    expect(moveBase(Nation.IJN, at(0), light.id)).toBeNull();
    expect(moveBase(Nation.IJN, at(100), 'usn_home')).toBeNull();
    const moved = moveBase(Nation.IJN, at(100), light.id)!;
    expect(moved.base).toBe(light.id);
    expect(currentBase(Nation.IJN, moved)?.id).toBe(light.id);
  });

  it('bonuses: build by class, research, repair time', () => {
    const [home, light, cruiser] = nationBases(Nation.IJN);
    expect(buildMultiplier(light, ShipClass.Destroyer)).toBe(0.8);
    expect(buildMultiplier(light, ShipClass.Battleship)).toBe(1);
    expect(researchMultiplier(cruiser)).toBe(0.9);
    expect(researchMultiplier(home)).toBe(1);
    expect(repairTimeMultiplier(home)).toBe(0.8);
    expect(scaleCost({ fuel: 101, steel: 10 }, 0.5)).toEqual({ fuel: 51, steel: 5 });
    expect(repairTimeMs(100, 0.5, 0.8)).toBe(repairTimeMs(100, 0.5) * 0.8);
    const docked = startRepair({ damage: { a: 0.5 }, docks: [], docksOwned: 1 }, 'a', 100, 0, 0.8)!;
    expect(docked.docks[0].endsAt).toBe(repairTimeMs(100, 0.5, 0.8));
  });

  it('building and research pay the base price', () => {
    const roster = shipsIjn.ships as IShipData[];
    const dd = roster.find((s) => s.shipClass === ShipClass.Destroyer && !s.fictional && !isRewardOnly(s) && shipGrade(s) === 0)!;
    const rich = { fuel: 5000, ammo: 5000, steel: 5000, bauxite: 5000 };
    const p = { ...at(100, 'ijn_light'), resources: rich, ships: [roster.find((s) => s !== dd)!.id] };
    expect(buildCostAt(p, dd)).toEqual(scaleCost(buildCost(dd), 0.8));
    expect(buildState(p, roster, dd)).toBe('ready');
    const built = buildShip(p, roster, dd)!;
    expect(built.resources.steel).toBe(rich.steel - buildCostAt(p, dd).steel);
    const node = { id: 't', name: 't', branch: 'gunnery', requires: [], cost: { fuel: 100 } } as unknown as ITechNode;
    expect(canResearch(node, [], { fuel: 90, ammo: 0, steel: 0, bauxite: 0 })).toBe(false);
    expect(canResearch(node, [], { fuel: 90, ammo: 0, steel: 0, bauxite: 0 }, 0.9)).toBe(true);
    expect(research(node, [], { fuel: 100, ammo: 0, steel: 0, bauxite: 0 }, 0.9)?.resources.fuel).toBe(10);
  });
});
