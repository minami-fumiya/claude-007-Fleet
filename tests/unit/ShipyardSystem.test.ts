import { describe, it, expect } from 'vitest';
import {
  BUILD_TECH, killNeed, MID_KILLS, buildCost, buildShip, buildState, buildStateLabel, buildTechFor, grantShip, HEAVY_CRUISER_TECH, isBuildTech, isRewardOnly, ownedIds, ownedShips,
  REWARD_SHIPS, rewardShipFor, shipGrade, sisterBefore, starterShip, buildTimeMs, startBuild, completeBuilds, buildDockCount, docksInUse, fastBuild,
} from '@/systems/ShipyardSystem';
import { ALL_MISSION_MEDALS, ALL_MISSIONS_DONE, RANKS } from '@/systems/RankSystem';
import { currentBaseId } from '@/systems/BaseSystem';
import { emptyProgress, finishBuilds, IProgress } from '@/utils/ProgressStore';
import { resources } from '@/systems/ResourceSystem';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import { ALL_MID_CLASSES } from '@/systems/ShipKind';
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
/** Enough sinkings of every class for every kill condition (#285). */
const ALL_SUNK = Object.fromEntries(Object.values(ShipClass).map((c) => [c, 999]));
const player = (patch: Partial<IProgress> = {}): IProgress => {
  const p = emptyProgress();
  return { ...p, ships: ['fubuki'], rankStats: ALL_MISSIONS_DONE, record: { ...p.record, medals: ALL_MISSION_MEDALS, sunk: ALL_SUNK }, ...patch };
};

describe('ShipyardSystem (#18 / #29)', () => {
  it('every nation starts with one of its own destroyers', () => {
    for (const [nation, roster] of ROSTERS) {
      const s = starterShip(roster)!;
      expect(s.nation).toBe(nation);
      expect(s.shipClass).toBe(ShipClass.Destroyer);
      expect(s.fictional).toBeFalsy();
    }
    expect(starterShip(IJN)!.id).toBe('mutsuki') // the oldest fleet destroyer class (#284);
  });

  it('an empty ship list falls back to the starter', () => {
    expect(ownedIds({ ships: [] }, IJN)).toEqual(['mutsuki']);
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

  it('grades: destroyers and submarines 0, the largest battleships 5; planned ships by their size too (#309)', () => {
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

  it('class research gates (build_battleship needs build_battlecruiser) exist in the tech tree', () => {
    const tree = techTree.tech as ITechNode[];
    for (const id of Object.values(BUILD_TECH)) expect(tree.some((n) => n.id === id)).toBe(true);
    expect(tree.find((n) => n.id === 'build_battleship')!.requires).toContain('build_battlecruiser');
    expect(isBuildTech('build_carrier')).toBe(true);
    expect(isBuildTech('gunnery_1')).toBe(false);
  });

  it('build gates: owned, research, rank, resources', () => {
    const p = player({ resources: rich });
    expect(buildState(p, IJN, byId('fubuki'))).toBe('owned');
    expect(buildState(p, IJN, byId('yukikaze'))).toBe('ready');
    expect(buildState(p, IJN, byId('atago'))).toBe('research');
    // Heavy cruisers need their own research on top of the light-cruiser one (#37).
    expect(buildState({ ...p, research: ['build_cruiser'], merit: 100 }, IJN, byId('atago'))).toBe('research');
    expect(buildState({ ...p, research: ['build_cruiser'], merit: 100 }, IJN, byId('sendai'))).toBe('ready');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_heavy_cruiser'] }, IJN, byId('atago'))).toBe('rank');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_heavy_cruiser'], merit: 100 }, IJN, byId('atago'))).toBe('ready');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_battlecruiser'], rankFloor: 6 }, IJN, byId('kongo'))).toBe('rank');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_battlecruiser'], rankFloor: 7 }, IJN, byId('kongo'))).toBe('ready');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_battleship'], rankFloor: 11 }, IJN, byId('a150'))).toBe('focus');
    expect(buildState({ ...p, resources: resources() }, IJN, byId('yukikaze'))).toBe('resources');
    expect(buildStateLabel('research', byId('sendai'), { build_cruiser: '軽巡洋艦建造' })).toBe('要研究: 軽巡洋艦建造');
    expect(buildStateLabel('research', byId('atago'), { build_heavy_cruiser: '重巡洋艦建造' })).toBe('要研究: 重巡洋艦建造');
    expect(buildStateLabel('rank', byId('nagato'))).toBe('要階級: 中佐');
    expect(buildStateLabel('rank', byId('a150'))).toBe('要階級: 中将');
  });

  it('the heavy-cruiser research exists, needs the light one, and light cruisers cost less to build (#37)', () => {
    const tree = techTree.tech as Array<{ id: string; requires: string[] }>;
    // The 水上艦 branch is a chain by ship size (#341): 海防艦 → … → 軽巡 → 防空巡 → 重巡.
    expect(tree.find((n) => n.id === HEAVY_CRUISER_TECH)?.requires).toEqual(['build_aa_cruiser']);
    expect(tree.find((n) => n.id === 'build_escort')?.requires).toEqual([]);
    expect(buildTechFor(byId('etorofu'))).toBe('build_escort');
    expect(isBuildTech(HEAVY_CRUISER_TECH)).toBe(true);
    expect(buildTechFor(byId('takao'))).toBe(HEAVY_CRUISER_TECH);
    expect(buildTechFor(byId('sendai'))).toBe('build_cruiser');
    expect(buildTechFor(byId('fubuki'))).toBeUndefined();
    const light = byId('sendai');
    const asHeavy = { ...light, subtype: ShipSubtype.HeavyCruiser };
    expect(buildCost(light).steel).toBeLessThan(buildCost(asHeavy).steel);
  });

  it('each 中分類 asks sinkings of its foe before it can be built, and says how far (#285)', () => {
    const none = (p: IProgress): IProgress => ({ ...p, record: { ...p.record, sunk: {} } });
    const p = player({ resources: rich, research: ['build_cruiser', 'build_escort', 'build_heavy_cruiser'], merit: 100 });
    expect(killNeed(byId('mutsuki'))).toBeUndefined();
    expect(buildState(none(p), IJN, byId('mutsuki'))).toBe('ready');
    expect(buildState(none(p), IJN, byId('atago'))).toBe('kills');
    expect(buildStateLabel('kills', byId('atago'), {}, {}, { sunk: { [ShipClass.Cruiser]: 4 } })).toBe('不足: 巡洋艦撃沈 4 / 10');
    const nine = { ...p, record: { ...p.record, sunk: { [ShipClass.Cruiser]: 9 } } };
    expect(buildState(nine, IJN, byId('atago'))).toBe('kills');
    expect(buildState({ ...p, record: { ...p.record, sunk: { [ShipClass.Cruiser]: 10 } } }, IJN, byId('atago'))).toBe('ready');
    // Every 中分類 but the starters' asks something, and only of real ship classes.
    for (const m of ALL_MID_CLASSES) if (m !== 'Destroyer') expect(MID_KILLS[m], m).toBeDefined();
  });

  it('building pays and adds the ship once', () => {
    const p = player({ resources: rich });
    const built = buildShip(p, IJN, byId('yukikaze'))!;
    expect(built.ships).toEqual(['fubuki', 'yukikaze']);
    expect(built.resources.steel).toBe(rich.steel - buildCost(byId('yukikaze')).steel);
    expect(buildShip(built, IJN, byId('yukikaze'))).toBeNull();
    // Another nation's ship can't be built here.
    expect(buildShip(p, IJN, (usn.ships as IShipData[])[0])).toBeNull();
    expect(grantShip(built, IJN, 'yukikaze').ships).toEqual(['fubuki', 'yukikaze']);
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

  it('every reward ship exists in its nation, in an area that nation plays; planned ships only where history runs out (#331)', () => {
    // Germany and the Soviet Union have no sister ships left for some seas: their planned designs fill them.
    const planned = new Set(['h39', 'h41', 'o_class', 'seydlitz', 'sovetsky_soyuz', 'project71', 'chapayev']);
    for (const [nation, byArea] of Object.entries(REWARD_SHIPS)) {
      const theaters = campaignData.theaters.filter((t) => (t.opponents as Record<string, string | undefined>)[nation]).map((t) => t.id);
      for (const [area, shipId] of Object.entries(byArea ?? {})) {
        const ship = all.find((x) => x.id === shipId);
        expect(ship?.nation, `${nation} ${shipId}`).toBe(nation);
        expect(!(ship?.fictional ?? false) || planned.has(shipId), `${nation} ${shipId}`).toBe(true);
        expect(theaters).toContain(campaignData.areas.find((a) => a.id === area)?.theater);
      }
    }
  });

  it('are never fleet carriers; every navy with carriers can build one; at most one light carrier as a reward (#204)', () => {
    const fleetCarrier = (x: IShipData): boolean => x.shipClass === ShipClass.Carrier && x.subtype !== 'LightCarrier' && x.subtype !== 'EscortCarrier';
    for (const nation of new Set(all.map((x) => x.nation))) {
      const rewards = Object.values(REWARD_SHIPS[nation] ?? {}).map((id) => all.find((x) => x.id === id)!);
      expect(rewards.filter(fleetCarrier).map((x) => x.id), nation).toEqual([]);
      expect(rewards.filter((x) => x.shipClass === ShipClass.Carrier).length, nation).toBeLessThanOrEqual(1);
      const carriers = all.filter((x) => x.nation === nation && x.shipClass === ShipClass.Carrier && !x.fictional);
      if (carriers.length > 0) expect(carriers.some((x) => !isRewardOnly(x)), `${nation} can build a carrier`).toBe(true);
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

  it('every theater a navy fights in has three reward ships or more (#285)', () => {
    for (const [nation, byArea] of Object.entries(REWARD_SHIPS)) {
      for (const t of campaignData.theaters.filter((x) => (x.opponents as Record<string, string | undefined>)[nation])) {
        const n = campaignData.areas.filter((x) => x.theater === t.id && byArea?.[x.id]).length;
        expect(n, `${nation} ${t.id}`).toBeGreaterThanOrEqual(3);
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

  it('takes minutes by class and grade: destroyers 1, the biggest battleships about 8 (#176 #212)', () => {
    const min = (id: string): number => buildTimeMs(byId(id)) / 60_000;
    expect(min('yukikaze')).toBe(1);
    expect(min('sendai')).toBeLessThan(min('takao'));
    expect(min('takao')).toBeLessThan(min('kaga'));
    expect(min('kaga')).toBeLessThan(min('yamato'));
    expect(min('kongo')).toBeGreaterThanOrEqual(5);
    expect(min('yamato')).toBeGreaterThanOrEqual(6);
    expect(min('yamato')).toBeLessThanOrEqual(10);
  });

  it('a build is laid down, paid at once, and joins the fleet when finished', () => {
    const roster = IJN;
    const p = startBuild(ready({ research: ['build_submarine'] }), roster, byId('yukikaze'), now)!;
    expect(p.ships).not.toContain('yukikaze');
    expect(p.resources.steel).toBeLessThan(rich.steel);
    expect(buildState(p, roster, byId('yukikaze'))).toBe('building');
    expect(startBuild(p, roster, byId('yukikaze'), now)).toBeNull();
    // Builds and repairs share the base's docks (#211): one at the start (#244), so a second build waits for it; a
    // base with two fits the second.
    expect(docksInUse(p)).toBe(buildDockCount(p));
    expect(buildState(p, roster, byId('i168'))).toBe('dock');
    expect(buildStateLabel('dock', byId('i168'))).toBe('ドック満杯');
    const wide = { ...p, baseDocks: { [currentBaseId(p)]: 2 } };
    expect(buildState(wide, roster, byId('i168'))).toBe('ready');
    const two = startBuild(wide, roster, byId('i168'), now)!;
    expect(docksInUse(two)).toBe(buildDockCount(two));
    // A ship in for repair takes a dock as well.
    const repairing = { ...p, docks: [{ shipId: 'fubuki', endsAt: now + 1000 }] };
    expect(buildState(repairing, roster, byId('i168'))).toBe('dock');
    const early = completeBuilds(p, roster, now + buildTimeMs(byId('yukikaze')) - 1);
    expect(early.done).toEqual([]);
    const done = completeBuilds(p, roster, now + buildTimeMs(byId('yukikaze')));
    expect(done.done).toEqual(['yukikaze']);
    expect(done.progress.ships).toContain('yukikaze');
    expect(done.progress.builds).toEqual([]);
  });

  it('builds use the base\'s docks (#211); a 高速建造材 finishes a build at once', () => {
    expect(buildDockCount(player())).toBe(1);
    expect(buildDockCount(player({ baseDocks: { [currentBaseId(player())]: 5 } }))).toBe(5);
    const p = startBuild(ready({ items: { fastRepair: 0, fastBuild: 1 } }), IJN, byId('yukikaze'), now)!;
    const fast = fastBuild(p, IJN, 'yukikaze', now)!;
    expect(fast.ships).toContain('yukikaze');
    expect(fast.items.fastBuild).toBe(0);
    expect(fastBuild(fast, IJN, 'yukikaze', now)).toBeNull();
    expect(fastBuild({ ...p, items: { fastRepair: 0, fastBuild: 0 } }, IJN, 'yukikaze', now)).toBeNull();
  });

  it('finished builds join the fleet on load, even after the game was closed', () => {
    const np = { builds: [{ shipId: 'a', endsAt: now }, { shipId: 'b', endsAt: now + 1 }], ships: ['x'] };
    expect(finishBuilds(np, now)).toEqual({ builds: [{ shipId: 'b', endsAt: now + 1 }], ships: ['x', 'a'] });
    expect(finishBuilds(np, now - 1)).toBe(np);
  });
});

describe('同型艦は若い番号から順に建造する (#356)', () => {
  const ready = (patch: Partial<IProgress> = {}): IProgress => player({ resources: rich, rankFloor: 13, research: (techTree.tech as ITechNode[]).map((n) => n.id), ...patch });

  it('a sister waits for the hull before it; the lead and a ship of its own do not', () => {
    expect(sisterBefore(IJN, byId('yamato'))).toBeUndefined();
    expect(sisterBefore(IJN, byId('musashi'))?.id).toBe('yamato');
    expect(buildState(ready(), IJN, byId('musashi'))).toBe('sister');
    expect(buildStateLabel('sister', byId('musashi'), {}, {}, undefined, IJN)).toBe('要: 1番艦の建造');
    expect(buildState(ready({ ships: ['fubuki', 'yamato'] }), IJN, byId('musashi'))).not.toBe('sister');
  });

  it('a hull on the slip counts as built for the next one', () => {
    const p = ready({ builds: [{ shipId: 'yamato', base: currentBaseId(emptyProgress()), endsAt: Date.now() + 60_000 }] as IProgress['builds'] });
    expect(buildState(p, IJN, byId('musashi'))).not.toBe('sister');
  });

  it('reward and planned ships stand outside the order', () => {
    for (const s of IJN.filter((x) => isRewardOnly(x) || x.fictional)) expect(sisterBefore(IJN, s), s.id).toBeUndefined();
  });
});
