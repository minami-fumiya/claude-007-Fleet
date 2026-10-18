import { describe, it, expect } from 'vitest';
import { FIRST_VERSION, LATEST_VERSION, MigrationStep, MIGRATIONS, RawSave, runMigrations, versionOf } from '@/utils/SaveMigration';
import { emptySave, parseSave, SAVE_VERSION, switchNation } from '@/utils/ProgressStore';
import { Nation } from '@/types/Nation';

const T0 = 1_700_000_000_000;

/** Two made-up steps: v2 → v3 adds a dock count, v3 → v4 renames a field. */
const steps: MigrationStep[] = [
  (d) => ({ ...d, docksOwned: 2 }),
  (d) => {
    const { docksOwned, ...rest } = d;
    return { ...rest, docks: docksOwned };
  },
];

describe('SaveMigration (#60)', () => {
  it('the save version written by this build is the last step', () => {
    expect(LATEST_VERSION).toBe(FIRST_VERSION + MIGRATIONS.length);
    expect(SAVE_VERSION).toBe(LATEST_VERSION);
    expect(emptySave().version).toBe(LATEST_VERSION);
  });

  it('runs every step from the stored version, in order, setting the version as it goes', () => {
    const out = runMigrations({ version: 2, ships: ['fubuki'] }, steps);
    expect(out).toEqual({ version: 4, ships: ['fubuki'], docks: 2 });
  });

  it('starts at the stored version, so a step is never applied twice', () => {
    const calls: number[] = [];
    const counted: MigrationStep[] = steps.map((s, i) => (d: RawSave) => {
      calls.push(i);
      return s(d);
    });
    runMigrations({ version: 3, docksOwned: 3 }, counted);
    expect(calls).toEqual([1]);
  });

  it('leaves latest and newer saves untouched', () => {
    const latest = { version: 4, a: 1 };
    expect(runMigrations(latest, steps)).toBe(latest);
    const future = { version: 9, a: 1 };
    expect(runMigrations(future, steps)).toBe(future);
  });

  it('a missing or malformed version counts as the first version', () => {
    expect(versionOf({})).toBe(FIRST_VERSION);
    expect(versionOf({ version: 'x' })).toBe(FIRST_VERSION);
    expect(versionOf({ version: 2.5 })).toBe(FIRST_VERSION);
    expect(versionOf({ version: 1 })).toBe(FIRST_VERSION);
    expect(runMigrations({ ships: [] }, steps).version).toBe(4);
  });

  it('current saves load through the migration path without losing anything', () => {
    const save = switchNation(switchNation(emptySave(), Nation.IJN, 'fubuki', T0), Nation.USN, 'fletcher', T0);
    const stored = JSON.stringify({ ...save, version: FIRST_VERSION });
    const loaded = parseSave(stored);
    expect(loaded.version).toBe(LATEST_VERSION);
    expect(loaded.nations[Nation.IJN]?.ships).toEqual(['fubuki']);
    expect(loaded.nations[Nation.USN]?.ships).toEqual(['fletcher']);
    expect(loaded.current).toBe(Nation.USN);
  });
});

describe('v2 → v3: light / heavy cruiser research (#37)', () => {
  it('a nation that could build cruisers keeps building heavy ones', () => {
    const v2 = {
      version: 2, current: 'IJN', record: {},
      nations: {
        IJN: { ships: ['fubuki', 'takao'], research: ['build_cruiser', 'gunnery_1'] },
        USN: { ships: ['fletcher'], research: [] },
      },
    };
    const save = parseSave(JSON.stringify(v2));
    expect(save.version).toBe(LATEST_VERSION);
    expect(save.nations[Nation.IJN]?.research).toEqual(['build_cruiser', 'gunnery_1', 'build_heavy_cruiser']);
    expect(save.nations[Nation.IJN]?.ships).toEqual(['fubuki', 'takao']);
    expect(save.nations[Nation.USN]?.research).toEqual([]);
  });

  it('is idempotent and tolerates malformed nations', () => {
    const step = MIGRATIONS[0];
    const once = step({ nations: { IJN: { research: ['build_cruiser'] }, KM: 7 } });
    expect(step(once)).toEqual(once);
    expect(step({ nations: 'x' })).toEqual({ nations: 'x' });
  });
});

describe('v3 → v4: upgrade slots come with remodelling (#72)', () => {
  it('unremodelled ships lose their upgrades; remodelled ones keep up to their slots', () => {
    const v3 = {
      version: 3, current: 'IJN', record: {},
      nations: { IJN: {
        research: ['engine_1', 'radar_1', 'aa_1'],
        ships: ['fubuki', 'takao', 'yamato'],
        refits: { takao: 1, yamato: 3 },
        upgrades: { fubuki: ['boiler', 'radar'], takao: ['boiler', 'radar', 'aa_guns'], yamato: ['boiler', 'radar'] },
      } },
    };
    const np = parseSave(JSON.stringify(v3)).nations[Nation.IJN]!;
    expect(np.upgrades).toEqual({ fubuki: [], takao: ['boiler', 'radar'], yamato: ['boiler', 'radar'] });
    expect(np.ships).toEqual(['fubuki', 'takao', 'yamato']);
  });

  it('upgrades whose research is missing come off (強装薬 needed none before)', () => {
    const v3 = {
      version: 3, current: 'IJN', record: {},
      nations: { IJN: { research: ['engine_1'], refits: { yamato: 3 }, upgrades: { yamato: ['heavy_shells', 'boiler'] } } },
    };
    expect(parseSave(JSON.stringify(v3)).nations[Nation.IJN]!.upgrades).toEqual({ yamato: ['boiler'] });
  });
});
