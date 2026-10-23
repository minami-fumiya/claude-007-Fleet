import { describe, it, expect } from 'vitest';
import { BASES, baseOfProgress, baseReaches, basesFor, buildMultiplier, currentBaseId, DISCOUNT_CAP, dockTotal, fleetBuildTimeMul, fleetDockView, mergeFleetDocks, nationBases, researchMultiplier, repairTimeMultiplier } from '@/systems/BaseSystem';
import { buildDock, MAX_DOCKS, dockCount, startRepair, setDamage } from '@/systems/DockSystem';
import { sortieBlockers } from '@/systems/ProgressionSystem';
import { buildsHere, startBuild } from '@/systems/ShipyardSystem';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import { ALL_MISSION_MEDALS, ALL_MISSIONS_DONE } from '@/systems/RankSystem';
import { emptySave, IProgress, progressView, switchNation } from '@/utils/ProgressStore';
import { emptyRecord } from '@/systems/RecordSystem';
import { runMigrations } from '@/utils/SaveMigration';
import { resources } from '@/systems/ResourceSystem';
import { Nation } from '@/types/Nation';
import { IShipData } from '@/types/Ship';
import { ShipClass } from '@/types/ShipClass';
import campaign from '@/data/campaign.json';
import ijn from '@/data/ships/ijn.json';

const T0 = 1_700_000_000_000;
const IJN = ijn.ships as IShipData[];
const byId = (id: string): IShipData => IJN.find((s) => s.id === id)!;
/** A 大佐 IJN admiral at 呉 with two ships at 横須賀 and one at 呉. */
const admiral = (patch: Partial<IProgress> = {}): IProgress => ({
  ...progressView(switchNation(emptySave(), Nation.IJN, 'fubuki', T0)),
  // Every base built (#217), so the admiral can work from any of them.
  merit: 900, rankStats: ALL_MISSIONS_DONE, record: { ...emptyRecord(), medals: ALL_MISSION_MEDALS }, base: 'ijn_heavy', basesOpen: nationBases(Nation.IJN).map((b) => b.id), resources: resources({ fuel: 5000, ammo: 5000, steel: 5000, bauxite: 5000 }),
  ships: ['fubuki', 'yukikaze', 'nagato'], shipBases: { fubuki: 'ijn_home', yukikaze: 'ijn_home', nagato: 'ijn_heavy' },
  ...patch,
});

describe('ships, docks and builds by base (#145)', () => {
  it('a new nation keeps its starter at its first base', () => {
    const p = progressView(switchNation(emptySave(), Nation.USN, 'fletcher', T0));
    expect(p.shipBases).toEqual({ fletcher: 'usn_home' });
    expect(currentBaseId(p)).toBe('usn_home');
  });

  it('ships belong to no base since #281: any owned ship sails', () => {
    const p = admiral();
    expect(sortieBlockers(p, [byId('fubuki'), byId('nagato')], T0, { exercise: true })).toEqual([]);
  });

  it('every open base works at once: discounts add up to their caps (#281)', () => {
    const one = admiral({ basesOpen: [] });
    const all = admiral();
    // Only the first base: its repair bonus; every base: each base's bonus at once.
    expect(repairTimeMultiplier(baseOfProgress(one))).toBeLessThan(1);
    expect(buildMultiplier(baseOfProgress(one), ShipClass.Destroyer)).toBe(1);
    expect(buildMultiplier(baseOfProgress(all), ShipClass.Destroyer)).toBeLessThan(1);
    expect(buildMultiplier(baseOfProgress(all), ShipClass.Battleship)).toBeLessThan(1);
    expect(researchMultiplier(baseOfProgress(all))).toBeLessThan(1);
    // Facilities raise them, never past the caps.
    const maxed = admiral({ facilities: Object.fromEntries(nationBases(Nation.IJN).map((b) => [b.id, { unique: 3, workshop: 5 }])) });
    for (const c of Object.values(ShipClass)) expect(buildMultiplier(baseOfProgress(maxed), c)).toBeGreaterThanOrEqual(1 - DISCOUNT_CAP.build);
    expect(researchMultiplier(baseOfProgress(maxed))).toBeCloseTo(1 - DISCOUNT_CAP.research);
    expect(repairTimeMultiplier(baseOfProgress(maxed))).toBeGreaterThanOrEqual(1 - DISCOUNT_CAP.repair);
    expect(fleetBuildTimeMul(maxed)).toBeCloseTo(1 - DISCOUNT_CAP.buildTime);
    // The workshops of every open base add up; a closed base's does not count.
    const shops = { ijn_home: { workshop: 2 }, ijn_heavy: { workshop: 2 } };
    expect(fleetBuildTimeMul(admiral({ facilities: shops }))).toBeCloseTo(0.8);
    expect(fleetBuildTimeMul(admiral({ facilities: shops, basesOpen: [] }))).toBeCloseTo(0.9);
  });

  it('the docks of every open base are one pool, up to eight (#281)', () => {
    let p = admiral({ basesOpen: [], baseDocks: { ijn_home: 2 }, docks: [{ shipId: 'fubuki', endsAt: T0 + 1000, base: 'ijn_heavy' }] });
    expect(dockTotal(p)).toBe(2);
    // Opening a base adds its dock; a repair started anywhere fills the pool.
    p = { ...p, basesOpen: ['ijn_light'] };
    expect(dockTotal(p)).toBe(3);
    p = { ...p, ...setDamage(p, 'nagato', 0.5) };
    const view = fleetDockView(p);
    expect(dockCount(view)).toBe(3);
    const docked = startRepair(view, 'nagato', 690, T0)!;
    const merged = mergeFleetDocks(p, { ...p, ...docked });
    expect(merged.docks.map((d) => d.shipId)).toEqual(['fubuki', 'nagato']);
    expect(merged.baseDocks).toEqual(p.baseDocks);
    // A new dock goes on the first base.
    const built = buildDock(fleetDockView(p))!;
    expect(mergeFleetDocks(p, built).baseDocks).toEqual({ ijn_home: 3 });
    expect(dockTotal(admiral({ baseDocks: Object.fromEntries(nationBases(Nation.IJN).map((b) => [b.id, 8])) }))).toBe(MAX_DOCKS);
  });

  it('builds share the pooled docks wherever they were laid down', () => {
    const p = startBuild(admiral({ research: ['build_cruiser'] }), IJN, byId('mutsuki'), T0)!;
    expect(buildsHere(p)).toHaveLength(1);
    expect(buildsHere({ ...p, builds: [...p.builds, { shipId: 'kongo', endsAt: T0, base: 'ijn_light' }] })).toHaveLength(2);
  });

  it('each base opens one theater of its navy, none twice, every theater by some base (#293)', () => {
    for (const nation of PLAYABLE_NATIONS) {
      const theaters = campaign.theaters.filter((t) => (t.opponents as Record<string, string | undefined>)[nation]).map((t) => t.id);
      const bases = nationBases(nation);
      for (const b of bases) expect(b.theaters, b.id).toHaveLength(1);
      const opened = bases.map((b) => b.theaters![0]);
      expect(new Set(opened).size, nation).toBe(opened.length);
      expect([...opened].sort(), nation).toEqual([...theaters].sort());
      // The same rank for the same place in every navy's order.
      expect(bases.map((b) => b.unlockRank), nation).toEqual([0, 2, 6, 8, 10, 11].slice(0, bases.length));
    }
    expect(basesFor('IJN', 'mediterranean').map((b) => b.id)).toEqual(['ijn_heavy']);
    expect(BASES.every((b) => b.theaters?.length)).toBe(true);
  });

  it('an old save puts every ship, dock and job at the base in use', () => {
    const out = runMigrations({
      version: 10,
      nations: { IJN: { ships: ['fubuki', 'nagato'], base: 'ijn_light', merit: 200, rankFloor: 2, docksOwned: 3, docks: [{ shipId: 'nagato', endsAt: 5 }], builds: [{ shipId: 'kongo', endsAt: 9 }] } },
    }) as { nations: { IJN: { shipBases: object; baseDocks: object; docks: Array<{ base: string }>; builds: Array<{ base: string }> } } };
    expect(out.nations.IJN.shipBases).toEqual({ fubuki: 'ijn_light', nagato: 'ijn_light' });
    // 3 docks, plus the one building slip it had (#211: builds share the docks since v14).
    expect(out.nations.IJN.baseDocks).toEqual({ ijn_light: 4 });
    expect(out.nations.IJN.docks[0].base).toBe('ijn_light');
    expect(out.nations.IJN.builds[0].base).toBe('ijn_light');
  });
});
