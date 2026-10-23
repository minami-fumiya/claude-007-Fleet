import { addProficiency } from './ProficiencySystem';

/**
 * 寮舎 (#57, pure): ships and captains left at the dorm train with time. A ship gains proficiency slowly, up to a
 * ceiling (battles take it further); a captain gains XP, less than in battle. What is in the dorm can't sortie.
 */

/** Dorm places by rank index: two, three at 少佐, four at 少将. */
export function dormSlots(rankIndex: number): number {
  return 2 + (rankIndex >= 6 ? 1 : 0) + (rankIndex >= 10 ? 1 : 0);
}

/** Proficiency a ship gains an hour in the dorm, and the most the dorm takes it to */
export const DORM_PROFICIENCY_PER_HOUR = 2;
export const DORM_PROFICIENCY_CAP = 50;
/** XP a captain gains an hour (a won battle gives about 160; six an hour is about 1,000) */
export const DORM_XP_PER_HOUR = 120;
/** A stay counts at most this long when it is collected (the dorm doesn't run forever unattended) */
export const DORM_MAX_HOURS = 24;

export interface IDormEntry {
  kind: 'ship' | 'captain';
  id: string;
  /** When its training was last collected (ms) */
  since: number;
}

function hours(since: number, now: number): number {
  return Math.min(DORM_MAX_HOURS, Math.max(0, (now - since) / 3_600_000));
}

/** Proficiency a ship has gained since `since`, given where it stands. */
export function dormProficiency(current: number, since: number, now: number): number {
  if (current >= DORM_PROFICIENCY_CAP) return current;
  return Math.min(DORM_PROFICIENCY_CAP, addProficiency(current, Math.floor(hours(since, now) * DORM_PROFICIENCY_PER_HOUR)));
}

/** XP a captain has gained since `since`. */
export function dormXp(since: number, now: number): number {
  return Math.floor(hours(since, now) * DORM_XP_PER_HOUR);
}

export interface IDormProgress {
  dorm: IDormEntry[];
  proficiency: Record<string, number>;
  captainXp: Record<string, number>;
}

/** Credits every entry's training up to `now` and restarts its clock; `hours` is the total time credited. */
export function collectDorm<T extends IDormProgress>(p: T, now: number): { progress: T; hours: number } {
  const proficiency = { ...p.proficiency };
  const captainXp = { ...p.captainXp };
  let total = 0;
  for (const e of p.dorm) {
    total += hours(e.since, now);
    if (e.kind === 'ship') proficiency[e.id] = dormProficiency(proficiency[e.id] ?? 0, e.since, now);
    else captainXp[e.id] = (captainXp[e.id] ?? 0) + dormXp(e.since, now);
  }
  return { progress: { ...p, proficiency, captainXp, dorm: p.dorm.map((e) => ({ ...e, since: now })) }, hours: total };
}

/** Puts a ship or captain in the dorm (credited from now); null when full or already there. */
export function enterDorm<T extends IDormProgress>(p: T, kind: IDormEntry['kind'], id: string, rankIndex: number, now: number): T | null {
  if (p.dorm.length >= dormSlots(rankIndex) || p.dorm.some((e) => e.kind === kind && e.id === id)) return null;
  return { ...p, dorm: [...p.dorm, { kind, id, since: now }] };
}

/** Takes one out, crediting its training first. */
export function leaveDorm<T extends IDormProgress>(p: T, kind: IDormEntry['kind'], id: string, now: number): { progress: T; hours: number } {
  const collected = collectDorm(p, now);
  return { progress: { ...collected.progress, dorm: collected.progress.dorm.filter((e) => !(e.kind === kind && e.id === id)) }, hours: collected.hours };
}

export function inDorm(dorm: readonly IDormEntry[] = [], kind: IDormEntry['kind'], id: string): boolean {
  return dorm.some((e) => e.kind === kind && e.id === id);
}
