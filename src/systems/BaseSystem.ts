import baseData from '@/data/bases.json';
import campaignData from '@/data/campaign.json';
import { ShipClass } from '@/types/ShipClass';
import { CLASS_JA } from './EncyclopediaSystem';
export { scaleCost } from './ResourceSystem';
import { RANKS, rankOf, IRankProgress } from './RankSystem';
import { boostedBase, Facilities, facilityLevel, forwardTotal } from './FacilitySystem';
import { canAfford, pay } from './ResourceSystem';
import { IResources } from '@/types/Progression';
import { dockCount, IDockState, MAX_DOCKS, START_DOCKS } from './DockSystem';

/**
 * 軍港 (#88, pure): each nation has five home ports, each with a bonus (cheaper building of some classes, cheaper
 * research, faster repairs) and the seas its sorties reach. Since 0.0.38 (#281) the admiral no longer moves between
 * them: every open base counts at once — their discounts add up (to a cap), their docks pool, their seas join.
 * Since #293 each base opens one new theater, the nearest sea first: a base is built once the rank of its place in the
 * order is reached and BASE_PREV_CLEARS areas of the previous base's theater are won, the same for every navy.
 *
 * Since #373 the ports and the seas are apart: a navy's four ports (本国の軍港) keep the discounts, the docks and
 * their facilities, and only the first (本拠地) opens a sea, the home one. Every other sea is opened by a forward
 * base (基地, `kind: 'forward'`) in that sea, in the order the ports used to open them, at the same ranks. A forward
 * base has its own facilities (補給廠 and the rest, FacilitySystem) that help in its sea.
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
  /** The theater this base opens (#145; one since #293); all of the nation's when absent. Only the home port and the forward bases open one (#373) */
  theaters?: string[];
  /** A forward base (基地, #373) rather than a home port */
  kind?: 'forward';
  /** Where a forward base is and what it was (#373) */
  note?: string;
}

export const BASES = (baseData as { bases: IBase[] }).bases;

export function nationBases(nation: string): IBase[] {
  return BASES.filter((b) => b.nation === nation);
}

/** Whether a base is a forward base (基地, #373). */
export function isForward(base: Pick<IBase, 'kind'>): boolean {
  return base.kind === 'forward';
}

/** A navy's home ports (軍港, #373), the 本拠地 first. */
export function nationPorts(nation: string): IBase[] {
  return nationBases(nation).filter((b) => !isForward(b));
}

/** A navy's forward bases (基地, #373), in the order they open. */
export function nationForwardBases(nation: string): IBase[] {
  return nationBases(nation).filter(isForward);
}

/** The order a navy's seas open (#293 #373): the home port's, then each forward base's. */
export function theaterOrder(nation: string): string[] {
  return nationBases(nation).flatMap((b) => b.theaters ?? []);
}

/** The forward base that opens `theater` for `nation` (#373); none for the home sea. */
export function forwardBaseFor(nation: string, theater: string): IBase | undefined {
  return nationForwardBases(nation).find((b) => b.theaters?.includes(theater));
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
  // 前線工作所 (#373): every open forward base's levels add 2% off research and 3% off repairs, under the same caps.
  const shop = forwardTotal(progress.facilities ?? {}, 'frontShop', openBases(progress).filter(isForward).map((b) => b.id));
  const research = open.reduce((sum, b) => sum + (1 - (b.research ?? 1)), 0) + FRONT_SHOP.research * shop;
  const repair = open.reduce((sum, b) => sum + (1 - (b.repairTime ?? 1)), 0) + FRONT_SHOP.repair * shop;
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

/** What one level of 前線工作所 takes off (#373). */
export const FRONT_SHOP = { research: 0.02, repair: 0.03 } as const;

/** 補給廠 (#373): what each level of a forward base's supply depot takes off a sortie into its sea. */
export const SUPPLY_OFF: readonly number[] = [0, 0.1, 0.15, 0.2];

/** The share of a sortie's (or sweep's) fuel and ammo paid in `theater` (#373): 1 without an open base's depot. */
export function supplyMul(progress: IRankProgress & IBaseWorks & { nation: string; facilities?: Facilities }, theater: string | undefined): number {
  if (!theater) return 1;
  const base = forwardBaseFor(progress.nation, theater);
  if (!base || !isBaseOpen(base, progress)) return 1;
  return 1 - (SUPPLY_OFF[facilityLevel(progress.facilities ?? {}, base.id, 'supply')] ?? 0);
}

/** A forward facility's level at the base of `theater`, 0 when it has none or it is not open (#373). */
export function theaterFacility(progress: IRankProgress & IBaseWorks & { nation: string; facilities?: Facilities }, theater: string | undefined, id: 'supply' | 'anchorage' | 'baseAir' | 'frontShop' | 'outpost'): number {
  const base = theater ? forwardBaseFor(progress.nation, theater) : undefined;
  return base && isBaseOpen(base, progress) ? facilityLevel(progress.facilities ?? {}, base.id, id) : 0;
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

/** The sea opened before the one this forward base opens (#293 #373); none for a home port. */
export function previousTheater(base: IBase): string | undefined {
  if (!isForward(base)) return undefined;
  const order = theaterOrder(base.nation);
  const i = order.indexOf(base.theaters?.[0] ?? '');
  return i > 0 ? order[i - 1] : undefined;
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

/** Price and minutes of a navy's 1st to 6th forward base (#373): shorter and cheaper than a port. */
export const FORWARD_WORKS: ReadonlyArray<{ cost: IResources; minutes: number }> = [
  { cost: { fuel: 300, ammo: 200, steel: 500, bauxite: 0 }, minutes: 5 },
  { cost: { fuel: 600, ammo: 400, steel: 1000, bauxite: 0 }, minutes: 8 },
  { cost: { fuel: 900, ammo: 600, steel: 1500, bauxite: 100 }, minutes: 10 },
  { cost: { fuel: 1200, ammo: 800, steel: 2000, bauxite: 200 }, minutes: 12 },
  { cost: { fuel: 1500, ammo: 1000, steel: 2500, bauxite: 300 }, minutes: 15 },
  { cost: { fuel: 1800, ammo: 1200, steel: 3000, bauxite: 400 }, minutes: 18 },
];

/** What building `base` takes (the last entry for any further base): a port by its place among the ports, a forward base among the forward bases. */
export function baseWorkOf(base: IBase): { cost: IResources; minutes: number } {
  if (isForward(base)) {
    const i = Math.max(0, nationForwardBases(base.nation).findIndex((b) => b.id === base.id));
    return FORWARD_WORKS[Math.min(i, FORWARD_WORKS.length - 1)];
  }
  const i = Math.max(0, nationPorts(base.nation).findIndex((b) => b.id === base.id) - 1);
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

/** 全軍港のドック (#281): every open port's docks together, up to MAX_DOCKS. Opening a port adds its dock; forward bases have none (#373). */
export function dockTotal(progress: IRankProgress & IBaseWorks & { nation: string; baseDocks?: Record<string, number> }): number {
  return Math.min(MAX_DOCKS, openBases(progress).filter((b) => !isForward(b)).reduce((sum, b) => sum + docksAt(progress, b.id), 0));
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
