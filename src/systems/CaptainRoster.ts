import captainData from '@/data/captains.json';
import { CaptainSkill, ICaptainData } from '@/types/Captain';
import { ShipClass } from '@/types/ShipClass';
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

/** XP a captain gets when they would join again (#131): once a nation has every captain, a recruit trains one instead. */
export const DUPLICATE_CAPTAIN_XP = 300;

/** The owned captain a duplicate recruit trains (random). */
export function duplicateCaptain(nation: string, owned: readonly string[], rng: () => number = Math.random): ICaptainData | undefined {
  const mine = nationCaptains(nation).filter((c) => owned.includes(c.id));
  return mine.length > 0 ? mine[Math.min(mine.length - 1, Math.floor(rng() * mine.length))] : undefined;
}
