import type { ITechNode } from '@/types/Progression';
import { medalMet, prerequisitesMet, rankMet } from './ResearchSystem';
import type { IExpedition } from './ExpeditionSystem';

/**
 * NEW の印 (#416 #398, pure): what has opened on a screen since the admiral last looked at it. Each screen keeps the ids
 * it has shown as open; anything open now and not among them is new. A screen never opened before has nothing new
 * (its first visit just remembers what is open), so an old save doesn't light up everything at once.
 */
export type SeenNew = Record<string, string[]>;

export function newIds(seen: SeenNew | undefined, screen: string, open: readonly string[]): string[] {
  const known = seen?.[screen];
  if (!known) return [];
  const set = new Set(known);
  return open.filter((id) => !set.has(id));
}

/** Remembers everything open now as seen (the old entries stay: a ship that closes and opens again is not new). */
export function markSeen(seen: SeenNew | undefined, screen: string, open: readonly string[]): SeenNew {
  const before = seen?.[screen] ?? [];
  const all = [...new Set([...before, ...open])];
  if (seen?.[screen] && all.length === before.length) return seen;
  return { ...(seen ?? {}), [screen]: all };
}

export function parseSeenNew(raw: unknown): SeenNew {
  if (!raw || typeof raw !== 'object') return {};
  const out: SeenNew = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = [...new Set(v.filter((x): x is string => typeof x === 'string'))];
  }
  return out;
}

/** The states of a ship on the build list that count as open (it could be built, short only of resources or a dock). */
export const OPEN_BUILD_STATES: readonly string[] = ['ready', 'resources', 'dock'];

/** The shipyard's key in the marks */
export const SHIPYARD_NEW = 'shipyard';
/** The research screen's: projects whose prerequisites, rank and medal are all met (0.0.64) */
export const RESEARCH_NEW = 'research';
/** The expedition screen's: expeditions the rank or a forward base has opened (0.0.64) */
export const EXPEDITION_NEW = 'expedition';

/** Research projects open to start (finished ones are not). */
export function openResearch(tree: readonly ITechNode[], done: readonly string[], medals: readonly string[], rankIndex: number): string[] {
  return tree.filter((n) => !done.includes(n.id) && prerequisitesMet(n, [...done]) && medalMet(n, medals) && rankMet(n, rankIndex)).map((n) => n.id);
}

/** Expeditions open to send (the next rank's, shown as a goal, is not). */
export function openExpeditions(shown: readonly IExpedition[], rankIndex: number): string[] {
  return shown.filter((e) => e.theater || e.rank <= rankIndex).map((e) => e.id);
}
