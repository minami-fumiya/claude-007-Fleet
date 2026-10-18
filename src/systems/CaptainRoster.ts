import captainData from '@/data/captains.json';
import { ICaptainData } from '@/types/Captain';

/**
 * Which captains a nation has (#44, pure). A new nation starts with its first listed captain; more join on a
 * campaign area's first clear, on promotion, and now and then after a won battle. Saves from before #44 own every
 * captain of their nation, so nobody loses a captain they were using.
 */

export const ALL_CAPTAINS = (captainData as { captains: ICaptainData[] }).captains;

/** Chance a won battle brings a new captain. */
export const CAPTAIN_DROP_CHANCE = 0.05;

export function nationCaptains(nation: string): ICaptainData[] {
  return ALL_CAPTAINS.filter((c) => c.nation === nation);
}

/** The captain a new nation starts with. */
export function starterCaptain(nation: string): ICaptainData | undefined {
  return nationCaptains(nation)[0];
}

/** The next captain the nation would get (data order), or undefined when it has them all. */
export function nextCaptain(nation: string, owned: readonly string[]): ICaptainData | undefined {
  return nationCaptains(nation).find((c) => !owned.includes(c.id));
}

/** Adds the next captain; returns the new list and who joined (null when none is left). */
export function recruitCaptain(nation: string, owned: readonly string[]): { owned: string[]; joined: ICaptainData | null } {
  const next = nextCaptain(nation, owned);
  return next ? { owned: [...owned, next.id], joined: next } : { owned: [...owned], joined: null };
}

export function ownsCaptain(owned: readonly string[], id: string | null | undefined): boolean {
  return !!id && owned.includes(id);
}
