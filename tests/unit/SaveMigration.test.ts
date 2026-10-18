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
