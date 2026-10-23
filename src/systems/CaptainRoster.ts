import captainData from '@/data/captains.json';
import { CaptainSkill, ICaptainData } from '@/types/Captain';
import { ShipClass } from '@/types/ShipClass';
import { IItems } from '@/types/Progression';
import { aptitudeFor } from './CaptainSystem';

/**
 * Which captains a nation has (#44, pure). A new nation starts with its first listed captain; more join on a
 * campaign area's first clear, on promotion, and now and then after a won battle. Saves from before #44 own every
 * captain of their nation, so nobody loses a captain they were using.
 */

export const ALL_CAPTAINS = (captainData as { captains: ICaptainData[] }).captains;

/**
 * Chance an S-rank win brings a new captain: 5% → 8% with 30 captains per nation (#209), 10% since an area with a
 * reward ship no longer also brings a captain (#247).
 */
export const CAPTAIN_DROP_CHANCE = 0.03;
/** Captains come slower since #285: an area's first S brings one from this depth on, a promotion from 少佐 (index 6). */
export const CAPTAIN_MIN_DEPTH = 3;
export const CAPTAIN_PROMOTION_RANK = 6;

/**
 * The order captains join in (#159): destroyer specialists first, since a new nation owns only a destroyer; the
 * battleship and carrier ones last.
 */
export const RECRUIT_ORDER: CaptainSkill[] = [
  CaptainSkill.Torpedo, CaptainSkill.ASW, CaptainSkill.Night, CaptainSkill.Recon,
  CaptainSkill.Engineering, CaptainSkill.AntiAir, CaptainSkill.Gunnery, CaptainSkill.Damecon, CaptainSkill.Aviation,
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

/** Every OUTSIDER_EVERY-th recruit suits a class the nation doesn't own yet (#210): something to look forward to. */
export const OUTSIDER_EVERY = 4;

/**
 * The next captain the nation would get, or undefined when it has them all (#159, spread out in #210).
 * `shipClasses` has one entry per owned ship. An owned class with no captain suited (S) to it gets the recruit first,
 * then the class with the most ships per suited captain, so a destroyer-heavy fleet stops drawing only destroyer
 * captains once a battleship arrives; the last recruit's speciality is skipped when another fits; every
 * OUTSIDER_EVERY-th recruit suits a class not owned.
 */
export function nextCaptain(nation: string, owned: readonly string[], shipClasses?: readonly ShipClass[]): ICaptainData | undefined {
  const all = nationCaptains(nation);
  const left = all.filter((c) => !owned.includes(c.id));
  if (!shipClasses || shipClasses.length === 0 || left.length === 0) return left[0];
  const mine = all.filter((c) => owned.includes(c.id));
  const lastSkill = all.find((c) => c.id === owned[owned.length - 1])?.skill;
  const suits = (c: ICaptainData, k: ShipClass): boolean => aptitudeFor(c, k) === 'S';
  const freshFirst = (list: ICaptainData[]): ICaptainData | undefined => list.find((c) => c.skill !== lastSkill) ?? list[0];
  const classes = [...new Set(shipClasses)];
  if (owned.length % OUTSIDER_EVERY === OUTSIDER_EVERY - 1) {
    const outsider = freshFirst(left.filter((c) => !classes.some((k) => suits(c, k))));
    if (outsider) return outsider;
  }
  // Every owned class gets a suited captain first; then the class with the most ships per suited captain.
  const ships = (k: ShipClass): number => shipClasses.filter((x) => x === k).length;
  const crew = (k: ShipClass): number => mine.filter((c) => suits(c, k)).length;
  const order = (k: ShipClass): [number, number] => [crew(k) === 0 ? 0 : 1, -ships(k) / (crew(k) + 1)];
  const byNeed = [...classes].sort((a, b) => order(a)[0] - order(b)[0] || order(a)[1] - order(b)[1]);
  for (const k of byNeed) {
    const pick = freshFirst(left.filter((c) => suits(c, k)));
    if (pick) return pick;
  }
  return freshFirst(left);
}

/** Adds the next captain; returns the new list and who joined (null when none is left). */
export function recruitCaptain(nation: string, owned: readonly string[], shipClasses?: readonly ShipClass[]): { owned: string[]; joined: ICaptainData | null } {
  const next = nextCaptain(nation, owned, shipClasses);
  return next ? { owned: [...owned, next.id], joined: next } : { owned: [...owned], joined: null };
}

/** How captains join (#179; S ranks only since #215), in the words the screens use. */
export const CAPTAIN_SOURCES: readonly string[] = [
  `報酬艦のない深さ ${CAPTAIN_MIN_DEPTH} 以上の作戦の海域で、初めて S 評価を取ると 1 名 (訓練海域は除く)`,
  '少佐以上に昇進するたびに 1 名',
  `S 評価で勝つと ${Math.round(CAPTAIN_DROP_CHANCE * 100)}% の確率で 1 名`,
  '一部のウィークリー任務・戦果任務の報酬で 1 名',
];

/**
 * `count` recruits for a nation (#44 #209): each joins by nextCaptain; once everyone has joined, a recruit becomes a
 * 艦長教本 instead (#199). `shipClasses` has one entry per owned ship.
 */
export function recruitCaptains<T extends { nation: string; captains: string[]; items: IItems }>(
  progress: T, count: number, shipClasses: readonly ShipClass[],
): { progress: T; joined: ICaptainData[]; books: number } {
  let out = progress;
  const joined: ICaptainData[] = [];
  let books = 0;
  for (let i = 0; i < count; i++) {
    const r = recruitCaptain(out.nation, out.captains, shipClasses);
    if (r.joined) {
      out = { ...out, captains: r.owned };
      joined.push(r.joined);
    } else if (out.captains.length > 0) {
      out = { ...out, items: { ...out.items, captainBook: (out.items.captainBook ?? 0) + 1 } };
      books++;
    }
  }
  return { progress: out, joined, books };
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
export const DUPLICATE_CAPTAIN_XP = 1000;

/** Captains (or books, once everyone has joined) one battle brings at most (#303). */
export const MAX_RECRUITS_PER_BATTLE = 1;

/** Uses one 艦長教本 on `captainId`; null when there is none or the captain isn't owned. */
export function useCaptainBook<T extends { items: IItems; captains: string[]; captainXp: Record<string, number> }>(progress: T, captainId: string): T | null {
  if ((progress.items.captainBook ?? 0) <= 0 || !progress.captains.includes(captainId)) return null;
  return {
    ...progress,
    items: { ...progress.items, captainBook: progress.items.captainBook - 1 },
    captainXp: { ...progress.captainXp, [captainId]: (progress.captainXp[captainId] ?? 0) + DUPLICATE_CAPTAIN_XP },
  };
}
