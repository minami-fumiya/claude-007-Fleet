import { describe, it, expect } from 'vitest';
import {
  currentNation, emptySave, isStarted, migrateV1, parseProgress, parseSave, progressView, SAVE_VERSION, startedNations,
  switchNation, withProgress,
} from '@/utils/ProgressStore';
import { LEGACY_STARTING_RESOURCES, REGEN_INTERVAL_MS, resources, STARTING_RESOURCES } from '@/systems/ResourceSystem';
import { Nation } from '@/types/Nation';
import ijn from '@/data/ships/ijn.json';

const T0 = 1_700_000_000_000;

describe('ProgressStore v2 (per-nation save, #27)', () => {
  it('a brand-new save has no nation started and an empty view', () => {
    const save = emptySave();
    expect(save.version).toBe(SAVE_VERSION);
    expect(startedNations(save)).toEqual([]);
    expect(isStarted(save, save.current)).toBe(false);
    const view = progressView(save);
    expect(view.resources).toEqual(STARTING_RESOURCES);
    expect(view.ships).toEqual([]);
  });

  it('starting a nation gives it one ship, no resources and a running regeneration timer', () => {
    const save = switchNation(emptySave(), Nation.USN, 'fletcher', T0);
    expect(save.current).toBe(Nation.USN);
    const np = currentNation(save);
    expect(np.ships).toEqual(['fletcher']);
    expect(np.resources).toEqual(resources());
    expect(np.regenAt).toBe(T0);
    // Switching back to a started nation keeps its progress.
    const back = switchNation(switchNation(save, Nation.KM, 'z1', T0), Nation.USN, 'ignored', T0 + 5);
    expect(currentNation(back).ships).toEqual(['fletcher']);
    expect(startedNations(back)).toEqual([Nation.USN, Nation.KM]);
  });

  it('nations progress in parallel: a view is written back into its own slot, the record is shared', () => {
    let save = switchNation(switchNation(emptySave(), Nation.IJN, 'fubuki', T0), Nation.RN, 'cossack', T0);
    const rn = progressView(save);
    save = withProgress(save, { ...rn, resources: resources({ fuel: 99 }), campaign: ['m1'], record: { ...rn.record, sorties: 3 } });
    save = switchNation(save, Nation.IJN, undefined, T0);
    const ijnView = progressView(save);
    expect(ijnView.nation).toBe(Nation.IJN);
    expect(ijnView.resources.fuel).toBe(0);
    expect(ijnView.campaign).toEqual([]);
    expect(ijnView.record.sorties).toBe(3);
    expect(save.nations[Nation.RN]?.campaign).toEqual(['m1']);
  });

  it('the view applies natural regeneration up to now', () => {
    const save = switchNation(emptySave(), Nation.IJN, 'fubuki', T0);
    const later = progressView(save, T0 + 10 * REGEN_INTERVAL_MS + 5);
    expect(later.resources).toEqual({ fuel: 60, ammo: 40, steel: 40, bauxite: 10 });
    expect(later.regenAt).toBe(T0 + 10 * REGEN_INTERVAL_MS);
    // Saving the view and reading again at the same time changes nothing (idempotent).
    const again = progressView(withProgress(save, later), T0 + 10 * REGEN_INTERVAL_MS + 5);
    expect(again.resources).toEqual(later.resources);
  });

  it('migrates a v1 save into the IJN slot, owning the whole IJN roster', () => {
    const v1 = {
      captainXp: { c1: 50 }, upgrades: { yamato: ['boiler'] }, resources: { fuel: 900, ammo: 800, steel: 700, bauxite: 600 },
      damage: { yamato: 0.4 }, docks: [{ shipId: 'yamato', endsAt: 99 }], research: ['gunnery_1', 'engine_1', 'fictional_ships'],
      campaign: ['p1', 'p2', 'a1'], proficiency: { yamato: 40 }, refits: { yamato: 1 }, record: { sorties: 12, medals: ['first_victory'] },
    };
    const save = parseSave(JSON.stringify(v1));
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.current).toBe(Nation.IJN);
    expect(startedNations(save)).toEqual([Nation.IJN]);
    const np = save.nations[Nation.IJN]!;
    expect(np.resources).toEqual(v1.resources);
    expect(np.campaign).toEqual(v1.campaign);
    expect(np.research).toEqual(v1.research);
    expect(np.upgrades).toEqual(v1.upgrades);
    expect(np.docks).toEqual(v1.docks);
    expect(np.refits).toEqual(v1.refits);
    expect(np.captainXp).toEqual(v1.captainXp);
    // Every IJN ship, fictional ones included (they stay gated by research in the Fleet Builder).
    expect(np.ships).toEqual(ijn.ships.map((s) => s.id));
    expect(save.record.sorties).toBe(12);
    expect(save.record.medals).toEqual(['first_victory']);
  });

  it('a v1 save without resources (pre-Sprint 6) keeps the old starting resources', () => {
    expect(migrateV1({}).nations[Nation.IJN]?.resources).toEqual(LEGACY_STARTING_RESOURCES);
  });

  it('round-trips v2 through JSON and tolerates malformed v2 data', () => {
    const save = switchNation(switchNation(emptySave(), Nation.IJN, 'fubuki', T0), Nation.KM, 'z1', T0);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    const bad = parseSave(JSON.stringify({
      version: 2, current: 'XX', record: 5,
      nations: { IJN: { resources: { fuel: 'x', ammo: 3 }, ships: ['a', 1, 'a'], regenAt: 'y', docks: [{ shipId: 1 }] }, XX: {}, KM: 7 },
    }));
    expect(bad.current).toBe(emptySave().current);
    expect(Object.keys(bad.nations)).toEqual([Nation.IJN]);
    const np = bad.nations[Nation.IJN]!;
    expect(np.resources).toEqual(resources({ ammo: 3 }));
    expect(np.ships).toEqual(['a']);
    expect(np.regenAt).toBe(0);
    expect(np.docks).toEqual([]);
    expect(bad.record.sorties).toBe(0);
  });

  it('parseProgress returns the current nation view of either version', () => {
    expect(parseProgress(null).ships).toEqual([]);
    expect(parseProgress('[1]').nation).toBe(emptySave().current);
    const save = switchNation(emptySave(), Nation.RN, 'cossack', T0);
    expect(parseProgress(JSON.stringify(save)).ships).toEqual(['cossack']);
  });
});
