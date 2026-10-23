import { finalAreas } from '@/systems/RankSystem';
import { describe, it, expect } from 'vitest';
import { areaMode, areasOf, campaignSide, firstSReward, enemyNationFor, enemyShips, isCleared, isFreeArea, isUnlocked, prerequisitesOf, recordClear, theaterProgress, theatersFor, TRAINING_SCALE } from '@/systems/CampaignSystem';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import { Nation } from '@/types/Nation';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { ICampaignArea, ICampaignData, Objective } from '@/types/Campaign';
import { IShipData } from '@/types/Ship';
import { BattleMode } from '@/types/Battle';
import { ShipClass } from '@/types/ShipClass';
import campaign from '@/data/campaign.json';
import rewardShips from '@/data/reward-ships.json';
import { goalThrottle } from '@/systems/ObjectiveSystem';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';
import openSea from '@/data/maps/open-sea.json';
import archipelago from '@/data/maps/archipelago.json';
import strait from '@/data/maps/strait.json';
import atoll from '@/data/maps/atoll.json';
import convoy from '@/data/maps/convoy-route.json';

const data = campaign as ICampaignData;
const registry = new ShipRegistry([...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships, ...fr.ships, ...su.ships, ...rm.ships] as IShipData[]);
const area = (id: string) => data.areas.find((a) => a.id === id)!;

describe('CampaignSystem', () => {
  it('opens the first area of each theater and gates the rest', () => {
    expect(isUnlocked(area('p1'), [])).toBe(true);
    expect(isUnlocked(area('a1'), [])).toBe(true);
    expect(isUnlocked(area('m1'), [])).toBe(true);
    expect(isUnlocked(area('m2'), ['p1', 'a1'])).toBe(false);
    expect(isUnlocked(area('p2'), [])).toBe(false);
    expect(isUnlocked(area('p2'), ['p1'])).toBe(true);
  });

  it('records the first clear only once', () => {
    const a = recordClear([], 'p1');
    expect(a).toEqual({ cleared: ['p1'], firstClear: true });
    expect(recordClear(a.cleared, 'p1').firstClear).toBe(false);
    expect(isCleared(area('p1'), a.cleared)).toBe(true);
  });

  it('builds enemy fleets and picks the battle mode', () => {
    expect(enemyShips(area('p1'), registry).map((s) => s.id)).toEqual(['fletcher']);
    expect(areaMode(enemyShips(area('a1'), registry))).toBe(BattleMode.ASW);
    expect(areaMode(enemyShips(area('p5'), registry))).toBe(BattleMode.CarrierStrike);
    expect(areaMode(enemyShips(area('p1'), registry))).toBe(BattleMode.Surface);
  });

  it('measures theater progress', () => {
    expect(theaterProgress(data, 'pacific', [])).toBe(0);
    // Training areas (#202) don't count.
    expect(theaterProgress(data, 'pacific', ['p1', 'p2', 'a1', 'p0'])).toBeCloseTo(2 / areasOf(data, 'pacific').length);
  });

  it('data: every area has known ships, maps, theaters and prerequisites, and is reachable', () => {
    const maps = new Set([openSea, archipelago, strait, atoll, convoy].map((m) => m.id));
    const ids = new Set(data.areas.map((a) => a.id));
    const theaters = new Set(data.theaters.map((t) => t.id));
    for (const a of data.areas) {
      expect(enemyShips(a, registry), a.id).toHaveLength(a.enemy.ships.length);
      expect(enemyShips(a, registry).some((sh) => sh.fictional), `${a.id} fields a fictional ship`).toBe(false);
      // No area lists the same ship twice (#76).
      expect(new Set(a.enemy.ships).size, `${a.id} repeats a ship`).toBe(a.enemy.ships.length);
      expect(maps.has(a.map), a.id).toBe(true);
      expect(theaters.has(a.theater), a.id).toBe(true);
      for (const r of a.requires) expect(ids.has(r), `${a.id} -> ${r}`).toBe(true);
    }
    // Clearing areas in order unlocks every one of them.
    let cleared: string[] = [];
    for (let pass = 0; pass < data.areas.length; pass++) {
      for (const a of data.areas) if (isUnlocked(a, cleared)) cleared = recordClear(cleared, a.id).cleared;
    }
    expect(cleared.length).toBe(data.areas.length);
  });
});

describe('campaign by nation (#27)', () => {
  it('gives every playable nation at least one theater, never against itself', () => {
    for (const n of PLAYABLE_NATIONS) {
      const ts = theatersFor(data, n);
      expect(ts.length, n).toBeGreaterThan(0);
      for (const t of ts) expect(t.opponents[n], `${n} in ${t.id}`).not.toBe(n);
    }
  });

  it('swaps enemy ships for the opponent nation, class for class, never fictional', () => {
    const p5 = data.areas.find((a) => a.id === 'p5')!;
    expect(enemyNationFor(data, p5, Nation.USN)).toBe(Nation.IJN);
    const written = enemyShips(p5, registry);
    const swapped = enemyShips(p5, registry, Nation.IJN);
    expect(swapped).toHaveLength(written.length);
    swapped.forEach((s, i) => {
      expect(s.nation).toBe(Nation.IJN);
      expect(s.fictional).toBeFalsy();
      expect(s.shipClass).toBe(written[i].shipClass);
    });
    // Same nation as written: unchanged.
    expect(enemyShips(p5, registry, Nation.USN)).toEqual(written);
    // Swapped fleets never repeat a ship, for any playing nation (#76).
    for (const a of data.areas) {
      for (const n of PLAYABLE_NATIONS) {
        const ships = enemyShips(a, registry, enemyNationFor(data, a, n));
        expect(new Set(ships.map((s) => s.id)).size, `${a.id} as ${n}`).toBe(ships.length);
      }
    }
  });

  it('falls back to a battleship when the opponent has no historical carrier', () => {
    const area = data.areas.find((a) => a.enemy.ships.some((id) => registry.byId(id)?.shipClass === ShipClass.Carrier))!;
    const ships = enemyShips(area, registry, Nation.SU);
    expect(ships.every((s) => s.nation === Nation.SU && !s.fictional)).toBe(true);
    expect(ships.some((s) => s.shipClass === ShipClass.Carrier)).toBe(false);
  });

  it('builds a valid enemy fleet for every nation in every theater it plays', () => {
    for (const n of PLAYABLE_NATIONS) {
      for (const t of theatersFor(data, n)) {
        for (const a of areasOf(data, t.id)) {
          const ships = enemyShips(a, registry, enemyNationFor(data, a, n));
          expect(ships.length, `${n} ${a.id}`).toBe(a.enemy.ships.length);
          expect(ships.every((s) => s.nation === t.opponents[n]), `${n} ${a.id}`).toBe(true);
        }
      }
    }
  });
});


describe('more areas and branches (#40)', () => {
  const data = campaign as unknown as ICampaignData;
  const byId = (id: string): ICampaignArea => data.areas.find((a) => a.id === id)!;

  it('every theater has 8+ areas and a branch; finals stay the last listed (rank exams)', () => {
    for (const t of data.theaters) {
      const list = areasOf(data, t.id);
      expect(list.length, t.id).toBeGreaterThanOrEqual(8);
      expect(list.some((a) => (a.requiresAny ?? []).length >= 2), t.id).toBe(true);
    }
    // Training areas (#202) are listed after the finals and never count as one.
    expect(data.theaters.map((t) => areasOf(data, t.id).filter((a) => !a.training).pop()!.id)).toEqual(['p6', 'a5', 'm5', 'b5', 'bs5', 'np5', 'sa5', 'io5', 'ar5']);
  });

  it('a merge opens after either route; a branch area is not free', () => {
    const p5 = byId('p5');
    expect(isUnlocked(p5, ['p1', 'p2', 'p3'])).toBe(false);
    expect(isUnlocked(p5, ['p1', 'p2', 'p3', 'p4'])).toBe(true);
    expect(isUnlocked(p5, ['p1', 'p2', 'p3', 'p7'])).toBe(true);
    expect(isFreeArea(p5)).toBe(false);
    expect(prerequisitesOf(p5)).toEqual(['p4', 'p7']);
  });

  it('new objectives carry what the battle needs', () => {
    for (const a of data.areas.filter((x) => [Objective.SinkTargets, Objective.Breakthrough, Objective.Delay].includes(x.objective))) {
      const side = campaignSide(a)!;
      expect(side.objective).toBe(a.objective);
      expect(side.timeLimitSec, a.id).toBeGreaterThan(0);
      // Shorter since #279: 突入 in 3 minutes, 撃沈 in 5 (the zone is a few hundred metres off at full speed).
      if (a.objective === Objective.Breakthrough) expect(side.timeLimitSec, a.id).toBeLessThanOrEqual(200);
      if (a.objective === Objective.SinkTargets) expect(side.timeLimitSec, a.id).toBeLessThanOrEqual(300);
      if (a.objective !== Objective.SinkTargets) expect(side.zone, a.id).toBeDefined();
      if (a.objective !== Objective.Breakthrough) expect(side.targetLead, a.id).toBe(true);
    }
    expect(campaignSide(byId('p1'))).toBeNull();
  });
});

describe('delay battles can be won (#40)', () => {
  it('the target heads for the zone slowly enough to intercept; the time limit outlasts its unhindered run', () => {
    expect(goalThrottle(1800, 200, 90)).toBeCloseTo(0.1);
    expect(goalThrottle(1800, 100, 90)).toBeCloseTo(0.2);
    expect(goalThrottle(1800, 10, 90)).toBe(1);
    expect(goalThrottle(1800, 200)).toBe(1);
    for (const a of (campaign as unknown as ICampaignData).areas.filter((x) => x.objective === Objective.Delay)) {
      expect(a.side?.arrivalSec, a.id).toBeGreaterThan(0);
      expect(a.side!.timeLimitSec!, a.id).toBeGreaterThan(a.side!.arrivalSec!);
    }
  });
});

describe('more theaters and training areas (#202)', () => {
  it('the USSR gets the Black Sea, reachable from Sevastopol by 少尉; its final is no promotion exam', () => {
    expect(theatersFor(data, Nation.SU).map((t) => t.id)).toEqual(['baltic', 'blacksea', 'north_pacific', 'arctic']);
    expect(areasOf(data, 'blacksea')).toHaveLength(10);
    expect(finalAreas('SU')).toEqual(['b5']);
  });

  it('every theater has ten areas or more, and no training area: training moved into 演習 (#343)', () => {
    for (const t of data.theaters) {
      expect(areasOf(data, t.id).length, t.id).toBeGreaterThanOrEqual(10);
      expect(areasOf(data, t.id).some((a) => a.training), t.id).toBe(false);
    }
    expect(TRAINING_SCALE).toBeLessThan(1);
  });
});

describe('the S-rank reward (#247)', () => {
  const ship = { id: 'takao' } as unknown as Parameters<typeof firstSReward>[1]['rewardShip'];
  it('one reward: the area\'s reward-only ship, else a captain on the first S; a training area none', () => {
    expect(firstSReward({ id: 'p5' }, { rewardShip: ship, perfect: [], captainsLeft: 5 })).toEqual({ kind: 'ship', ship });
    expect(firstSReward({ id: 'p1' }, { perfect: [], captainsLeft: 5 })).toEqual({ kind: 'captain' });
    expect(firstSReward({ id: 'p1' }, { perfect: ['p1'], captainsLeft: 5 })).toBeNull();
    expect(firstSReward({ id: 'p1' }, { perfect: [], captainsLeft: 0 })).toBeNull();
    expect(firstSReward({ id: 'p0', training: true }, { rewardShip: ship, perfect: [], captainsLeft: 5 })).toBeNull();
    expect(firstSReward({ id: 'p0', training: true }, { perfect: [], captainsLeft: 5 })).toBeNull();
    // #285: a captain only from the deeper seas.
    expect(firstSReward({ id: 'p1' }, { perfect: [], captainsLeft: 5, depth: 2, minDepth: 3 })).toBeNull();
    expect(firstSReward({ id: 'p3' }, { perfect: [], captainsLeft: 5, depth: 3, minDepth: 3 })).toEqual({ kind: 'captain' });
    expect(firstSReward({ id: 'p1' }, { rewardShip: ship, perfect: [], captainsLeft: 5, depth: 1, minDepth: 3 })).toEqual({ kind: 'ship', ship });
  });

  it('no area is a training one any more (#343), and every reward-ship table names real areas', () => {
    expect(campaign.areas.some((a) => (a as { training?: boolean }).training)).toBe(false);
    const ids = new Set(campaign.areas.map((a) => a.id));
    for (const table of Object.values(rewardShips)) for (const id of Object.keys(table as Record<string, string>)) expect(ids.has(id), id).toBe(true);
  });
});
