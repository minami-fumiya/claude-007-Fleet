import { IResources } from '@/types/Progression';
import { RESOURCE_KEYS, resources } from '@/systems/ResourceSystem';

/**
 * 制海権と敵の反攻 (#50, pure). Every area a navy has won is its sea: the seas held pay an hourly income on top of the
 * natural regeneration. Every few sorties the enemy strikes back at one of them; a defence won keeps it, a defence
 * lost (or not fought before the deadline) gives it up until it is won again. Counted by sorties, not by the clock,
 * so a player away from the game never loses a sea.
 */

export interface ICounterattack {
  /** The area the enemy strikes at */
  areaId: string;
  startedAt: number;
  /** Epoch ms after which the sea is lost if not defended */
  endsAt: number;
}

export interface ISeaControl {
  /** Areas won once whose sea the enemy has taken back: no income, no sweeps, until won again */
  lost: string[];
  /** The counterattack under way, if any */
  counter: ICounterattack | null;
  /** Main-fleet battles fought since the last counterattack */
  sorties: number;
  /** Counterattacks so far: picks the next target */
  count: number;
  /** Epoch ms the hourly income counts from (0 = not started) */
  incomeAt: number;
}

export function emptySeaControl(): ISeaControl {
  return { lost: [], counter: null, sorties: 0, count: 0, incomeAt: 0 };
}

/** Each sea held pays this an hour. */
export const SEA_INCOME_PER_AREA: IResources = { fuel: 8, ammo: 6, steel: 8, bauxite: 2 };
export const SEA_INCOME_INTERVAL_MS = 3_600_000;
/** At most this many hours are paid at once, however long the game was closed. */
export const SEA_INCOME_MAX_HOURS = 12;
/** A counterattack comes after this many main-fleet battles. */
export const COUNTER_EVERY = 6;
/** No counterattack until this many seas can be struck (the theaters' first areas are never struck). */
export const COUNTER_MIN_HELD = 3;
/** Hours the player has to defend the sea. */
export const COUNTER_HOURS = 3;
/** A defence won pays this share of the area's first-clear reward. */
export const DEFENSE_REWARD_SHARE = 0.3;

interface IAreaLike { id: string; theater: string; training?: boolean; requires: string[]; requiresAny?: string[] }

/** Read from a save: anything missing takes its default. */
export function parseSeaControl(raw: unknown): ISeaControl {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const c = d.counter as Record<string, unknown> | null | undefined;
  const counter = c && typeof c.areaId === 'string' && typeof c.endsAt === 'number' ? { areaId: c.areaId, startedAt: num(c.startedAt), endsAt: c.endsAt } : null;
  const lost = Array.isArray(d.lost) ? [...new Set(d.lost.filter((x): x is string => typeof x === 'string'))] : [];
  return { lost, counter, sorties: num(d.sorties), count: num(d.count), incomeAt: num(d.incomeAt) };
}

/** The seas held: areas won and not taken back, training areas aside. */
export function heldAreas(areas: readonly IAreaLike[], cleared: readonly string[], sea: ISeaControl, theater?: string): string[] {
  return areas.filter((a) => !a.training && (theater === undefined || a.theater === theater) && cleared.includes(a.id) && !sea.lost.includes(a.id)).map((a) => a.id);
}

/** The hourly income of `held` seas. */
export function seaIncome(held: number): IResources {
  const r = resources();
  for (const k of RESOURCE_KEYS) r[k] = SEA_INCOME_PER_AREA[k] * held;
  return r;
}

/**
 * Pays the hours of income since `incomeAt` (at most SEA_INCOME_MAX_HOURS). The first call only starts the clock.
 * Returns the gain to add (the caller applies the holding cap) and the clock moved on.
 */
export function accrueSeaIncome(sea: ISeaControl, held: number, now: number): { sea: ISeaControl; gain: IResources } {
  if (sea.incomeAt <= 0 || now < sea.incomeAt) return { sea: { ...sea, incomeAt: now }, gain: resources() };
  const hours = Math.floor((now - sea.incomeAt) / SEA_INCOME_INTERVAL_MS);
  if (hours <= 0) return { sea, gain: resources() };
  const paid = Math.min(hours, SEA_INCOME_MAX_HOURS);
  const per = seaIncome(held);
  const gain = resources();
  for (const k of RESOURCE_KEYS) gain[k] = per[k] * paid;
  return { sea: { ...sea, incomeAt: sea.incomeAt + hours * SEA_INCOME_INTERVAL_MS }, gain };
}

/** Milliseconds to the next income. */
export function nextIncomeMs(sea: ISeaControl, now: number): number {
  if (sea.incomeAt <= 0 || now < sea.incomeAt) return SEA_INCOME_INTERVAL_MS;
  return SEA_INCOME_INTERVAL_MS - ((now - sea.incomeAt) % SEA_INCOME_INTERVAL_MS);
}

/** Seas the enemy can strike: held, and not a theater's first area (its base's own waters). */
export function counterTargets(areas: readonly IAreaLike[], cleared: readonly string[], sea: ISeaControl, theaters?: readonly string[]): string[] {
  return areas
    .filter((a) => [...a.requires, ...(a.requiresAny ?? [])].length > 0 && (!theaters || theaters.includes(a.theater)))
    .map((a) => a.id)
    .filter((id) => heldAreas(areas, cleared, sea).includes(id));
}

/**
 * A main-fleet battle was fought: counts towards the next counterattack, which starts on one of `targets` once
 * COUNTER_EVERY battles are in and enough seas are held. Nothing new starts while one is under way.
 */
export function countSortie(sea: ISeaControl, targets: readonly string[], now: number): { sea: ISeaControl; started: ICounterattack | null } {
  const sorties = sea.sorties + 1;
  if (sea.counter || sorties < COUNTER_EVERY || targets.length < COUNTER_MIN_HELD) return { sea: { ...sea, sorties: sea.counter ? sea.sorties : sorties }, started: null };
  const sorted = [...targets].sort();
  // Spread over the seas held: each counterattack strikes a different one where it can.
  const areaId = sorted[(sea.count * 7 + 3) % sorted.length];
  const started = { areaId, startedAt: now, endsAt: now + COUNTER_HOURS * 3_600_000 };
  return { sea: { ...sea, sorties: 0, count: sea.count + 1, counter: started }, started };
}

/** A counterattack left past its deadline: the sea is lost. */
export function expireCounter(sea: ISeaControl, now: number): { sea: ISeaControl; lostArea: string | null } {
  if (!sea.counter || now < sea.counter.endsAt) return { sea, lostArea: null };
  const id = sea.counter.areaId;
  return { sea: { ...sea, counter: null, lost: sea.lost.includes(id) ? sea.lost : [...sea.lost, id] }, lostArea: id };
}

/** The defence of `areaId` was fought: won, the sea is kept; lost, it goes to the enemy. */
export function settleDefense(sea: ISeaControl, areaId: string, victory: boolean): ISeaControl {
  if (sea.counter?.areaId !== areaId) return sea;
  if (victory) return { ...sea, counter: null };
  return { ...sea, counter: null, lost: sea.lost.includes(areaId) ? sea.lost : [...sea.lost, areaId] };
}

/** An area won again: its sea is back. */
export function retakeArea(sea: ISeaControl, areaId: string): ISeaControl {
  return sea.lost.includes(areaId) ? { ...sea, lost: sea.lost.filter((x) => x !== areaId) } : sea;
}

/** The reward of a defence won: a share of the area's first-clear reward. */
export function defenseReward(reward: Partial<IResources>): IResources {
  const r = resources();
  for (const k of RESOURCE_KEYS) r[k] = Math.round((reward[k] ?? 0) * DEFENSE_REWARD_SHARE);
  return r;
}

/** The state of one area on the map: held, under attack, lost to the enemy, or not won yet. */
export type SeaState = 'held' | 'attacked' | 'lost' | 'none';

export function seaState(areaId: string, cleared: readonly string[], sea: ISeaControl, training = false): SeaState {
  if (!cleared.includes(areaId) || training) return 'none';
  if (sea.counter?.areaId === areaId) return 'attacked';
  return sea.lost.includes(areaId) ? 'lost' : 'held';
}
