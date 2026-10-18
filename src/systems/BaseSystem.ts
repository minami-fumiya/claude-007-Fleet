import baseData from '@/data/bases.json';
import { ShipClass } from '@/types/ShipClass';
import { CLASS_JA } from './EncyclopediaSystem';
export { scaleCost } from './ResourceSystem';
import { RANKS, rankOf, IRankProgress } from './RankSystem';

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

/** The base of a progress view (its own nation). */
export function baseOfProgress(progress: IRankProgress & { nation: string; base?: string }): IBase | undefined {
  return currentBase(progress.nation, progress);
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
