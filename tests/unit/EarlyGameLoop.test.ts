import { describe, it, expect } from 'vitest';
import { emptySave, progressView, switchNation, withProgress, IProgress } from '@/utils/ProgressStore';
import {
  nextRegenMs, REGEN_CAP, REGEN_INTERVAL_MS, REGEN_PER_TICK, regenerate, resources, RESOURCE_KEYS, canAfford, regenFull,
} from '@/systems/ResourceSystem';
import { paySortie, settleBattle, sortieBlockers } from '@/systems/ProgressionSystem';
import { repairCost, startRepair, completeRepairs, SUNK_HP_FRACTION } from '@/systems/DockSystem';
import { buildCost, buildShip, grantShip, isRewardOnly, ownedIds, ownedShips, rewardShipFor, starterShip } from '@/systems/ShipyardSystem';
import { addMerit, addRankStats, fleetSlots, meritFor, rankOf } from '@/systems/RankSystem';
import { areasOf, enemyShips, isFreeArea, isUnlocked, recordClear, theatersFor } from '@/systems/CampaignSystem';
import { addResources, battleReward, resources, sortieCost } from '@/systems/ResourceSystem';
import { IResources } from '@/types/Progression';
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
  it('+6 fuel, +4 ammo, +5 steel and +1 bauxite per minute', () => {
    const r = regenerate(resources(), T0, T0 + 5 * MIN + 30_000);
    expect(r.resources).toEqual({ fuel: 30, ammo: 20, steel: 25, bauxite: 5 });
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
  it('every first theater opens with a single enemy and grows to 6–8 ships (the seas of #250 start a step in, #254)', () => {
    for (const t of data.theaters.filter((x) => !x.tier)) {
      const sizes = areasOf(data, t.id).map((a) => a.enemy.ships.length);
      expect(sizes[0]).toBe(1);
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(6);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(8);
    }
    // Along every route (#40 branches), an area never has fewer enemies than the one it follows.
    const size = (id: string): number => data.areas.find((a) => a.id === id)!.enemy.ships.length;
    for (const a of data.areas) {
      for (const r of a.requires) expect(a.enemy.ships.length, `${a.id} after ${r}`).toBeGreaterThanOrEqual(size(r));
      if (a.requiresAny?.length) expect(a.enemy.ships.length, a.id).toBeGreaterThanOrEqual(Math.min(...a.requiresAny.map(size)));
    }
  });

  it('every area but the training ones names a ship class for its reward (#247: training areas none); every enemy ship id exists', () => {
    const classes = new Set<string>(Object.values(ShipClass));
    for (const a of data.areas) {
      if (a.training) expect(a.rewardShip).toBeUndefined();
      else expect(classes.has(a.rewardShip ?? '')).toBe(true);
      expect(enemyShips(a, registry)).toHaveLength(a.enemy.ships.length);
    }
  });

  it('only the first area of each first theater is free; the seas of 0.0.35 open from them (#250)', () => {
    for (const t of data.theaters) {
      // Besides the training area (#202), which is free too.
      const free = areasOf(data, t.id).filter((a) => isFreeArea(a) && !a.training);
      if (t.tier) {
        expect(free, t.id).toHaveLength(0);
        // The first area opens once any first theater's third area is won.
        const first = areasOf(data, t.id)[0];
        expect(isUnlocked(first, [])).toBe(false);
        expect(isUnlocked(first, ['p1', 'p2', 'p3'])).toBe(true);
        expect(isUnlocked(first, ['b1', 'b2', 'b3'])).toBe(true);
      } else {
        expect(free, t.id).toHaveLength(1);
        expect(isFreeArea(areasOf(data, t.id)[0])).toBe(true);
      }
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
  // BattleScene counts the win for the promotion missions (#142) before adding merit.
  next = addRankStats(next, { campaignWin: 1, sink: a.enemy.ships.length });
  next = addMerit(next, meritFor({ victory: true, campaign: true, firstClear: rec.firstClear, enemiesSunk: a.enemy.ships.length })).progress;
  // An S-rank win also brings the area's reward-only ship, if it has one (#160).
  const ship = rewardShipFor(roster, ownedIds(next, roster), a.id);
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

      // 1) With nothing at all, both an exercise and every first theater's first area can be sortied (the seas added
      // in 0.0.35 open later, #250).
      expect(sortieBlockers(p, fleet, T0, { exercise: true })).toEqual([]);
      for (const t of data.theaters.filter((x) => !x.tier)) {
        const first = areasOf(data, t.id)[0];
        expect(first.enemy.ships).toHaveLength(1);
        expect(sortieBlockers(p, fleet, T0, { area: first })).toEqual([]);
        expect(paySortie(p, fleet, { area: first })).not.toBeNull();
      }

      // 2) Worst case: the starter is sunk in the first area and comes home 大破 with no resources.
      // The nation's own first theater: its first area grants a reward-only destroyer (#160).
      const home = theatersFor(data, nation)[0].id;
      const first = areasOf(data, home)[0];
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

      // 4) Clearing the first area: merit for 少尉 and two slots. Opening areas grant no reward-only ship (#160).
      p = clear(p, first, roster);
      expect(rankOf(p).name).toBe('少尉');
      expect(fleetSlots(p)).toBe(2);
      expect(ownedShips(p, roster)).toHaveLength(1);

      // 5) The first-clear resources pay for a second destroyer (grade 0, no class research); every nation keeps one (#160).
      const buildable = roster.find((s) => s.shipClass === ShipClass.Destroyer && !ownedIds(p, roster).includes(s.id) && !isRewardOnly(s));
      expect(buildable).toBeDefined();
      expect(canAfford(p.resources, buildCost(buildable!))).toBe(true);
      p = buildShip(p, roster, buildable!)!;
      expect(ownedShips(p, roster)).toHaveLength(2);
      // The next area (two enemies) is affordable with two ships.
      const second = areasOf(data, home)[1];
      expect(second.enemy.ships).toHaveLength(2);
      expect(paySortie(p, ownedShips(p, roster), { area: second })).not.toBeNull();
    });
  }
});

describe('fuel, ammo and steel stay in balance (#35 / 0.0.12)', () => {
  const byId = (id: string): IShipData => registry.byId(id)!;
  // Typical fleets along a nation's growth: destroyers, then cruisers, then capital ships.
  const fleets = [
    ['fubuki', 'yukikaze'],
    ['sendai', 'fubuki', 'yukikaze', 'shimakaze'],
    ['nagato', 'takao', 'fubuki', 'yukikaze'],
    ['nagato', 'mutsu', 'takao', 'tone', 'fubuki', 'yukikaze'],
  ].map((ids) => ids.map(byId));

  it('a won battle (one sink per ship, 30% damage repaired) pays for itself in every resource', () => {
    for (const fleet of fleets) {
      const reward = battleReward(true, fleet.length);
      const sortie = sortieCost(fleet);
      const repair = fleet.reduce((sum, s) => addResources(sum, repairCost(s.hp, 0.7)), resources());
      const net = addResources(addResources(reward, sortie, -1), repair, -1);
      const raw = (k: keyof IResources): number => reward[k] - sortie[k] - repair[k];
      for (const k of ['fuel', 'ammo', 'steel'] as const) expect(raw(k), `${fleet.map((s) => s.id)} ${k}`).toBeGreaterThan(0);
      // No resource lags far behind another (fuel was short in 0.0.12, steel in 0.0.16 and 0.0.27, #132 #222).
      // Builds take about twice as much steel as fuel, so steel may lead by up to 2.5×.
      expect(raw('fuel')).toBeGreaterThanOrEqual(raw('steel') * 0.4);
      expect(raw('ammo')).toBeGreaterThanOrEqual(raw('steel') * 0.4);
      expect(raw('steel')).toBeGreaterThanOrEqual(Math.max(raw('fuel'), raw('ammo')) * 0.6);
      expect(net.fuel).toBeGreaterThanOrEqual(0);
    }
  });

  it('fuel regenerates fastest, then steel (builds burn it, #222) and ammo', () => {
    expect(REGEN_PER_TICK.fuel).toBeGreaterThan(REGEN_PER_TICK.steel);
    expect(REGEN_PER_TICK.steel).toBeGreaterThanOrEqual(REGEN_PER_TICK.ammo);
  });

  it('a repair costs no more steel than fuel', () => {
    const c = repairCost(800, 0.1);
    expect(c.steel).toBeLessThanOrEqual(c.fuel);
  });
});
