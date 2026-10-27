import baseData from '@/data/bases.json';
import campaignData from '@/data/campaign.json';
import { ShipClass } from '@/types/ShipClass';
import { CLASS_JA } from './EncyclopediaSystem';
export { scaleCost } from './ResourceSystem';
import { RANKS, rankOf, IRankProgress } from './RankSystem';
import { boostedBase, Facilities, facilityLevel } from './FacilitySystem';
import { canAfford, pay } from './ResourceSystem';
import { IResources } from '@/types/Progression';
import { dockCount, IDockState, MAX_DOCKS, START_DOCKS } from './DockSystem';

/**
 * 軍港 (#88, pure): each nation has five home ports, each with a bonus (cheaper building of some classes, cheaper
 * research, faster repairs) and the seas its sorties reach. Since 0.0.38 (#281) the admiral no longer moves between
 * them: every open base counts at once — their discounts add up (to a cap), their docks pool, their seas join.
 * Since #293 each base opens one new theater, the nearest sea first: a base is built once the rank of its place in the
 * order is reached and BASE_PREV_CLEARS areas of the previous base's theater are won, the same for every navy.
 */

export interface IBase {
  id: string;
  nation: string;
  name: string;
  /** Rank index needed to move here */
  unlockRank: number;
  /** Building these classes costs `mul` times as much */
  build?: { classes: ShipClass[]; mul: number };
  /** The open bases together (#281): the build multiplier of each class, their discounts summed */
  buildByClass?: Partial<Record<ShipClass, number>>;
  /** Research costs this many times as much */
  research?: number;
  /** Repairs take this many times as long */
  repairTime?: number;
  /** The theater this base opens (#145; one since #293); all of the nation's when absent */
  theaters?: string[];
}

export const BASES = (baseData as { bases: IBase[] }).bases;

export function nationBases(nation: string): IBase[] {
  return BASES.filter((b) => b.nation === nation);
}

/** What a nation records about its bases (#217): the ones built, and the one under construction. */
export interface IBaseWorks {
  basesOpen?: string[];
  baseWork?: IBaseWork | null;
}

export interface IBaseWork {
  base: string;
  endsAt: number;
}

/** True when the rank this base asks for has been reached (it can then be built, #217). */
export function baseRankMet(base: IBase, progress: IRankProgress): boolean {
  return rankOf(progress).index >= base.unlockRank;
}

/**
 * A nation's first base is always open; the others once built (#217). A progress without a list of built bases (a
 * save from before 0.0.28, mid-migration) falls back to the rank rule they had then.
 */
export function isBaseOpen(base: IBase, progress: IRankProgress & IBaseWorks): boolean {
  if (nationBases(base.nation)[0]?.id === base.id) return true;
  if (progress.basesOpen === undefined) return baseRankMet(base, progress);
  return progress.basesOpen.includes(base.id);
}

/** The base that was in use before #281 (the stored one when open, else the first): only old save steps read it. */
export function currentBase(nation: string, progress: IRankProgress & { base?: string }): IBase | undefined {
  const list = nationBases(nation);
  const stored = list.find((b) => b.id === progress.base);
  return stored && isBaseOpen(stored, progress) ? stored : list[0];
}

/** The nation's bases open in this progress, the first one included. */
export function openBases(progress: IRankProgress & IBaseWorks & { nation: string }): IBase[] {
  return nationBases(progress.nation).filter((b) => isBaseOpen(b, progress));
}

/** How far the summed discounts of the open bases may go (#281): building and research 40%, repairs and build time 50%. */
export const DISCOUNT_CAP = { build: 0.4, research: 0.4, repair: 0.5, buildTime: 0.5 } as const;

/**
 * 全軍港の効果 (#281): the open bases as one, each raised by its own facilities (#146). Discounts add up to
 * DISCOUNT_CAP; a sortie reaches the seas of any of them. It carries the nation's first base's id and name.
 */
export function combinedBase(progress: IRankProgress & IBaseWorks & { nation: string; facilities?: Facilities }): IBase | undefined {
  const first = nationBases(progress.nation)[0];
  if (!first) return undefined;
  const open = openBases(progress).map((b) => boostedBase(b, progress.facilities ?? {})!);
  const mul = (off: number, cap: number): number => Math.max(1 - cap, 1 - off);
  const buildByClass: Partial<Record<ShipClass, number>> = {};
  for (const c of Object.values(ShipClass)) {
    const off = open.reduce((sum, b) => sum + (b.build?.classes.includes(c) ? 1 - b.build.mul : 0), 0);
    if (off > 0) buildByClass[c] = mul(off, DISCOUNT_CAP.build);
  }
  const research = open.reduce((sum, b) => sum + (1 - (b.research ?? 1)), 0);
  const repair = open.reduce((sum, b) => sum + (1 - (b.repairTime ?? 1)), 0);
  const theaters = open.some((b) => !b.theaters) ? undefined : [...new Set(open.flatMap((b) => b.theaters ?? []))];
  return {
    ...first,
    build: undefined,
    buildByClass,
    research: research > 0 ? mul(research, DISCOUNT_CAP.research) : undefined,
    repairTime: repair > 0 ? mul(repair, DISCOUNT_CAP.repair) : undefined,
    theaters,
  };
}

/** The bases of a progress view as one (#281): what building, research, repairs and sorties use. */
export function baseOfProgress(progress: IRankProgress & IBaseWorks & { nation: string; base?: string; facilities?: Facilities }): IBase | undefined {
  return combinedBase(progress);
}

/** Build time from the workshops of every open base (#146 #281): 5% a level, summed, to DISCOUNT_CAP.buildTime. */
export function fleetBuildTimeMul(progress: IRankProgress & IBaseWorks & { nation: string; facilities?: Facilities }): number {
  const levels = openBases(progress).reduce((sum, b) => sum + facilityLevel(progress.facilities ?? {}, b.id, 'workshop'), 0);
  return Math.max(1 - DISCOUNT_CAP.buildTime, 1 - 0.05 * levels);
}

export function buildMultiplier(base: IBase | undefined, shipClass: ShipClass): number {
  if (base?.buildByClass) return base.buildByClass[shipClass] ?? 1;
  return base?.build?.classes.includes(shipClass) ? base.build.mul : 1;
}

export function researchMultiplier(base: IBase | undefined): number {
  return base?.research ?? 1;
}

export function repairTimeMultiplier(base: IBase | undefined): number {
  return base?.repairTime ?? 1;
}

const pct = (mul: number): string => `${Math.round((1 - mul) * 100)}%`;

/** "駆逐艦・潜水艦の建造 -20%" … one line per bonus. */
export function baseBonusLines(base: IBase): string[] {
  const out: string[] = [];
  if (base.build) out.push(`${base.build.classes.map((c) => CLASS_JA[c]).join('・')}の建造 -${pct(base.build.mul)}`);
  // The open bases together (#281): classes with the same discount on one line.
  const byMul = new Map<number, ShipClass[]>();
  for (const [c, mul] of Object.entries(base.buildByClass ?? {}) as Array<[ShipClass, number]>) byMul.set(mul, [...(byMul.get(mul) ?? []), c]);
  for (const [mul, classes] of byMul) out.push(`${classes.map((c) => CLASS_JA[c]).join('・')}の建造 -${pct(mul)}`);
  if (base.research) out.push(`研究費 -${pct(base.research)}`);
  if (base.repairTime) out.push(`修理時間 -${pct(base.repairTime)}`);
  return out;
}

/** Areas of the previous base's theater to win before the next base can be built (#293). */
export const BASE_PREV_CLEARS = 3;

/** The theater the base before this one opens (undefined for a nation's first base). */
export function previousTheater(base: IBase): string | undefined {
  const list = nationBases(base.nation);
  const i = list.findIndex((b) => b.id === base.id);
  return i > 0 ? list[i - 1].theaters?.[0] : undefined;
}

/** Areas won in `theater`, training areas aside. */
export function theaterClears(theater: string, cleared: readonly string[]): number {
  return campaignData.areas.filter((a) => a.theater === theater && !(a as { training?: boolean }).training && cleared.includes(a.id)).length;
}

/** Whether the previous base's theater is far enough along for this base (#293). */
export function basePrevMet(base: IBase, progress: Pick<IRankProgress, 'campaign'>): boolean {
  const prev = previousTheater(base);
  return prev === undefined || theaterClears(prev, progress.campaign) >= BASE_PREV_CLEARS;
}

const theaterName = (id: string): string => campaignData.theaters.find((t) => t.id === id)?.name ?? id;

/** "少尉・南太平洋 1/3": a locked base's conditions, short, for the list of bases. */
export function baseLockShort(base: IBase, progress: Pick<IRankProgress, 'campaign'>): string {
  const prev = previousTheater(base);
  const rank = RANKS[base.unlockRank]?.name ?? '?';
  return prev === undefined ? rank : `${rank}・${theaterName(prev)} ${Math.min(BASE_PREV_CLEARS, theaterClears(prev, progress.campaign))}/${BASE_PREV_CLEARS}`;
}

/** "少佐に昇進・北太平洋で 3 海域を攻略 (1 / 3) で着工": what a locked base waits for. */
export function baseLockText(base: IBase, progress?: Pick<IRankProgress, 'campaign'>): string {
  const prev = previousTheater(base);
  const rank = `${RANKS[base.unlockRank]?.name ?? '?'}に昇進`;
  if (prev === undefined) return `${rank}で着工`;
  const done = progress ? ` (${Math.min(BASE_PREV_CLEARS, theaterClears(prev, progress.campaign))} / ${BASE_PREV_CLEARS}) ` : '';
  return `${rank}・${theaterName(prev)}で ${BASE_PREV_CLEARS} 海域を攻略${done}で着工`;
}

// ---------------------------------------------------------------------------
// Building a base (#217)
// ---------------------------------------------------------------------------

/** Price and minutes of the nation's 2nd to 6th base (by their order in bases.json); half of 0.0.46's minutes (#359). */
export const BASE_WORKS: ReadonlyArray<{ cost: IResources; minutes: number }> = [
  { cost: { fuel: 500, ammo: 0, steel: 1000, bauxite: 0 }, minutes: 10 },
  { cost: { fuel: 1000, ammo: 500, steel: 2000, bauxite: 0 }, minutes: 20 },
  { cost: { fuel: 1500, ammo: 1000, steel: 3000, bauxite: 300 }, minutes: 30 },
  { cost: { fuel: 2000, ammo: 1500, steel: 4000, bauxite: 500 }, minutes: 40 },
  { cost: { fuel: 2500, ammo: 2000, steel: 5000, bauxite: 800 }, minutes: 50 },
];

/** What building `base` takes (the last entry for any further base). */
export function baseWorkOf(base: IBase): { cost: IResources; minutes: number } {
  const i = Math.max(0, nationBases(base.nation).findIndex((b) => b.id === base.id) - 1);
  return BASE_WORKS[Math.min(i, BASE_WORKS.length - 1)];
}

export type BaseState = 'open' | 'building' | 'busy' | 'ready' | 'resources' | 'locked';

/**
 * open: usable. building: under construction. busy: another base is being built (one at a time). ready / resources:
 * the rank is met and it can be built now / once resources allow. locked: the rank or the previous theater's
 * progress (#293) is not reached yet.
 */
export function baseState(base: IBase, progress: IRankProgress & IBaseWorks & { resources: IResources }): BaseState {
  if (isBaseOpen(base, progress)) return 'open';
  if (progress.baseWork?.base === base.id) return 'building';
  if (!baseRankMet(base, progress) || !basePrevMet(base, progress)) return 'locked';
  if (progress.baseWork) return 'busy';
  return canAfford(progress.resources, baseWorkOf(base).cost) ? 'ready' : 'resources';
}

/** Pays for and starts building `base`; null when it can't be built now. */
export function startBaseWork<T extends IRankProgress & IBaseWorks & { resources: IResources }>(progress: T, base: IBase, now: number): T | null {
  if (baseState(base, progress) !== 'ready') return null;
  const work = baseWorkOf(base);
  const left = pay(progress.resources, work.cost);
  return left ? { ...progress, resources: left, baseWork: { base: base.id, endsAt: now + work.minutes * 60_000 } } : null;
}

/** A finished construction opens its base (also after the game was closed). */
export function finishBaseWork<T extends IBaseWorks>(progress: T, now: number): T {
  const w = progress.baseWork;
  if (!w || w.endsAt > now) return progress;
  return { ...progress, basesOpen: [...new Set([...(progress.basesOpen ?? []), w.base])], baseWork: null };
}

/** 高速建造材 finishes the construction at once. */
export function rushBaseWork<T extends IBaseWorks & { items: { fastBuild: number } }>(progress: T, now: number): T | null {
  if (!progress.baseWork || progress.items.fastBuild <= 0) return null;
  const rushed = { ...progress, baseWork: { ...progress.baseWork, endsAt: now }, items: { ...progress.items, fastBuild: progress.items.fastBuild - 1 } };
  return finishBaseWork(rushed, now);
}

/** Bases of the nation open (built) in this progress, the first one included. */
export function openBaseCount(nation: string, progress: IRankProgress & IBaseWorks): number {
  return nationBases(nation).filter((b) => isBaseOpen(b, progress)).length;
}

// ---------------------------------------------------------------------------
// Ships, docks and theaters (#145; one pool since #281)
// ---------------------------------------------------------------------------

/** What a nation keeps per base. Ships no longer belong to a base (#281); the map is kept but not read. */
export interface IBaseHoldings {
  shipBases: Record<string, string>;
}

/** The nation's first base: where builds and new docks are recorded since the bases became one (#281). */
export function currentBaseId(progress: { nation: string }): string {
  return nationBases(progress.nation)[0]?.id ?? '';
}

/** Assigns ships to a base (kept for old records; nothing reads it since #281). */
export function assignShips<T extends IBaseHoldings>(progress: T, shipIds: readonly string[], baseId: string): T {
  if (!baseId || shipIds.length === 0) return progress;
  const shipBases = { ...progress.shipBases };
  for (const id of shipIds) shipBases[id] = baseId;
  return { ...progress, shipBases };
}

/** Docks a base has built (START_DOCKS when none recorded). */
function docksAt(progress: { baseDocks?: Record<string, number> }, baseId: string): number {
  return Math.max(START_DOCKS, progress.baseDocks?.[baseId] ?? START_DOCKS);
}

/** 全軍港のドック (#281): every open base's docks together, up to MAX_DOCKS. Opening a base adds its dock. */
export function dockTotal(progress: IRankProgress & IBaseWorks & { nation: string; baseDocks?: Record<string, number> }): number {
  return Math.min(MAX_DOCKS, openBases(progress).reduce((sum, b) => sum + docksAt(progress, b.id), 0));
}

/** The pooled docks as one dock state: every repair, whichever base it was started at, and the total. */
export function fleetDockView<T extends IDockState & IRankProgress & IBaseWorks & { nation: string; baseDocks: Record<string, number> }>(progress: T): T {
  return { ...progress, docksOwned: dockTotal(progress) };
}

/** Writes a pooled dock view back: its repairs, and a newly built dock on the first base. */
export function mergeFleetDocks<T extends IDockState & IRankProgress & IBaseWorks & { nation: string; baseDocks: Record<string, number> }>(progress: T, view: T): T {
  const added = Math.max(0, dockCount(view) - dockTotal(progress));
  const home = currentBaseId(progress);
  return {
    ...view,
    docksOwned: progress.docksOwned,
    baseDocks: added > 0 ? { ...progress.baseDocks, [home]: docksAt(progress, home) + added } : progress.baseDocks,
  };
}

/** Whether a sortie into `theater` can leave from `base`. */
export function baseReaches(base: IBase | undefined, theater: string): boolean {
  return !base?.theaters || base.theaters.includes(theater);
}

/** The nation's bases that reach `theater` ("呉鎮守府・佐世保鎮守府から出撃"). */
export function basesFor(nation: string, theater: string): IBase[] {
  return nationBases(nation).filter((b) => baseReaches(b, theater));
}
