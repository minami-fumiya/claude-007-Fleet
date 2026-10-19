import captainData from '@/data/captains.json';
import { CaptainSkill, ICaptainData } from '@/types/Captain';
import { ShipClass } from '@/types/ShipClass';
import { IItems } from '@/types/Progression';
import { aptitudeFor, SKILL_LABEL } from './CaptainSystem';

/**
 * Which captains a nation has (#44, pure). A new nation starts with its first listed captain; more join on a
 * campaign area's first clear, on promotion, and now and then after a won battle. Saves from before #44 own every
 * captain of their nation, so nobody loses a captain they were using.
 */

export const ALL_CAPTAINS = (captainData as { captains: ICaptainData[] }).captains;

/** Chance a won battle brings a new captain. */
export const CAPTAIN_DROP_CHANCE = 0.05;

/**
 * The order captains join in (#159): destroyer specialists first, since a new nation owns only a destroyer; the
 * battleship and carrier ones last.
 */
export const RECRUIT_ORDER: CaptainSkill[] = [
  CaptainSkill.Torpedo, CaptainSkill.ASW, CaptainSkill.Night, CaptainSkill.Recon,
  CaptainSkill.Engineering, CaptainSkill.Gunnery, CaptainSkill.Damecon, CaptainSkill.Aviation,
];

/** The nation's captains, in the order they join. */
export function nationCaptains(nation: string): ICaptainData[] {
  const rank = (c: ICaptainData): number => {
    const i = RECRUIT_ORDER.indexOf(c.skill);
    return i < 0 ? RECRUIT_ORDER.length : i;
  };
  return ALL_CAPTAINS.filter((c) => c.nation === nation).sort((a, b) => rank(a) - rank(b));
}

/** The captain a new nation starts with. */
export function starterCaptain(nation: string): ICaptainData | undefined {
  return nationCaptains(nation)[0];
}

/**
 * The next captain the nation would get, or undefined when it has them all. With the classes the nation owns,
 * a captain suited (S) to one of them comes first (#159): no battleship captain while the fleet is destroyers.
 */
export function nextCaptain(nation: string, owned: readonly string[], shipClasses?: readonly ShipClass[]): ICaptainData | undefined {
  const left = nationCaptains(nation).filter((c) => !owned.includes(c.id));
  if (!shipClasses) return left[0];
  return left.find((c) => shipClasses.some((k) => aptitudeFor(c, k) === 'S')) ?? left[0];
}

/** Adds the next captain; returns the new list and who joined (null when none is left). */
export function recruitCaptain(nation: string, owned: readonly string[], shipClasses?: readonly ShipClass[]): { owned: string[]; joined: ICaptainData | null } {
  const next = nextCaptain(nation, owned, shipClasses);
  return next ? { owned: [...owned, next.id], joined: next } : { owned: [...owned], joined: null };
}

/** How captains join (#179), in the words the screens use. */
export const CAPTAIN_SOURCES: readonly string[] = [
  '作戦の初回攻略で 1 名',
  '昇進するたびに 1 名',
  `戦闘に勝つと ${Math.round(CAPTAIN_DROP_CHANCE * 100)}% の確率で 1 名`,
];

/** "艦長 坂井 (雷撃)" (#179): who the next recruit would be, or '' when every captain has joined. */
export function nextCaptainText(nation: string, owned: readonly string[], shipClasses?: readonly ShipClass[]): string {
  const next = nextCaptain(nation, owned, shipClasses);
  return next ? `艦長 ${next.name} (${SKILL_LABEL[next.skill]})` : '';
}

/** Captains of the nation not joined yet (#179). */
export function captainsLeft(nation: string, owned: readonly string[]): number {
  return nationCaptains(nation).filter((c) => !owned.includes(c.id)).length;
}

export function ownsCaptain(owned: readonly string[], id: string | null | undefined): boolean {
  return !!id && owned.includes(id);
}

/**
 * XP of a 艦長教本 (#131 #199): once a nation has every captain, a recruit becomes a book the player uses on a captain
 * of their choice (it used to train a random captain, so unused ones levelled up).
 */
export const DUPLICATE_CAPTAIN_XP = 300;

/** Uses one 艦長教本 on `captainId`; null when there is none or the captain isn't owned. */
export function useCaptainBook<T extends { items: IItems; captains: string[]; captainXp: Record<string, number> }>(progress: T, captainId: string): T | null {
  if ((progress.items.captainBook ?? 0) <= 0 || !progress.captains.includes(captainId)) return null;
  return {
    ...progress,
    items: { ...progress.items, captainBook: progress.items.captainBook - 1 },
    captainXp: { ...progress.captainXp, [captainId]: (progress.captainXp[captainId] ?? 0) + DUPLICATE_CAPTAIN_XP },
  };
}
