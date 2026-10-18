import { describe, it, expect } from 'vitest';
import {
  BUILD_TECH, buildCost, buildShip, buildState, buildStateLabel, buildTechFor, grantShip, HEAVY_CRUISER_TECH, isBuildTech, ownedIds, ownedShips, rewardShipFor,
  shipGrade, starterShip,
} from '@/systems/ShipyardSystem';
import { RANKS } from '@/systems/RankSystem';
import { emptyProgress, IProgress } from '@/utils/ProgressStore';
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
const player = (patch: Partial<IProgress> = {}): IProgress => ({ ...emptyProgress(), ships: ['fubuki'], ...patch });

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
    expect(buildState(p, IJN, byId('yukikaze'))).toBe('ready');
    expect(buildState(p, IJN, byId('takao'))).toBe('research');
    // Heavy cruisers need their own research on top of the light-cruiser one (#37).
    expect(buildState({ ...p, research: ['build_cruiser'], campaign: withClears(1) }, IJN, byId('takao'))).toBe('research');
    expect(buildState({ ...p, research: ['build_cruiser'], campaign: withClears(1) }, IJN, byId('sendai'))).toBe('ready');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_heavy_cruiser'] }, IJN, byId('takao'))).toBe('rank');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_heavy_cruiser'], campaign: withClears(1) }, IJN, byId('takao'))).toBe('ready');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_battleship'], campaign: withClears(7) }, IJN, byId('yamato'))).toBe('rank');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_battleship'], campaign: withClears(10) }, IJN, byId('yamato'))).toBe('ready');
    expect(buildState({ ...p, research: ['build_cruiser', 'build_battleship'], campaign: withClears(10) }, IJN, byId('a150'))).toBe('fictional');
    expect(buildState({ ...p, resources: resources() }, IJN, byId('yukikaze'))).toBe('resources');
    expect(buildStateLabel('research', byId('sendai'), { build_cruiser: '軽巡洋艦建造' })).toBe('要研究: 軽巡洋艦建造');
    expect(buildStateLabel('research', byId('takao'), { build_heavy_cruiser: '重巡洋艦建造' })).toBe('要研究: 重巡洋艦建造');
    expect(buildStateLabel('rank', byId('yamato'))).toBe('要階級: 大将');
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
    const built = buildShip(p, IJN, byId('yukikaze'))!;
    expect(built.ships).toEqual(['fubuki', 'yukikaze']);
    expect(built.resources.steel).toBe(rich.steel - buildCost(byId('yukikaze')).steel);
    expect(buildShip(built, IJN, byId('yukikaze'))).toBeNull();
    // Another nation's ship can't be built here.
    expect(buildShip(p, IJN, (usn.ships as IShipData[])[0])).toBeNull();
    expect(grantShip(built, IJN, 'yukikaze').ships).toEqual(['fubuki', 'yukikaze']);
  });

  it('first-clear reward: the cheapest unowned ship of the class, else of any class', () => {
    const owned = ['fubuki'];
    const dd = rewardShipFor(ShipClass.Destroyer, IJN, owned)!;
    expect(dd.shipClass).toBe(ShipClass.Destroyer);
    expect(owned).not.toContain(dd.id);
    const allDd = IJN.filter((s) => s.shipClass === ShipClass.Destroyer).map((s) => s.id);
    expect(rewardShipFor(ShipClass.Destroyer, IJN, allDd)!.shipClass).not.toBe(ShipClass.Destroyer);
    expect(rewardShipFor(undefined, IJN, owned)).toBeUndefined();
    expect(rewardShipFor(ShipClass.Destroyer, IJN, IJN.map((s) => s.id))).toBeUndefined();
    // Never a fictional design.
    expect(rewardShipFor(ShipClass.Battleship, IJN, IJN.filter((s) => !s.fictional && s.id !== 'kongo').map((s) => s.id))?.id).toBe('kongo');
  });
});
