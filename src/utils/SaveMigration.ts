/**
 * Step-by-step save migrations (#60, pure). Each step turns a stored save of version n into version n + 1, working
 * on the raw JSON object before it is parsed, so a change to the save format is one function appended here plus a
 * test with an old save. Steps must never drop owned ships, captains, resources or progress.
 *
 * Version 2 (the per-nation save, #27) is where the steps begin; v1 saves are first converted to v2 by
 * ProgressStore.migrateV1 and then run through the same steps.
 */

export type RawSave = Record<string, unknown>;
/** Turns a raw save of version `n` into version `n + 1` (the version field is set by the runner). */
export type MigrationStep = (data: RawSave) => RawSave;

/** The first version the steps start from. */
export const FIRST_VERSION = 2;

/**
 * MIGRATIONS[i] migrates version FIRST_VERSION + i → FIRST_VERSION + i + 1. Append new steps at the end; never
 * reorder or edit a released one.
 */
export const MIGRATIONS: MigrationStep[] = [
  // v2 → v3 (#37): cruiser research split into light and heavy; whoever could build cruisers keeps both.
  (data) => mapNations(data, (nation) => {
    const research = Array.isArray(nation.research) ? nation.research : [];
    return research.includes('build_cruiser') && !research.includes('build_heavy_cruiser')
      ? { ...nation, research: [...research, 'build_heavy_cruiser'] }
      : nation;
  }),
];

/** Applies `fn` to every nation slot of a raw v2+ save, leaving anything malformed alone. */
function mapNations(data: RawSave, fn: (nation: RawSave) => RawSave): RawSave {
  const nations = data.nations;
  if (typeof nations !== 'object' || nations === null || Array.isArray(nations)) return data;
  const out: RawSave = {};
  for (const [key, value] of Object.entries(nations as RawSave)) {
    out[key] = typeof value === 'object' && value !== null && !Array.isArray(value) ? fn(value as RawSave) : value;
  }
  return { ...data, nations: out };
}

/** The version written by this build. */
export const LATEST_VERSION = FIRST_VERSION + MIGRATIONS.length;

/** The stored version of a raw save (missing or malformed counts as FIRST_VERSION). */
export function versionOf(data: RawSave): number {
  const v = data.version;
  return typeof v === 'number' && Number.isInteger(v) && v >= FIRST_VERSION ? v : FIRST_VERSION;
}

/**
 * Runs every step from the save's version up to the latest. A save from a newer build (version above the latest)
 * is passed through untouched, so the parser keeps whatever it still understands.
 */
export function runMigrations(data: RawSave, steps: MigrationStep[] = MIGRATIONS): RawSave {
  const latest = FIRST_VERSION + steps.length;
  const from = versionOf(data);
  if (from >= latest) return data;
  let out = data;
  for (let v = from; v < latest; v++) out = { ...steps[v - FIRST_VERSION](out), version: v + 1 };
  return out;
}
