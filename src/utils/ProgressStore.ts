/**
 * Player progress that survives reloads (save v2, #27). One save holds a separate progress slot per nation
 * (resources, docks, research, owned ships, ...) plus what is shared by all of them (the service record and
 * medals; settings live in their own key). Scenes work on an `IProgress` *view*: the current nation's slot plus
 * the shared record, so `loadProgress()` / `saveProgress()` read and write the nation being played.
 *
 * Stored in localStorage when available; every access is guarded so a blocked or missing storage only loses
 * persistence. Saves from before v2 (one flat progress object) are migrated into the IJN slot; later format changes
 * are step-by-step migrations in SaveMigration (#60).
 */

import { IDockJob, IResources } from '@/types/Progression';
import { Nation } from '@/types/Nation';
import { LEGACY_STARTING_RESOURCES, regenerate, resources, STARTING_RESOURCES } from '@/systems/ResourceSystem';
import { emptyRecord, parseRecord } from '@/systems/RecordSystem';
import { IServiceRecord } from '@/types/Record';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import ijnShips from '@/data/ships/ijn.json';
import { FIRST_VERSION, LATEST_VERSION, runMigrations } from './SaveMigration';
import { IFleetPreset, PRESET_COUNT } from '@/systems/PresetSystem';
import { Formation } from '@/types/Formation';
import { ICaptainStats } from '@/systems/CaptainSystem';
import { nationCaptains, starterCaptain } from '@/systems/CaptainRoster';
import { addBackup, BACKUP_KEY, BackupReason, ISaveBackup, parseBackups, rawVersion } from './SaveBackup';

export const STORAGE_KEY = 'ww2fleet.progress.v2';
/** The v1 key is read (never written or deleted) to migrate old saves. */
export const LEGACY_STORAGE_KEY = 'ww2fleet.progress.v1';
export const SAVE_VERSION = LATEST_VERSION;

/** Everything one nation's admiral has built up. */
export interface INationProgress {
  resources: IResources;
  /** Epoch ms the next natural regeneration tick counts from (0 = not started yet) */
  regenAt: number;
  /** Ship id → HP fraction it came home with (absent = undamaged) */
  damage: Record<string, number>;
  docks: IDockJob[];
  /** Finished research ids */
  research: string[];
  /** Owned ship ids (#18): what the Fleet Builder offers for campaign and free battles */
  ships: string[];
  /** Ship id → fitted upgrade ids */
  upgrades: Record<string, string[]>;
  /** Ship id → refit stage (0 = original) */
  refits: Record<string, number>;
  /** Ship id → crew proficiency 0..100 */
  proficiency: Record<string, number>;
  /** Captain id → total XP */
  captainXp: Record<string, number>;
  /** Cleared campaign area ids (rank exams and first-clear rewards) */
  campaign: string[];
  /** Merit (戦功): the admiral's rank comes from it (#36) */
  merit: number;
  /** Lowest rank index held whatever the merit (saves from before #36 keep their slots) */
  rankFloor: number;
  /** Repair docks built (#38): 1 at the start, up to DockSystem.MAX_DOCKS */
  docksOwned: number;
  /** Captain ids this nation has (#44); only these can be assigned */
  captains: string[];
  /** Captain id → learned skills (#45), on top of the captain's own speciality */
  captainSkills: Record<string, string[]>;
  /** Captain id → what traits count (#45) */
  captainStats: Record<string, ICaptainStats>;
  /** Saved fleet setups (#33); null = unused */
  presets: (IFleetPreset | null)[];
}

/** The whole save (v2 and later). */
export interface ISave {
  version: number;
  /** Nation being played; its slot may not exist yet (a brand-new save still has to pick one) */
  current: Nation;
  nations: Partial<Record<Nation, INationProgress>>;
  /** Career totals and medals, shared by every nation */
  record: IServiceRecord;
  /** First-play tutorial (#90), shared by every nation */
  tutorial: ITutorialState;
}

export interface ITutorialState {
  /** Index of the current step (TutorialSystem.TUTORIAL_STEPS) */
  step: number;
  /** Finished or skipped: no more guidance */
  done: boolean;
  /** The finishing reward (and supply) was already paid: a replay from ヘルプ pays nothing */
  rewarded?: boolean;
}

/** What scenes work with: the current nation's progress plus the shared record. */
export interface IProgress extends INationProgress {
  nation: Nation;
  record: IServiceRecord;
}

export function emptyNationProgress(ships: string[] = [], captains: string[] = []): INationProgress {
  return {
    resources: { ...STARTING_RESOURCES }, regenAt: 0, damage: {}, docks: [], research: [], ships: [...ships],
    upgrades: {}, refits: {}, proficiency: {}, captainXp: {}, campaign: [], presets: [],
    merit: 0, rankFloor: 0, docksOwned: 1, captains: [...captains], captainSkills: {}, captainStats: {},
  };
}

export function emptySave(): ISave {
  return { version: SAVE_VERSION, current: PLAYABLE_NATIONS[0] ?? Nation.IJN, nations: {}, record: emptyRecord(), tutorial: { step: 0, done: false } };
}

// ---------------------------------------------------------------------------
// Accessors (pure)
// ---------------------------------------------------------------------------

export function isStarted(save: ISave, nation: Nation): boolean {
  return save.nations[nation] !== undefined;
}

/** Nations with a progress slot, in PLAYABLE_NATIONS order (then any others). */
export function startedNations(save: ISave): Nation[] {
  const all = [...PLAYABLE_NATIONS, ...Object.values(Nation).filter((n) => !PLAYABLE_NATIONS.includes(n))];
  return all.filter((n) => isStarted(save, n));
}

/** The current nation's progress (an empty one if it has not been started). */
export function currentNation(save: ISave): INationProgress {
  return save.nations[save.current] ?? emptyNationProgress();
}

/** The scene-facing view of `save`; with `now`, natural regeneration up to that time is applied. */
export function progressView(save: ISave, now?: number): IProgress {
  const np = currentNation(save);
  const view: IProgress = { ...np, nation: save.current, record: save.record };
  if (now === undefined) return view;
  const r = regenerate(view.resources, view.regenAt, now);
  return r.resources === view.resources && r.regenAt === view.regenAt ? view : { ...view, resources: r.resources, regenAt: r.regenAt };
}

/** Writes a view back into its nation's slot (and the shared record). */
export function withProgress(save: ISave, progress: IProgress): ISave {
  const { nation, record, ...np } = progress;
  return { ...save, nations: { ...save.nations, [nation]: np }, record };
}

/**
 * Makes `nation` the current one. A nation played for the first time gets a fresh slot (#18 / #28): no
 * resources, and only `starterId` (its starter destroyer) in the fleet; regeneration starts at `now`.
 */
export function switchNation(save: ISave, nation: Nation, starterId: string | undefined, now: number): ISave {
  if (isStarted(save, nation)) return { ...save, current: nation };
  const captain = starterCaptain(nation);
  const slot: INationProgress = { ...emptyNationProgress(starterId ? [starterId] : [], captain ? [captain.id] : []), regenAt: now };
  return { ...save, current: nation, nations: { ...save.nations, [nation]: slot } };
}

// ---------------------------------------------------------------------------
// Parsing and migration
// ---------------------------------------------------------------------------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const NATIONS = new Set<string>(Object.values(Nation));
const isNation = (v: unknown): v is Nation => typeof v === 'string' && NATIONS.has(v);

function numbers(src: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObject(src)) for (const [id, v] of Object.entries(src)) if (isNum(v)) out[id] = v;
  return out;
}

function strings(src: unknown): string[] {
  return (Array.isArray(src) ? src : []).filter((id): id is string => typeof id === 'string');
}

/** One nation's progress from stored JSON, ignoring anything malformed. */
function parseNation(data: Record<string, unknown>, defaultResources: IResources): INationProgress {
  const upgrades: Record<string, string[]> = {};
  if (isObject(data.upgrades)) {
    for (const [id, list] of Object.entries(data.upgrades)) {
      if (Array.isArray(list)) upgrades[id] = list.filter((u): u is string => typeof u === 'string');
    }
  }
  const r = isObject(data.resources) ? data.resources : null;
  const res = r
    ? resources({ fuel: isNum(r.fuel) ? r.fuel : 0, ammo: isNum(r.ammo) ? r.ammo : 0, steel: isNum(r.steel) ? r.steel : 0, bauxite: isNum(r.bauxite) ? r.bauxite : 0 })
    : { ...defaultResources };
  const damage: Record<string, number> = {};
  for (const [id, f] of Object.entries(numbers(data.damage))) damage[id] = Math.min(1, Math.max(0, f));
  const docks = (Array.isArray(data.docks) ? data.docks : []).filter(
    (d): d is IDockJob => isObject(d) && typeof d.shipId === 'string' && isNum(d.endsAt),
  );
  return {
    resources: res,
    regenAt: isNum(data.regenAt) ? data.regenAt : 0,
    damage,
    docks,
    research: strings(data.research),
    ships: [...new Set(strings(data.ships))],
    upgrades,
    refits: numbers(data.refits),
    proficiency: numbers(data.proficiency),
    captainXp: numbers(data.captainXp),
    campaign: strings(data.campaign),
    presets: (Array.isArray(data.presets) ? data.presets : []).slice(0, PRESET_COUNT).map(parsePreset),
    merit: isNum(data.merit) ? Math.max(0, data.merit) : 0,
    rankFloor: isNum(data.rankFloor) ? Math.max(0, Math.round(data.rankFloor)) : 0,
    docksOwned: isNum(data.docksOwned) ? Math.max(1, Math.round(data.docksOwned)) : 1,
    // A save without the list keeps every captain (filled in per nation by the caller).
    captains: Array.isArray(data.captains) ? [...new Set(strings(data.captains))] : [],
    captainSkills: stringLists(data.captainSkills),
    captainStats: parseCaptainStats(data.captainStats),
  };
}

function stringLists(src: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (isObject(src)) for (const [id, list] of Object.entries(src)) if (Array.isArray(list)) out[id] = strings(list);
  return out;
}

function parseCaptainStats(src: unknown): Record<string, ICaptainStats> {
  const out: Record<string, ICaptainStats> = {};
  if (!isObject(src)) return out;
  for (const [id, v] of Object.entries(src)) {
    if (!isObject(v)) continue;
    const n = (x: unknown): number => (isNum(x) ? Math.max(0, x) : 0);
    out[id] = { nightSinks: n(v.nightSinks), subSinks: n(v.subSinks), heavySurvivals: n(v.heavySurvivals) };
  }
  return out;
}

const FORMATIONS = new Set<string>(Object.values(Formation));

function idOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parsePreset(v: unknown): IFleetPreset | null {
  if (!isObject(v) || !Array.isArray(v.slotIds)) return null;
  return {
    slotIds: v.slotIds.map(idOrNull),
    captainIds: (Array.isArray(v.captainIds) ? v.captainIds : []).map(idOrNull),
    formation: typeof v.formation === 'string' && FORMATIONS.has(v.formation) ? (v.formation as Formation) : Formation.LineAhead,
  };
}

/** Every IJN ship id at the time of migration (fictional ones stay gated by research in the Fleet Builder). */
function legacyIjnFleet(): string[] {
  return (ijnShips as { ships: Array<{ id: string }> }).ships.map((s) => s.id);
}

/**
 * v1 (one flat progress object, every nation's ships usable) → v2: everything goes into the IJN slot, which owns
 * the whole IJN roster so an existing player loses nothing. Other nations start fresh when first picked.
 */
export function migrateV1(data: Record<string, unknown>): ISave {
  const ijn = parseNation(data, LEGACY_STARTING_RESOURCES);
  return {
    version: FIRST_VERSION,
    current: Nation.IJN,
    nations: { [Nation.IJN]: { ...ijn, ships: legacyIjnFleet() } },
    record: parseRecord(data.record),
    tutorial: { step: 0, done: true },
  };
}

function parseLatest(data: Record<string, unknown>): ISave {
  const nations: Partial<Record<Nation, INationProgress>> = {};
  if (isObject(data.nations)) {
    for (const [key, value] of Object.entries(data.nations)) {
      if (!isNation(key) || !isObject(value)) continue;
      const np = parseNation(value, STARTING_RESOURCES);
      // Never fewer captains than the nation could use before #44.
      nations[key] = Array.isArray(value.captains) ? np : { ...np, captains: nationCaptains(key).map((c) => c.id) };
    }
  }
  return {
    version: SAVE_VERSION,
    current: isNation(data.current) ? data.current : emptySave().current,
    nations,
    record: parseRecord(data.record),
    tutorial: parseTutorial(data.tutorial),
  };
}

/** A stored save without tutorial state is an existing player's: the tutorial counts as done. */
function parseTutorial(v: unknown): ITutorialState {
  if (!isObject(v)) return { step: 0, done: true };
  return { step: isNum(v.step) ? Math.max(0, Math.round(v.step)) : 0, done: v.done === true, ...(v.rewarded === true ? { rewarded: true } : {}) };
}

/** True for a per-nation save (v2 or later); anything else is read as a v1 save. */
export function isV2(data: Record<string, unknown>): boolean {
  return (isNum(data.version) && data.version >= FIRST_VERSION) || isObject(data.nations);
}

/** Parses a stored save of any version, migrating it to the latest and ignoring anything malformed. */
export function parseSave(raw: string | null): ISave {
  return parseSaveChecked(raw).save;
}

/** Like parseSave; `ok` is false when there was stored text that could not be read (a fresh save came back). */
export function parseSaveChecked(raw: string | null): { save: ISave; ok: boolean } {
  if (!raw) return { save: emptySave(), ok: true };
  try {
    const data: unknown = JSON.parse(raw);
    if (!isObject(data)) return { save: emptySave(), ok: false };
    const v2 = isV2(data) ? data : (migrateV1(data) as unknown as Record<string, unknown>);
    return { save: parseLatest(runMigrations(v2)), ok: true };
  } catch {
    return { save: emptySave(), ok: false };
  }
}

/** The current nation's view of a stored save (kept for callers and tests that only need one nation). */
export function parseProgress(raw: string | null): IProgress {
  return progressView(parseSave(raw));
}

export function emptyProgress(): IProgress {
  return progressView(emptySave());
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

let memory: ISave | null = null;

function read(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked.
  }
}

/** Keeps a copy of a raw stored save (see SaveBackup). */
function backup(raw: string, reason: BackupReason): void {
  const entry: ISaveBackup = { at: Date.now(), version: rawVersion(raw), reason, raw };
  write(BACKUP_KEY, JSON.stringify(addBackup(parseBackups(read(BACKUP_KEY)), entry)));
}

/**
 * Reads the stored save. A save from an older release is backed up before it is migrated, and one that can't be
 * read at all is backed up before a fresh save takes its place, so no release loses progress for good (設定 →
 * バックアップから復元).
 */
export function loadSave(): ISave {
  if (memory) return memory;
  const raw = read(STORAGE_KEY) ?? read(LEGACY_STORAGE_KEY);
  const { save, ok } = parseSaveChecked(raw);
  if (raw && !ok) backup(raw, 'broken');
  else if (raw && rawVersion(raw) < SAVE_VERSION) backup(raw, 'migration');
  memory = save;
  return memory;
}

/** Backs up the stored save (before an import or reset replaces it). */
export function backupStoredSave(reason: BackupReason): void {
  const raw = read(STORAGE_KEY);
  if (raw) backup(raw, reason);
}

export function listBackups(): ISaveBackup[] {
  return parseBackups(read(BACKUP_KEY));
}

/** Restores a backup (the current save is backed up first). Returns false when the backup can't be read. */
export function restoreBackup(b: ISaveBackup): boolean {
  const { save, ok } = parseSaveChecked(b.raw);
  if (!ok) return false;
  backupStoredSave('restore');
  saveSave(save);
  return true;
}

export function saveSave(save: ISave): void {
  memory = save;
  // Storage full or blocked: the in-memory copy still lasts this session.
  write(STORAGE_KEY, JSON.stringify(save));
}

/**
 * The current nation's progress with natural regeneration applied up to now. When regeneration changed
 * anything it is saved straight away, so the timer advances even on screens that never save.
 */
export function loadProgress(): IProgress {
  const save = loadSave();
  const view = progressView(save, Date.now());
  const np = save.nations[save.current];
  if (np && (view.regenAt !== np.regenAt || view.resources !== np.resources)) saveSave(withProgress(save, view));
  return view;
}

/** Saves a view into its own nation's slot (whichever nation is current). */
export function saveProgress(progress: IProgress): void {
  saveSave(withProgress(loadSave(), progress));
}

/** Drops the in-memory copy so the next load reads storage again (tests). */
export function resetProgressCache(): void {
  memory = null;
}
