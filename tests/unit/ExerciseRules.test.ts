import { describe, it, expect } from 'vitest';
import {
  EXERCISE_REWARD_SCALE, isExercise, isFreeSortie, paySortie, settleBattle, sortieBlockers, sortieCostFor, startingHp,
} from '@/systems/ProgressionSystem';
import { exerciseEnemyFleet, MAX_EXERCISE_ENEMIES } from '@/systems/EnemyFleetGenerator';
import { FormationSystem } from '@/systems/FormationSystem';
import { battleReward, resources } from '@/systems/ResourceSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { emptyProgress } from '@/utils/ProgressStore';
import { BattleMode } from '@/types/Battle';
import { Formation } from '@/types/Formation';
import { ICampaignArea, ICampaignData } from '@/types/Campaign';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import campaign from '@/data/campaign.json';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';

const registry = new ShipRegistry([...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships] as IShipData[]);
const ship = (id: string): IShipData => registry.byId(id)!;
const areas = (campaign as ICampaignData).areas;
const area = (id: string): ICampaignArea => areas.find((a) => a.id === id)!;
const broke = { ...emptyProgress(), resources: resources() };

describe('演習 (free battle, #15) and free sorties (#28)', () => {
  it('a battle without an area or scenario is an exercise', () => {
    expect(isExercise({})).toBe(true);
    expect(isExercise(null)).toBe(true);
    expect(isExercise({ areaId: 'p1' })).toBe(false);
    expect(isExercise({ scenario: { id: 'x', side: 0 } })).toBe(false);
  });

  it('exercises and the first area of each theater cost nothing', () => {
    const fleet = [ship('yamato'), ship('fubuki')];
    expect(isFreeSortie({ exercise: true })).toBe(true);
    expect(sortieCostFor(fleet, { exercise: true })).toEqual(resources());
    for (const a of areas.filter((x) => x.requires.length === 0 && !x.requiresAny?.length)) expect(sortieCostFor(fleet, { area: a })).toEqual(resources());
    expect(sortieCostFor(fleet, { area: area('p2') }).fuel).toBeGreaterThan(0);
    expect(paySortie(broke, fleet, { exercise: true })).not.toBeNull();
    expect(paySortie(broke, fleet, { area: area('p1') })).not.toBeNull();
    expect(paySortie(broke, fleet, { area: area('p2') })).toBeNull();
  });

  it('docked ships may join an exercise but not a campaign sortie', () => {
    const docked = { ...broke, damage: { fubuki: 0.3 }, docks: [{ shipId: 'fubuki', endsAt: 1000 }] };
    expect(sortieBlockers(docked, [ship('fubuki')], 0, { exercise: true })).toEqual([]);
    expect(sortieBlockers(docked, [ship('fubuki')], 0, { area: area('p1') })).toEqual([`${ship('fubuki').name} は入渠中`]);
  });

  it('an exercise keeps no damage, costs no aircraft and pays half the reward', () => {
    const p = { ...broke, damage: { fubuki: 0.5 } };
    const outcome = {
      victory: true, enemiesSunk: 2, planesLost: 4,
      ships: [{ shipId: 'fubuki', hpFraction: 0.2, sunk: false }, { shipId: 'shokaku', hpFraction: 0, sunk: true }],
    };
    const s = settleBattle(p, outcome, { exercise: true });
    const full = battleReward(true, 2);
    expect(s.reward.steel).toBe(Math.round(full.steel * EXERCISE_REWARD_SCALE));
    expect(s.aircraftCost).toEqual(resources());
    expect(s.progress.damage).toEqual({ fubuki: 0.5 });
    expect(s.progress.resources).toEqual(s.reward);
    // The same battle as a campaign sortie keeps its damage.
    expect(settleBattle(p, outcome).progress.damage.fubuki).toBe(0.2);
  });

  it('exercise ships start at full HP whatever damage they carry', () => {
    const p = { ...broke, damage: { fubuki: 0.3 } };
    expect(startingHp(p, 'fubuki', true)).toBe(1);
    expect(startingHp(p, 'fubuki')).toBe(0.3);
  });
});

describe('exercise opponent (#25 / #76 / #78)', () => {
  it('fields the asked number of enemies, 1 to 20', () => {
    const fleet = [ship('fubuki')];
    for (const size of [1, 3, 10, 20]) {
      expect(exerciseEnemyFleet(registry, Nation.USN, BattleMode.Surface, fleet, size)).toHaveLength(size);
    }
    expect(exerciseEnemyFleet(registry, Nation.USN, BattleMode.Surface, fleet, 99)).toHaveLength(MAX_EXERCISE_ENEMIES);
    expect(exerciseEnemyFleet(registry, Nation.USN, BattleMode.Surface, fleet, 0)).toHaveLength(1);
    expect(exerciseEnemyFleet(registry, Nation.USN, BattleMode.Surface, [], 2)).toEqual([]);
  });

  it('never fields the same ship twice, even ten ships from a small navy', () => {
    for (const nation of Object.values(Nation)) {
      for (const mode of [BattleMode.Surface, BattleMode.CarrierStrike, BattleMode.ASW]) {
        const enemy = exerciseEnemyFleet(registry, nation, mode, [ship('yamato'), ship('fubuki')], 10, () => 0);
        expect(new Set(enemy.map((s) => s.id)).size, `${nation} ${mode}`).toBe(enemy.length);
      }
    }
  });

  it('mirrors the class of each player ship so a lone destroyer meets a destroyer', () => {
    const enemy = exerciseEnemyFleet(registry, Nation.USN, BattleMode.Surface, [ship('fubuki')], 1);
    expect(enemy[0].shipClass).toBe(ShipClass.Destroyer);
    const mixed = exerciseEnemyFleet(registry, Nation.KM, BattleMode.Surface, [ship('yamato'), ship('takao')], 3, () => 0);
    expect(mixed.map((s) => s.shipClass)).toEqual([ShipClass.Battleship, ShipClass.Cruiser, ShipClass.Cruiser]);
    expect(mixed.every((s) => s.nation === Nation.KM && !s.fictional)).toBe(true);
  });

  it('ASW fields submarines first, a carrier battle leads with a carrier', () => {
    expect(exerciseEnemyFleet(registry, Nation.RN, BattleMode.ASW, [ship('fubuki')], 2)[0].shipClass).toBe(ShipClass.Submarine);
    expect(exerciseEnemyFleet(registry, Nation.USN, BattleMode.CarrierStrike, [ship('fubuki')], 1)[0].shipClass).toBe(ShipClass.Carrier);
  });
});

describe('formation offsets for big fleets', () => {
  it('repeats the pattern further astern without stacking ships', () => {
    for (const f of [Formation.LineAhead, Formation.DoubleLine, Formation.Circle]) {
      const offsets = Array.from({ length: 7 }, (_, i) => FormationSystem.getOffset(f, i));
      expect(offsets.slice(0, 2)).toEqual(FormationSystem.getOffsets(f));
      const keys = new Set(offsets.map((o) => `${o.forward},${o.right}`));
      expect(keys.size).toBe(7);
      // Line ahead / double line stay astern; the circle rings the flagship (some escorts ahead).
      if (f !== Formation.Circle) for (const o of offsets) expect(o.forward).toBeLessThan(0);
    }
  });
});
