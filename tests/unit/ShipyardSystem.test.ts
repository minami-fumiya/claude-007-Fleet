import { describe, it, expect } from 'vitest';
import {
  BUILD_TECH, buildCost, buildShip, buildState, buildStateLabel, buildTechFor, grantShip, HEAVY_CRUISER_TECH, isBuildTech, isRewardOnly, ownedIds, ownedShips,
  REWARD_SHIPS, rewardShipFor, shipGrade, starterShip, buildTimeMs, startBuild, completeBuilds, buildDockCount, fastBuild,
} from '@/systems/ShipyardSystem';
import { ALL_MISSIONS_DONE, RANKS } from '@/systems/RankSystem';
import { emptyProgress, finishBuilds, IProgress } from '@/utils/ProgressStore';
import { resources } from '@/systems/ResourceSystem';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { Nation } from '@/types/Nation';
import { ITechNode } from '@/types/Progression';
import techTree from '@/data/tech-tree.json';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';
import campaignData from '@/data/campaign.json';

const ROSTERS: Array<[Nation, IShipData[]]> = [
  [Nation.IJN, ijn.ships as IShipData[]],
  [Nation.USN, usn.ships as IShipData[]],
  [Nation.KM, km.ships as IShipData[]],
  [Nation.RN, rn.ships as IShipData[]],
];
const IJN = ijn.ships as IShipData[];
const byId = (id: string): IShipData => IJN.find((s) => s.id === id)!;
const rich = resources({ fuel: 20000, ammo: 20000, steel: 20000, bauxite: 20000 });
const withClears = (n: number): string[] => Array.from({ length: n }, (_, i) => `x${i}`);
// Promotion missions (#142) done: merit alone sets the rank here.
const player = (patch: Partial<IProgress> = {}): IProgress => ({ ...emptyProgress(), ships: ['fubuki'], rankStats: ALL_MISSIONS_DONE, ...patch });

describe('ShipyardSystem (#18 / #29)', () => {
  it('every nation starts with one of its own destroyers', () => {
    for (const [nation, roster] of ROSTERS) {
      const s = starterShip(roster)!;
      expect(s.nation).toBe(nation);
      expect(s.shipClass).toBe(ShipClass.Destroyer);
      expect(s.fictional).toBeFalsy();
    }
    expect(starterShip(IJN)!.id).toBe('fubuki');
  });

  it('an empty ship list falls back to the starter', () => {
    expect(ownedIds({ ships: [] }, IJN)).toEqual(['fubuki']);
    expect(ownedShips({ ships: ['yamato', 'fubuki'] }, IJN).map((s) => s.id)).toEqual(['yamato', 'fubuki']);
  });

  it('build cost grows with size and class; carriers need bauxite', () => {
    const dd = buildCost(byId('fubuki'));
    const ca = buildCost(byId('takao'));
    const bb = buildCost(byId('yamato'));
    expect(ca.steel).toBeGreaterThan(dd.steel);
    expect(bb.steel).toBeGreaterThan(ca.steel);
    expect(bb.ammo).toBeGreaterThan(ca.ammo);
    expect(buildCost(byId('shokaku')).bauxite).toBeGreaterThan(bb.bauxite);
    expect(dd.bauxite).toBe(0);
    for (const v of Object.values(bb)) expect(v % 10).toBe(0);
    // Fictional designs cost more than the biggest historical battleship.
    expect(buildCost(byId('a150')).steel).toBeGreaterThan(bb.steel);
  });

  it('grades: destroyers and submarines 0, the largest battleships and fictional ships 5', () => {
    expect(shipGrade(byId('fubuki'))).toBe(0);
    expect(shipGrade(byId('i400'))).toBe(0);
    expect(shipGrade(byId('takao'))).toBe(1);
    expect(shipGrade(byId('kongo'))).toBe(3);
    expect(shipGrade(byId('yamato'))).toBe(5);
    expect(shipGrade(byId('a150'))).toBe(5);
    for (const [, roster] of ROSTERS) {
      for (const s of roster) expect(shipGrade(s)).toBeLessThan(RANKS.length);
      // Something besides the starter can be built at the lowest rank.
      expect(roster.filter((s) => shipGrade(s) === 0).length).toBeGreaterThan(1);
    }
  });

  it('class research gates (build_battleship needs build_cruiser) exist in the tech tree', () => {
    const tree = techTree.tech as ITechNode[];
    for (const id of Object.values(BUILD_TECH)) expect(tree.some((n) => n.id === id)).toBe(true);
    expect(tree.find((n) => n.id === 'build_battleship')!.requires).toContain('build_cruiser');
    expect(isBuildTech('build_carrier')).toBe(true);
    expect(isBuildTech('gunnery_1')).toBe(false);
  });

  it('build gates: owned, research, rank, resources', () => {
    const p = player({ resources: rich });
    expect(buildState(p, IJN, byId('fubuki'))).toBe('owned');
    expect(buildState(p, IJN, byId('etorofu'))).toBe('ready');
    expect(buildState(p, IJN, byId('atago'))).toBe('research');
    // Heavy cruisers need their own research on top of the light-cruiser one (#37).
    expect(buildState({ ...p, research: ['build_cruiser'], merit: 100 }, IJN, byId('atago'))).toBe('research');
    expect(buildState({ ...p, research: ['build_cruiser'], merit: 100 }, IJN, byId('sendai'))).toBe('ready');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_heavy_cruiser'] }, IJN, byId('atago'))).toBe('rank');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_heavy_cruiser'], merit: 100 }, IJN, byId('atago'))).toBe('ready');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_battleship'], rankFloor: 6 }, IJN, byId('kongo'))).toBe('rank');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_battleship'], rankFloor: 7 }, IJN, byId('kongo'))).toBe('ready');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_battleship'], rankFloor: 11 }, IJN, byId('a150'))).toBe('fictional');
    expect(buildState({ ...p, resources: resources() }, IJN, byId('etorofu'))).toBe('resources');
    expect(buildStateLabel('research', byId('sendai'), { build_cruiser: '軽巡洋艦建造' })).toBe('要研究: 軽巡洋艦建造');
    expect(buildStateLabel('research', byId('atago'), { build_heavy_cruiser: '重巡洋艦建造' })).toBe('要研究: 重巡洋艦建造');
    expect(buildStateLabel('rank', byId('nagato'))).toBe('要階級: 中佐');
    expect(buildStateLabel('rank', byId('a150'))).toBe('要階級: 中将');
  });

  it('the heavy-cruiser research exists, needs the light one, and light cruisers cost less to build (#37)', () => {
    const tree = techTree.tech as Array<{ id: string; requires: string[] }>;
    expect(tree.find((n) => n.id === HEAVY_CRUISER_TECH)?.requires).toEqual(['build_cruiser']);
    expect(isBuildTech(HEAVY_CRUISER_TECH)).toBe(true);
    expect(buildTechFor(byId('takao'))).toBe(HEAVY_CRUISER_TECH);
    expect(buildTechFor(byId('sendai'))).toBe('build_cruiser');
    expect(buildTechFor(byId('fubuki'))).toBeUndefined();
    const light = byId('sendai');
    const asHeavy = { ...light, subtype: ShipSubtype.HeavyCruiser };
    expect(buildCost(light).steel).toBeLessThan(buildCost(asHeavy).steel);
  });

  it('building pays and adds the ship once', () => {
    const p = player({ resources: rich });
    const built = buildShip(p, IJN, byId('etorofu'))!;
    expect(built.ships).toEqual(['fubuki', 'etorofu']);
    expect(built.resources.steel).toBe(rich.steel - buildCost(byId('etorofu')).steel);
    expect(buildShip(built, IJN, byId('etorofu'))).toBeNull();
    // Another nation's ship can't be built here.
    expect(buildShip(p, IJN, (usn.ships as IShipData[])[0])).toBeNull();
    expect(grantShip(built, IJN, 'etorofu').ships).toEqual(['fubuki', 'etorofu']);
  });

  it("first-clear reward: the area's reward-only ship, once; opening areas have none (#160)", () => {
    const ship = rewardShipFor(IJN, ['fubuki'], 'p3')!;
    expect(ship.shipClass).toBe(ShipClass.Submarine);
    expect(isRewardOnly(ship)).toBe(true);
    expect(rewardShipFor(IJN, ['fubuki', ship.id], 'p3')).toBeUndefined();
    expect(rewardShipFor(IJN, ['fubuki'], 'p1')).toBeUndefined();
    // An area of a theater the nation doesn't play grants nothing.
    expect(rewardShipFor(IJN, ['fubuki'], 'b1')).toBeUndefined();
  });

  it('at most half of each theater\'s areas have a reward-only ship, always including the last (#160)', () => {
    for (const [nation, byArea] of Object.entries(REWARD_SHIPS)) {
      for (const t of campaignData.theaters) {
        const areas = campaignData.areas.filter((a) => a.theater === t.id).map((a) => a.id);
        const n = areas.filter((id) => byArea?.[id]).length;
        expect(n, `${nation} ${t.id}`).toBeLessThanOrEqual(Math.floor(areas.length / 2));
      }
    }
    expect(REWARD_SHIPS.IJN?.p6).toBe('nagato');
  });
});

describe('reward-only ships (#39)', () => {
  const all = [ijn, usn, km, rn, fr, su, rm].flatMap((d) => d.ships as IShipData[]);

  it('every reward ship exists in its nation, historical, in an area that nation plays', () => {
    for (const [nation, byArea] of Object.entries(REWARD_SHIPS)) {
      const theaters = campaignData.theaters.filter((t) => (t.opponents as Record<string, string | undefined>)[nation]).map((t) => t.id);
      for (const [area, shipId] of Object.entries(byArea ?? {})) {
        const ship = all.find((x) => x.id === shipId);
        expect(ship?.nation, `${nation} ${shipId}`).toBe(nation);
        expect(ship?.fictional ?? false).toBe(false);
        expect(theaters).toContain(campaignData.areas.find((a) => a.id === area)?.theater);
      }
    }
  });

  it('cannot be built; the shipyard names the area instead', () => {
    const p = player({ resources: rich, research: ['build_cruiser', 'build_battleship'], rankFloor: 13 });
    expect(isRewardOnly(byId('nagato'))).toBe(true);
    expect(buildState(p, IJN, byId('nagato'))).toBe('reward');
    expect(buildShip(p, IJN, byId('nagato'))).toBeNull();
    // The biggest battleships also need the 戦艦撃沈章 (#169).
    expect(buildState(p, IJN, byId('yamato'))).toBe('medal');
    expect(buildStateLabel('medal', byId('yamato'))).toBe('要勲章: 戦艦撃沈章 三等');
    expect(buildState({ ...p, record: { ...p.record, medals: ['battleship_slayer'] } }, IJN, byId('yamato'))).toBe('ready');
    expect(buildStateLabel('reward', byId('nagato'), {}, { p6: '坊ノ岬沖' })).toBe('作戦報酬: 坊ノ岬沖');
    // An owned reward ship stays owned.
    expect(buildState({ ...p, ships: [...p.ships, 'nagato'] }, IJN, byId('nagato'))).toBe('owned');
  });

  it("the area's first clear grants its reward ship, and every first-clear ship is reward-only (#160)", () => {
    expect(rewardShipFor(IJN, ['fubuki'], 'p6')?.id).toBe('nagato');
    expect(rewardShipFor(IJN, ['fubuki', 'nagato'], 'p6')).toBeUndefined();
    for (const a of campaignData.areas) {
      const ship = rewardShipFor(IJN, ['fubuki'], a.id);
      if (ship) expect(isRewardOnly(ship)).toBe(true);
    }
  });

  it('each ship rewards one area, and the opening areas never give a bigger class than theirs', () => {
    const order = [ShipClass.Destroyer, ShipClass.Submarine, ShipClass.Cruiser, ShipClass.Carrier, ShipClass.Battleship];
    for (const byArea of Object.values(REWARD_SHIPS)) {
      const ids = Object.values(byArea ?? {});
      expect(new Set(ids).size).toBe(ids.length);
      for (const [area, id] of Object.entries(byArea ?? {})) {
        const cls = all.find((x) => x.id === id)!.shipClass;
        const want = campaignData.areas.find((x) => x.id === area)!.rewardShip as ShipClass;
        expect(order.indexOf(cls), `${area} ${id}`).toBeLessThanOrEqual(order.indexOf(want));
      }
    }
  });

  it('every nation keeps a destroyer and a submarine it can build', () => {
    for (const d of [ijn, usn, km, rn, fr, su, rm]) {
      const ships = d.ships as IShipData[];
      const starter = starterShip(ships)!;
      for (const cls of [ShipClass.Destroyer, ShipClass.Submarine]) {
        expect(ships.some((x) => x.shipClass === cls && x.id !== starter.id && !x.fictional && !isRewardOnly(x)), `${starter.nation} ${cls}`).toBe(true);
      }
    }
  });
});

describe('construction time (#143)', () => {
  const now = 1_700_000_000_000;
  const ready = (patch: Partial<IProgress> = {}): IProgress => player({ resources: rich, ...patch });

  it('takes minutes by class and grade: destroyers 3, the biggest battleships about 25 (#176)', () => {
    const min = (id: string): number => buildTimeMs(byId(id)) / 60_000;
    expect(min('yukikaze')).toBe(3);
    expect(min('sendai')).toBeLessThan(min('takao'));
    expect(min('kongo')).toBeGreaterThanOrEqual(15);
    expect(min('yamato')).toBeGreaterThanOrEqual(20);
    expect(min('yamato')).toBeLessThanOrEqual(30);
  });

  it('a build is laid down, paid at once, and joins the fleet when finished', () => {
    const roster = IJN;
    const p = startBuild(ready({ research: ['build_submarine'] }), roster, byId('etorofu'), now)!;
    expect(p.ships).not.toContain('etorofu');
    expect(p.resources.steel).toBeLessThan(rich.steel);
    expect(buildState(p, roster, byId('etorofu'))).toBe('building');
    expect(startBuild(p, roster, byId('etorofu'), now)).toBeNull();
    // One slip at the start: a second build waits.
    expect(buildState(p, roster, byId('i19'))).toBe('dock');
    expect(buildStateLabel('dock', byId('i19'))).toBe('建造ドック満杯');
    const early = completeBuilds(p, roster, now + buildTimeMs(byId('etorofu')) - 1);
    expect(early.done).toEqual([]);
    const done = completeBuilds(p, roster, now + buildTimeMs(byId('etorofu')));
    expect(done.done).toEqual(['etorofu']);
    expect(done.progress.ships).toContain('etorofu');
    expect(done.progress.builds).toEqual([]);
  });

  it('more slips come with rank; a 高速建造材 finishes a build at once', () => {
    expect(buildDockCount(player())).toBe(1);
    expect(buildDockCount(player({ rankFloor: 6 }))).toBe(2);
    expect(buildDockCount(player({ rankFloor: 8 }))).toBe(3);
    const p = startBuild(ready({ items: { fastRepair: 0, fastBuild: 1 } }), IJN, byId('etorofu'), now)!;
    const fast = fastBuild(p, IJN, 'etorofu', now)!;
    expect(fast.ships).toContain('etorofu');
    expect(fast.items.fastBuild).toBe(0);
    expect(fastBuild(fast, IJN, 'etorofu', now)).toBeNull();
    expect(fastBuild({ ...p, items: { fastRepair: 0, fastBuild: 0 } }, IJN, 'etorofu', now)).toBeNull();
  });

  it('finished builds join the fleet on load, even after the game was closed', () => {
    const np = { builds: [{ shipId: 'a', endsAt: now }, { shipId: 'b', endsAt: now + 1 }], ships: ['x'] };
    expect(finishBuilds(np, now)).toEqual({ builds: [{ shipId: 'b', endsAt: now + 1 }], ships: ['x', 'a'] });
    expect(finishBuilds(np, now - 1)).toBe(np);
  });
});
