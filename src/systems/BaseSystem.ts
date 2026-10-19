import baseData from '@/data/bases.json';
import { ShipClass } from '@/types/ShipClass';
import { CLASS_JA } from './EncyclopediaSystem';
export { scaleCost } from './ResourceSystem';
import { RANKS, rankOf, IRankProgress } from './RankSystem';
import { boostedBase, Facilities } from './FacilitySystem';

/**
 * 軍港 (#88, pure): each nation has four home ports. The admiral works from one at a time; each gives one or two
 * bonuses (cheaper building of some classes, cheaper research, faster repairs). More open on promotion; moving is free.
 */

export interface IBase {
  id: string;
  nation: string;
  name: string;
  /** Rank index needed to move here */
  unlockRank: number;
  /** Building these classes costs `mul` times as much */
  build?: { classes: ShipClass[]; mul: number };
  /** Research costs this many times as much */
  research?: number;
  /** Repairs take this many times as long */
  repairTime?: number;
  /** Theaters a sortie can leave from here for (#145); all of the nation's when absent */
  theaters?: string[];
}

export const BASES = (baseData as { bases: IBase[] }).bases;

export function nationBases(nation: string): IBase[] {
  return BASES.filter((b) => b.nation === nation);
}

export function isBaseOpen(base: IBase, progress: IRankProgress): boolean {
  return rankOf(progress).index >= base.unlockRank;
}

/** The base in use: the stored one when it is this nation's and open, else the nation's first. */
export function currentBase(nation: string, progress: IRankProgress & { base?: string }): IBase | undefined {
  const list = nationBases(nation);
  const stored = list.find((b) => b.id === progress.base);
  return stored && isBaseOpen(stored, progress) ? stored : list[0];
}

/** The base of a progress view (its own nation), its bonus raised by its own facility and workshop (#146). */
export function baseOfProgress(progress: IRankProgress & { nation: string; base?: string; facilities?: Facilities }): IBase | undefined {
  return boostedBase(currentBase(progress.nation, progress), progress.facilities ?? {});
}

/** Moves to `id` (null when it isn't this nation's or not open yet). */
export function moveBase<T extends IRankProgress & { base?: string }>(nation: string, progress: T, id: string): T | null {
  const base = nationBases(nation).find((b) => b.id === id);
  return base && isBaseOpen(base, progress) ? { ...progress, base: id } : null;
}

export function buildMultiplier(base: IBase | undefined, shipClass: ShipClass): number {
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
  if (base.research) out.push(`研究費 -${pct(base.research)}`);
  if (base.repairTime) out.push(`修理時間 -${pct(base.repairTime)}`);
  return out;
}

export function baseLockText(base: IBase): string {
  return `${RANKS[base.unlockRank]?.name ?? '?'}に昇進で解放`;
}

// ---------------------------------------------------------------------------
// Ships, docks and theaters by base (#145)
// ---------------------------------------------------------------------------

/** What a nation keeps per base. */
export interface IBaseHoldings {
  /** Ship id → base id (ships without an entry are at the current base) */
  shipBases: Record<string, string>;
}

/** The current base's id ('' when the nation has none). */
export function currentBaseId(progress: IRankProgress & { nation: string; base?: string }): string {
  return baseOfProgress(progress)?.id ?? '';
}

/** Where a ship is based. */
export function shipBaseOf(progress: IRankProgress & IBaseHoldings & { nation: string; base?: string }, shipId: string): string {
  return progress.shipBases[shipId] ?? currentBaseId(progress);
}

export function isAtCurrentBase(progress: IRankProgress & IBaseHoldings & { nation: string; base?: string }, shipId: string): boolean {
  return shipBaseOf(progress, shipId) === currentBaseId(progress);
}

/** Assigns ships to a base (new ships go to the base the admiral is at). */
export function assignShips<T extends IBaseHoldings>(progress: T, shipIds: readonly string[], baseId: string): T {
  if (!baseId || shipIds.length === 0) return progress;
  const shipBases = { ...progress.shipBases };
  for (const id of shipIds) shipBases[id] = baseId;
  return { ...progress, shipBases };
}

/**
 * Brings ships over to `baseId` for free (#191): every listed ship the admiral owns that is at another base and not
 * busy (out on a sortie, or in a repair dock there). Returns the moved and the held-back ids.
 */
export function recallShips<T extends IBaseHoldings & { ships: string[]; docks: ReadonlyArray<{ shipId: string }> }>(
  progress: T, shipIds: readonly string[], baseId: string, busy: readonly string[] = [],
): { progress: T; moved: string[]; held: string[] } {
  const away = shipIds.filter((id) => progress.ships.includes(id) && (progress.shipBases[id] ?? baseId) !== baseId);
  const blocked = (id: string): boolean => busy.includes(id) || progress.docks.some((d) => d.shipId === id);
  const moved = away.filter((id) => !blocked(id));
  return { progress: assignShips(progress, moved, baseId), moved, held: away.filter(blocked) };
}

/** Whether a sortie into `theater` can leave from `base`. */
export function baseReaches(base: IBase | undefined, theater: string): boolean {
  return !base?.theaters || base.theaters.includes(theater);
}

/** The nation's bases that reach `theater` ("呉鎮守府・佐世保鎮守府から出撃"). */
export function basesFor(nation: string, theater: string): IBase[] {
  return nationBases(nation).filter((b) => baseReaches(b, theater));
}
