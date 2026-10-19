import { describe, it, expect } from 'vitest';
import { assignShips, BASES, baseReaches, basesFor, currentBaseId, isAtCurrentBase, nationBases, recallShips, shipBaseOf } from '@/systems/BaseSystem';
import { START_DOCKS, baseDockView, dockCount, mergeBaseDocks, startRepair, setDamage } from '@/systems/DockSystem';
import { sortieBlockers } from '@/systems/ProgressionSystem';
import { buildsHere, startBuild } from '@/systems/ShipyardSystem';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import { ALL_MISSIONS_DONE } from '@/systems/RankSystem';
import { emptySave, IProgress, progressView, switchNation } from '@/utils/ProgressStore';
import { runMigrations } from '@/utils/SaveMigration';
import { resources } from '@/systems/ResourceSystem';
import { Nation } from '@/types/Nation';
import { IShipData } from '@/types/Ship';
import campaign from '@/data/campaign.json';
import ijn from '@/data/ships/ijn.json';

const T0 = 1_700_000_000_000;
const IJN = ijn.ships as IShipData[];
const byId = (id: string): IShipData => IJN.find((s) => s.id === id)!;
/** A 大佐 IJN admiral at 呉 with two ships at 横須賀 and one at 呉. */
const admiral = (patch: Partial<IProgress> = {}): IProgress => ({
  ...progressView(switchNation(emptySave(), Nation.IJN, 'fubuki', T0)),
  merit: 900, rankStats: ALL_MISSIONS_DONE, base: 'ijn_heavy', resources: resources({ fuel: 5000, ammo: 5000, steel: 5000, bauxite: 5000 }),
  ships: ['fubuki', 'yukikaze', 'nagato'], shipBases: { fubuki: 'ijn_home', yukikaze: 'ijn_home', nagato: 'ijn_heavy' },
  ...patch,
});

describe('ships, docks and builds by base (#145)', () => {
  it('a new nation keeps its starter at its first base', () => {
    const p = progressView(switchNation(emptySave(), Nation.USN, 'fletcher', T0));
    expect(p.shipBases).toEqual({ fletcher: 'usn_home' });
    expect(currentBaseId(p)).toBe('usn_home');
  });

  it('ships belong to a base; only the current base sails them, others are brought over for fuel', () => {
    const p = admiral();
    expect(shipBaseOf(p, 'fubuki')).toBe('ijn_home');
    expect(isAtCurrentBase(p, 'nagato')).toBe(true);
    expect(isAtCurrentBase(p, 'fubuki')).toBe(false);
    expect(sortieBlockers(p, [byId('fubuki')], T0, { exercise: true })[0]).toContain('他の軍港に所属');
    const moved = assignShips(p, ['fubuki'], currentBaseId(p));
    expect(sortieBlockers(moved, [byId('fubuki')], T0, { exercise: true })).toEqual([]);
  });

  it('recalls ships for free, a whole preset at once, leaving those out on a sortie or in a dock (#191)', () => {
    const p = admiral({ docks: [{ shipId: 'yukikaze', endsAt: T0 + 1000, base: 'ijn_home' }] });
    const r = recallShips(p, ['fubuki', 'yukikaze', 'nagato', 'unknown'], currentBaseId(p), []);
    expect(r.moved).toEqual(['fubuki']);
    expect(r.held).toEqual(['yukikaze']);
    expect(shipBaseOf(r.progress, 'fubuki')).toBe(currentBaseId(p));
    expect(r.progress.resources).toEqual(p.resources);
    expect(recallShips(p, ['fubuki'], currentBaseId(p), ['fubuki']).held).toEqual(['fubuki']);
  });

  it('each base has its own repair docks', () => {
    let p = admiral({ baseDocks: { ijn_home: 2 }, docks: [{ shipId: 'fubuki', endsAt: T0 + 1000, base: 'ijn_home' }] });
    p = { ...p, ...setDamage(p, 'nagato', 0.5) };
    const here = baseDockView(p, 'ijn_heavy');
    expect(dockCount(here)).toBe(START_DOCKS);
    expect(here.docks).toEqual([]);
    const docked = startRepair(here, 'nagato', 690, T0)!;
    const merged = mergeBaseDocks(p, 'ijn_heavy', { ...p, ...docked });
    expect(merged.docks.map((d) => [d.shipId, d.base])).toEqual([['fubuki', 'ijn_home'], ['nagato', 'ijn_heavy']]);
    expect(merged.baseDocks).toEqual({ ijn_home: 2, ijn_heavy: START_DOCKS });
    expect(dockCount(baseDockView(merged, 'ijn_home'))).toBe(2);
  });

  it('builds use the current base slips and join that base', () => {
    const p = startBuild(admiral({ research: ['build_cruiser'] }), IJN, byId('etorofu'), T0)!;
    expect(p.builds[0].base).toBe('ijn_heavy');
    expect(buildsHere(p)).toHaveLength(1);
    expect(buildsHere({ ...p, base: 'ijn_home' })).toHaveLength(0);
  });

  it('every nation reaches its first theater from its first base and every theater by 少尉', () => {
    for (const nation of PLAYABLE_NATIONS) {
      const theaters = campaign.theaters.filter((t) => (t.opponents as Record<string, string | undefined>)[nation]).map((t) => t.id);
      const bases = nationBases(nation);
      expect(bases[0].theaters?.length, nation).toBeGreaterThan(0);
      for (const t of theaters) expect(bases.filter((b) => b.unlockRank <= 2).some((b) => baseReaches(b, t)), `${nation} ${t}`).toBe(true);
    }
    expect(basesFor('IJN', 'mediterranean').map((b) => b.id)).toContain('ijn_light');
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
