import { describe, it, expect } from 'vitest';
import { emptySave, progressView, switchNation, withProgress, IProgress } from '@/utils/ProgressStore';
import {
  nextRegenMs, REGEN_CAP, REGEN_INTERVAL_MS, REGEN_PER_TICK, regenerate, resources, RESOURCE_KEYS, canAfford, regenFull,
} from '@/systems/ResourceSystem';
import { paySortie, settleBattle, sortieBlockers } from '@/systems/ProgressionSystem';
import { repairCost, startRepair, completeRepairs, SUNK_HP_FRACTION } from '@/systems/DockSystem';
import { buildCost, buildShip, grantShip, ownedIds, ownedShips, rewardShipFor, starterShip } from '@/systems/ShipyardSystem';
import { addMerit, fleetSlots, meritFor, rankOf } from '@/systems/RankSystem';
import { areasOf, enemyShips, isFreeArea, recordClear } from '@/systems/CampaignSystem';
import { addResources } from '@/systems/ResourceSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { ICampaignArea, ICampaignData } from '@/types/Campaign';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';
import campaign from '@/data/campaign.json';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';

const registry = new ShipRegistry([...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships] as IShipData[]);
const data = campaign as ICampaignData;
const T0 = 1_700_000_000_000;
const MIN = REGEN_INTERVAL_MS;

describe('natural regeneration (#28)', () => {
  it('+3 fuel / ammo, +5 steel and +1 bauxite per minute', () => {
    const r = regenerate(resources(), T0, T0 + 5 * MIN + 30_000);
    expect(r.resources).toEqual({ fuel: 15, ammo: 15, steel: 25, bauxite: 5 });
    // The partial minute carries over.
    expect(r.regenAt).toBe(T0 + 5 * MIN);
    expect(nextRegenMs(r.regenAt, T0 + 5 * MIN + 30_000)).toBe(30_000);
  });

  it('stops at the cap, never lowers a resource above it, and keeps the input when nothing changes', () => {
    const r = regenerate(resources({ fuel: 1499, ammo: 3000 }), T0, T0 + 100 * MIN);
    expect(r.resources.fuel).toBe(REGEN_CAP);
    expect(r.resources.ammo).toBe(3000);
    expect(r.resources.bauxite).toBe(100);
    const have = resources({ fuel: 7 });
    expect(regenerate(have, T0, T0 + 1000).resources).toBe(have);
    expect(regenFull(resources({ fuel: REGEN_CAP, ammo: REGEN_CAP, steel: 2000, bauxite: REGEN_CAP }))).toBe(true);
  });

  it('an unset timer or a clock that went backwards just restarts', () => {
    expect(regenerate(resources(), 0, T0)).toEqual({ resources: resources(), regenAt: T0 });
    expect(regenerate(resources(), T0, T0 - MIN).regenAt).toBe(T0 - MIN);
  });
});

describe('campaign data for the growth curve (#25 / #18)', () => {
  it('every theater opens with a single enemy and grows to 6–8 ships', () => {
    for (const t of data.theaters) {
      const sizes = areasOf(data, t.id).map((a) => a.enemy.ships.length);
      expect(sizes[0]).toBe(1);
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(6);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(8);
      for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
    }
  });

  it('every area grants a ship class on its first clear; every enemy ship id exists', () => {
    const classes = new Set<string>(Object.values(ShipClass));
    for (const a of data.areas) {
      expect(classes.has(a.rewardShip ?? '')).toBe(true);
      expect(enemyShips(a, registry)).toHaveLength(a.enemy.ships.length);
    }
  });

  it('only the first area of each theater is free', () => {
    for (const t of data.theaters) {
      expect(areasOf(data, t.id).filter(isFreeArea)).toHaveLength(1);
      expect(isFreeArea(areasOf(data, t.id)[0])).toBe(true);
    }
  });
});

/** Plays the opening of a new nation with nothing but the pure rules. */
function newNation(nation: Nation): { p: IProgress; roster: IShipData[] } {
  const roster = registry.byNation(nation);
  const save = switchNation(emptySave(), nation, starterShip(roster)?.id, T0);
  return { p: progressView(save), roster };
}

/** First clear of an area, as BattleScene settles it. */
function clear(p: IProgress, a: ICampaignArea, roster: IShipData[]): IProgress {
  const settled = settleBattle(p, { victory: true, enemiesSunk: a.enemy.ships.length, planesLost: 0, ships: [] }).progress;
  const rec = recordClear(settled.campaign, a.id);
  let next = { ...settled, campaign: rec.cleared, resources: addResources(settled.resources, a.reward) };
  next = addMerit(next, meritFor({ victory: true, campaign: true, firstClear: rec.firstClear, enemiesSunk: a.enemy.ships.length })).progress;
  const ship = rewardShipFor(a.rewardShip, roster, ownedIds(next, roster), a.id);
  if (ship) next = grantShip(next, roster, ship.id);
  return next;
}

describe('a brand-new player can always progress', () => {
  for (const nation of [Nation.IJN, Nation.USN, Nation.KM, Nation.RN]) {
    it(`${nation}: one destroyer and 0 resources reach a second slot and a second ship`, () => {
      let { p, roster } = newNation(nation);
      expect(ownedShips(p, roster).map((s) => s.shipClass)).toEqual([ShipClass.Destroyer]);
      expect(RESOURCE_KEYS.every((k) => p.resources[k] === 0)).toBe(true);
      expect(fleetSlots(p)).toBe(1);
      const fleet = ownedShips(p, roster);

      // 1) With nothing at all, both an exercise and every theater's first area can be sortied.
      expect(sortieBlockers(p, fleet, T0, { exercise: true })).toEqual([]);
      for (const t of data.theaters) {
        const first = areasOf(data, t.id)[0];
        expect(first.enemy.ships).toHaveLength(1);
        expect(sortieBlockers(p, fleet, T0, { area: first })).toEqual([]);
        expect(paySortie(p, fleet, { area: first })).not.toBeNull();
      }

      // 2) Worst case: the starter is sunk in the first area and comes home 大破 with no resources.
      const first = areasOf(data, data.theaters[0].id)[0];
      p = settleBattle(paySortie(p, fleet, { area: first })!, { victory: false, enemiesSunk: 0, planesLost: 0, ships: [{ shipId: fleet[0].id, hpFraction: 0, sunk: true }] }).progress;
      expect(p.damage[fleet[0].id]).toBe(SUNK_HP_FRACTION);
      // An exercise still works (full HP, free, docked or not).
      expect(sortieBlockers(p, fleet, T0, { exercise: true })).toEqual([]);
      // Regeneration pays for the repair within an hour, so the campaign is never blocked for good.
      const cost = repairCost(fleet[0].hp, SUNK_HP_FRACTION);
      const save = { ...withProgress(emptySave(), p), current: nation };
      let minutes = 0;
      while (minutes <= 600 && !canAfford(progressView(save, T0 + minutes * MIN).resources, cost)) minutes++;
      expect(minutes).toBeLessThanOrEqual(60);
      p = progressView(save, T0 + minutes * MIN);
      const docked = startRepair(p, fleet[0].id, fleet[0].hp, T0)!;
      expect(docked).not.toBeNull();
      p = { ...p, ...completeRepairs({ ...docked }, T0 + 24 * 3600 * 1000), resources: addResources(p.resources, cost, -1) };
      expect(p.damage[fleet[0].id]).toBeUndefined();

      // 3) An exercise win pays something even when broke.
      const ex = settleBattle(p, { victory: true, enemiesSunk: 1, planesLost: 0, ships: [] }, { exercise: true });
      expect(ex.reward.fuel).toBeGreaterThan(0);

      // 4) Clearing the first area: merit for 少尉, two slots, and a second ship.
      p = clear(p, first, roster);
      expect(rankOf(p).name).toBe('少尉');
      expect(fleetSlots(p)).toBe(2);
      expect(ownedShips(p, roster)).toHaveLength(2);
      // The next area (two enemies) is affordable with two ships.
      const second = areasOf(data, data.theaters[0].id)[1];
      expect(second.enemy.ships).toHaveLength(2);
      expect(paySortie(p, ownedShips(p, roster), { area: second })).not.toBeNull();

      // 5) The first-clear resources pay for a destroyer or submarine build too (grade 0, no class research).
      const buildable = roster.find((s) => s.shipClass === ShipClass.Destroyer && !ownedIds(p, roster).includes(s.id));
      if (buildable) {
        expect(canAfford(p.resources, buildCost(buildable))).toBe(true);
        expect(buildShip(p, roster, buildable)).not.toBeNull();
      }
    });
  }
});

describe('steel is not the lone bottleneck (#35)', () => {
  const minutes = (amount: number, perTick: number): number => (perTick > 0 ? amount / perTick : 0);
  const historical = registry.all().filter((s) => !s.fictional);

  it('regenerating a historical ship\'s steel takes at most 1.5× its fuel or ammo', () => {
    for (const ship of historical) {
      const c = buildCost(ship);
      const steel = minutes(c.steel, REGEN_PER_TICK.steel);
      const other = Math.max(minutes(c.fuel, REGEN_PER_TICK.fuel), minutes(c.ammo, REGEN_PER_TICK.ammo));
      expect(steel, ship.id).toBeLessThanOrEqual(other * 1.5);
    }
  });

  it('a repair costs no more steel than fuel', () => {
    const c = repairCost(800, 0.1);
    expect(c.steel).toBeLessThanOrEqual(c.fuel);
  });
});
