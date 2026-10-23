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

import { IDockJob, IItems, IResources, IWallet } from '@/types/Progression';
import { BattleRank, isBattleRank } from '@/systems/BattleRank';
import { rankOf, type RankStat } from '@/systems/RankSystem';
import { awardEarnedMedals } from './MedalContext';
import { ISortieState } from '@/types/Sortie';
import { IBaseWork, nationBases } from '@/systems/BaseSystem';
import { completeTimers, finishBuilds } from '@/systems/TimerSystem';
import { Facilities, FacilityId, IFacilityJob, regenRules } from '@/systems/FacilitySystem';
import { INCOME, Ledger, LedgerCategory, recordLedger, resourceDelta } from '@/systems/LedgerSystem';
import { Nation } from '@/types/Nation';
import { LEGACY_STARTING_RESOURCES, regenerate, resources, STARTING_RESOURCES } from '@/systems/ResourceSystem';
import { emptyRecord, parseRecord } from '@/systems/RecordSystem';
import { IServiceRecord } from '@/types/Record';
import { PLAYABLE_NATIONS } from '@/config/NationInfo';
import ijnShips from '@/data/ships/ijn.json';
import { EXISTING_PLAYER_HELP, FIRST_VERSION, LATEST_VERSION, runMigrations } from './SaveMigration';
import { IFleetPreset, PRESET_COUNT } from '@/systems/PresetSystem';
import { Formation } from '@/types/Formation';
import { ICaptainStats } from '@/systems/CaptainSystem';
import { nationCaptains, starterCaptain } from '@/systems/CaptainRoster';
import { addBackup, BACKUP_KEY, BackupReason, ISaveBackup, parseBackups, rawVersion } from './SaveBackup';
import { ISweepCharge, SWEEP_MAX } from '@/systems/SweepSystem';
import { emptyWallet, parseWallet } from '@/systems/GoldSystem';
import { emptyQuestState, IQuestState, parseQuestState } from '@/systems/QuestSystem';

export const STORAGE_KEY = 'ww2fleet.progress.v2';
/** The v1 key is read (never written or deleted) to migrate old saves. */
export const LEGACY_STORAGE_KEY = 'ww2fleet.progress.v1';
export const SAVE_VERSION = LATEST_VERSION;
/** A new nation starts with one of each time-saving item (#143). */
export const STARTING_ITEMS: IItems = { fastRepair: 1, fastBuild: 1, captainBook: 0, trainingManual: 0, supplyShip: 0 };

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
  /** Ship id → the branch chosen for its last remodel stage (#86); none = the standard stage */
  refitBranches: Record<string, string>;
  /** Ship id → crew proficiency 0..100 */
  proficiency: Record<string, number>;
  /** 士気 (#54): ship id → morale when last changed, and when (MoraleSystem.moraleOf for now) */
  morale: Record<string, number>;
  moraleAt: Record<string, number>;
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
  /** Skills carried over outside the learn slots (#185): 対空 for captains whose 航空 used to cover air defence */
  captainBonus: Record<string, string[]>;
  /** Captain id → what traits count (#45) */
  captainStats: Record<string, ICaptainStats>;
  /** Home port in use (#88); '' or unknown = the nation's first (see BaseSystem.currentBase) */
  base: string;
  /** 任務 progress (#52) */
  quests: IQuestState;
  /** Campaign areas won without losing a ship: they can be swept (#57) */
  perfect: string[];
  /** Banked sweeps by area (#181): up to SWEEP_MAX, one more an hour; an area opens at 0 on its first S */
  sweepCharges: Record<string, ISweepCharge>;
  /** Saved fleet setups (#33); null = unused */
  presets: (IFleetPreset | null)[];
  /** Ships under construction (#143): they join `ships` when finished */
  builds: IDockJob[];
  /** 高速修理材・高速建造材 (#143) */
  items: IItems;
  /** Best battle rank per campaign area (#149) */
  areaRanks: Record<string, BattleRank>;
  /** What the promotion missions count (#142) */
  rankStats: Partial<Record<RankStat, number>>;
  /** Resource income and spending by hour and category, last 24 hours (#137) */
  ledger: Ledger;
  /** The campaign sortie in progress, if any (#138): it can be continued after closing the game */
  sortie: ISortieState | null;
  /** Ship id → the base it belongs to (#145) */
  shipBases: Record<string, string>;
  /** Repair docks built per base (#145); a base without an entry has START_DOCKS */
  baseDocks: Record<string, number>;
  /** Facility levels per base (#146) */
  facilities: Facilities;
  /** Facilities being built or raised (#146) */
  facilityJobs: IFacilityJob[];
  /** Bases built beyond the nation's first (#217), and the one under construction */
  basesOpen: string[];
  baseWork: IBaseWork | null;
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
  /** Screens whose first-visit help was shown (#61) */
  seenHelp: string[];
  /** Newest clock time the game has seen (#89): a clock set back gets no event */
  lastSeenAt: number;
  /** ゴールドとショップ (#183), shared by every nation */
  wallet: IWallet;
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
  /** The shared purse (#183); a view built without one (tests) has none, read it through walletOf */
  wallet?: IWallet;
}

/** The purse of a view (#183), empty when it has none. */
export function walletOf(p: Pick<IProgress, 'wallet'>): IWallet {
  return p.wallet ?? emptyWallet();
}

export function emptyNationProgress(ships: string[] = [], captains: string[] = []): INationProgress {
  return {
    resources: { ...STARTING_RESOURCES }, regenAt: 0, damage: {}, docks: [], research: [], ships: [...ships],
    upgrades: {}, refits: {}, refitBranches: {}, proficiency: {}, morale: {}, moraleAt: {}, captainXp: {}, campaign: [], presets: [],
    merit: 0, rankFloor: 0, docksOwned: 1, captains: [...captains], captainSkills: {}, captainBonus: {}, captainStats: {}, base: '', quests: emptyQuestState(), perfect: [], sweepCharges: {},
    builds: [], items: { ...STARTING_ITEMS }, areaRanks: {}, rankStats: {}, ledger: {}, sortie: null, shipBases: {}, baseDocks: {}, facilities: {}, facilityJobs: [], basesOpen: [], baseWork: null,
  };
}

export function emptySave(): ISave {
  return { version: SAVE_VERSION, current: PLAYABLE_NATIONS[0] ?? Nation.IJN, nations: {}, record: emptyRecord(), tutorial: { step: 0, done: false }, seenHelp: [], lastSeenAt: 0, wallet: emptyWallet() };
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
  const view: IProgress = { ...np, nation: save.current, record: save.record, wallet: save.wallet };
  if (now === undefined) return view;
  // Every timer that ran out meanwhile (#310): repairs, builds, facilities (they set the regeneration rates and caps,
  // #146) and a base whose construction ended (#217).
  const built = completeTimers(view, now).progress;
  const r = regenerate(built.resources, built.regenAt, now, regenRules(built.facilities));
  // Natural regeneration goes into the ledger (#137).
  const regen = r.resources === built.resources && r.regenAt === built.regenAt
    ? built
    : { ...built, resources: r.resources, regenAt: r.regenAt, ledger: recordLedger(built.ledger, 'regen', resourceDelta(built.resources, r.resources).gained, now) };
  return regen;
}

/** Kept here for callers of the store; the timers live in TimerSystem (#310). */
export { finishBuilds };

/** Writes a view back into its nation's slot (and the shared record). */
export function withProgress(save: ISave, progress: IProgress): ISave {
  const { nation, record, wallet, ...np } = progress;
  // A rank reached is kept (#261): its medal mission is read from the shared record, which a nation's own slot lacks.
  const held = rankOf(progress).index;
  const floor = held > (np.rankFloor ?? 0) ? { rankFloor: held } : {};
  return { ...save, nations: { ...save.nations, [nation]: { ...np, ...floor } }, record, wallet: wallet ?? save.wallet };
}

/**
 * Makes `nation` the current one. A nation played for the first time gets a fresh slot (#18 / #28): no
 * resources, and only `starterId` (its starter destroyer) in the fleet; regeneration starts at `now`.
 */
export function switchNation(save: ISave, nation: Nation, starterId: string | undefined, now: number): ISave {
  if (isStarted(save, nation)) return { ...save, current: nation };
  const captain = starterCaptain(nation);
  // The starter belongs to the nation's first base (#145).
  const first = nationBases(nation)[0]?.id;
  const slot: INationProgress = {
    ...emptyNationProgress(starterId ? [starterId] : [], captain ? [captain.id] : []),
    regenAt: now,
    shipBases: starterId && first ? { [starterId]: first } : {},
  };
  return { ...save, current: nation, nations: { ...save.nations, [nation]: slot } };
}

/**
 * Resets one nation (#129): its slot goes, so picking it again starts it fresh (one destroyer, no resources).
 * Every other nation, the shared service record and the settings stay.
 */
export function resetNation(save: ISave, nation: Nation): ISave {
  if (!save.nations[nation]) return save;
  const nations = { ...save.nations };
  delete nations[nation];
  return { ...save, nations };
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
  const docks = parseJobs(data.docks);
  return {
    resources: res,
    regenAt: isNum(data.regenAt) ? data.regenAt : 0,
    damage,
    docks,
    research: strings(data.research),
    ships: [...new Set(strings(data.ships))],
    upgrades,
    refits: numbers(data.refits),
    refitBranches: stringMap(data.refitBranches),
    proficiency: numbers(data.proficiency),
    morale: numbers(data.morale),
    moraleAt: numbers(data.moraleAt),
    captainXp: numbers(data.captainXp),
    campaign: strings(data.campaign),
    presets: (Array.isArray(data.presets) ? data.presets : []).slice(0, PRESET_COUNT).map(parsePreset),
    merit: isNum(data.merit) ? Math.max(0, data.merit) : 0,
    rankFloor: isNum(data.rankFloor) ? Math.max(0, Math.round(data.rankFloor)) : 0,
    docksOwned: isNum(data.docksOwned) ? Math.max(1, Math.round(data.docksOwned)) : 1,
    // A save without the list keeps every captain (filled in per nation by the caller).
    captains: Array.isArray(data.captains) ? [...new Set(strings(data.captains))] : [],
    captainSkills: stringLists(data.captainSkills),
    captainBonus: stringLists(data.captainBonus),
    captainStats: parseCaptainStats(data.captainStats),
    base: typeof data.base === 'string' ? data.base : '',
    quests: parseQuestState(data.quests),
    perfect: [...new Set(strings(data.perfect))],
    sweepCharges: parseSweepCharges(data.sweepCharges),
    builds: parseJobs(data.builds),
    items: parseItems(data.items),
    areaRanks: parseAreaRanks(data.areaRanks),
    rankStats: numbers(data.rankStats),
    ledger: parseLedger(data.ledger),
    sortie: parseSortie(data.sortie),
    shipBases: stringMap(data.shipBases),
    baseDocks: numbers(data.baseDocks),
    facilities: parseFacilities(data.facilities),
    facilityJobs: parseFacilityJobs(data.facilityJobs),
    basesOpen: [...new Set(strings(data.basesOpen))],
    baseWork: isObject(data.baseWork) && typeof data.baseWork.base === 'string' && isNum(data.baseWork.endsAt) ? { base: data.baseWork.base, endsAt: data.baseWork.endsAt } : null,
  };
}

/** A stored sortie when it has the parts the flow needs; anything else counts as none. */
function parseSortie(v: unknown): ISortieState | null {
  if (!isObject(v) || typeof v.areaId !== 'string' || !Array.isArray(v.route) || !isNum(v.at) || !isNation(v.nation) || !isNation(v.enemyNation)) return null;
  const shipIds = strings(v.shipIds);
  if (shipIds.length === 0) return null;
  const captainIds = (Array.isArray(v.captainIds) ? v.captainIds : []).map((c) => (typeof c === 'string' ? c : null));
  const route = v.route.filter((n): n is ISortieState['route'][number] => isObject(n) && typeof n.kind === 'string');
  return {
    areaId: v.areaId, route, at: v.at, nation: v.nation, enemyNation: v.enemyNation, shipIds, captainIds,
    formation: (Object.values(Formation) as string[]).includes(v.formation as string) ? (v.formation as Formation) : Formation.LineAhead, fought: v.fought === true,
  };
}

function parseLedger(v: unknown): Ledger {
  const out: Ledger = {};
  if (!isObject(v)) return out;
  for (const [key, r] of Object.entries(v)) {
    if (!/^\d+:\w+$/.test(key) || !isObject(r)) continue;
    const n = (x: unknown): number => (isNum(x) ? Math.max(0, x) : 0);
    out[key] = { fuel: n(r.fuel), ammo: n(r.ammo), steel: n(r.steel), bauxite: n(r.bauxite) };
  }
  return out;
}

function parseAreaRanks(v: unknown): Record<string, BattleRank> {
  const out: Record<string, BattleRank> = {};
  if (isObject(v)) for (const [id, r] of Object.entries(v)) if (isBattleRank(r)) out[id] = r;
  return out;
}

function parseJobs(v: unknown): IDockJob[] {
  return (Array.isArray(v) ? v : [])
    .filter((d): d is IDockJob => isObject(d) && typeof d.shipId === 'string' && isNum(d.endsAt))
    .map((d) => (typeof d.base === 'string' ? { shipId: d.shipId, endsAt: d.endsAt, base: d.base } : { shipId: d.shipId, endsAt: d.endsAt }));
}

const FACILITY_IDS = new Set<string>(['fuelTank', 'ammoDepot', 'steelMill', 'airBase', 'workshop', 'unique']);

function parseFacilities(v: unknown): Facilities {
  const out: Facilities = {};
  if (!isObject(v)) return out;
  for (const [base, levels] of Object.entries(v)) {
    if (!isObject(levels)) continue;
    const row: Facilities[string] = {};
    for (const [id, lv] of Object.entries(levels)) if (FACILITY_IDS.has(id) && isNum(lv)) row[id as FacilityId] = Math.max(0, Math.floor(lv));
    out[base] = row;
  }
  return out;
}

function parseFacilityJobs(v: unknown): IFacilityJob[] {
  return (Array.isArray(v) ? v : [])
    .filter((j): j is IFacilityJob => isObject(j) && typeof j.base === 'string' && FACILITY_IDS.has(j.id as string) && isNum(j.level) && isNum(j.endsAt))
    .map((j) => ({ base: j.base, id: j.id, level: j.level, endsAt: j.endsAt }));
}

function stringMap(src: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isObject(src)) for (const [k, v] of Object.entries(src)) if (typeof v === 'string') out[k] = v;
  return out;
}

function parseItems(v: unknown): IItems {
  const o = isObject(v) ? v : {};
  const n = (x: unknown): number => (isNum(x) ? Math.max(0, Math.floor(x)) : 0);
  return { fastRepair: n(o.fastRepair), fastBuild: n(o.fastBuild), captainBook: n(o.captainBook), trainingManual: n(o.trainingManual), supplyShip: n(o.supplyShip) };
}

function parseSweepCharges(src: unknown): Record<string, ISweepCharge> {
  const out: Record<string, ISweepCharge> = {};
  if (!isObject(src)) return out;
  for (const [id, v] of Object.entries(src)) {
    if (!isObject(v)) continue;
    out[id] = { charges: isNum(v.charges) ? Math.max(0, Math.min(SWEEP_MAX, Math.floor(v.charges))) : SWEEP_MAX, at: isNum(v.at) ? v.at : 0 };
  }
  return out;
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
    out[id] = { nightSinks: n(v.nightSinks), subSinks: n(v.subSinks), sinks: n(v.sinks), heavySurvivals: n(v.heavySurvivals) };
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
    seenHelp: [...EXISTING_PLAYER_HELP],
    lastSeenAt: 0,
    wallet: emptyWallet(),
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
    // A save without the list is an existing player's: the screens they know are not explained again.
    seenHelp: Array.isArray(data.seenHelp) ? [...new Set(strings(data.seenHelp))] : [...EXISTING_PLAYER_HELP],
    lastSeenAt: isNum(data.lastSeenAt) ? data.lastSeenAt : 0,
    wallet: parseWallet(data.wallet),
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
  if (np && (view.regenAt !== np.regenAt || view.resources !== np.resources || view.builds !== np.builds || view.docks !== np.docks || view.quests !== np.quests || view.ledger !== np.ledger || view.facilityJobs !== np.facilityJobs || view.baseWork !== np.baseWork)) saveSave(withProgress(save, view));
  return view;
}

/**
 * Saves a view into its own nation's slot (whichever nation is current). With `category`, the change in resources
 * against what was stored goes into the ledger (#137): a gain for an income category, a cost for a spending one.
 */
export function saveProgress(progress: IProgress, category?: LedgerCategory, now = Date.now()): void {
  const save = loadSave();
  const before = save.nations[progress.nation]?.resources;
  // Medals earned by whatever just changed (a build, a facility, a quest …) are awarded on the spot (#92).
  saveSave(awardEarnedMedals(withProgress(save, category && before ? noteLedger(progress, category, before, now) : progress)).save);
}

/** Awards every medal the save has earned but not received yet (#92), e.g. from an older version's progress. */
export function awardPendingMedals(): void {
  const r = awardEarnedMedals(loadSave());
  if (r.medals.length > 0) saveSave(r.save);
}

/** Records the change from `before` to the progress's resources under `category` (#137). */
export function noteLedger<T extends { resources: IResources; ledger: Ledger }>(progress: T, category: LedgerCategory, before: IResources, now: number): T {
  const d = resourceDelta(before, progress.resources);
  return { ...progress, ledger: recordLedger(progress.ledger, category, INCOME.includes(category) ? d.gained : d.spent, now) };
}

/** Drops the in-memory copy so the next load reads storage again (tests). */
export function resetProgressCache(): void {
  memory = null;
}
