/**
 * Admiral rank (#30, pure): each nation's rank comes from how many campaign areas it has cleared, and the rank
 * sets the number of fleet slots (#25) and the grade of ship the shipyard may build (#29).
 */

export interface IRank {
  /** 0 = lowest */
  index: number;
  name: string;
  en: string;
  /** Campaign areas that must be cleared to hold this rank */
  minClears: number;
  /** Ships (and captains) per sortie */
  slots: number;
}

export const RANKS: IRank[] = [
  { index: 0, name: '少佐', en: 'LT. COMMANDER', minClears: 0, slots: 1 },
  { index: 1, name: '中佐', en: 'COMMANDER', minClears: 1, slots: 2 },
  { index: 2, name: '大佐', en: 'CAPTAIN', minClears: 2, slots: 3 },
  { index: 3, name: '少将', en: 'REAR ADMIRAL', minClears: 4, slots: 4 },
  { index: 4, name: '中将', en: 'VICE ADMIRAL', minClears: 7, slots: 5 },
  { index: 5, name: '大将', en: 'ADMIRAL', minClears: 10, slots: 6 },
];

export const MAX_FLEET_SLOTS = RANKS[RANKS.length - 1].slots;

/** Anything carrying a nation's cleared campaign area ids (IProgress / INationProgress). */
export interface IClears {
  campaign: string[];
}

export function clearCount(progress: IClears): number {
  return new Set(progress.campaign).size;
}

export function rankForClears(clears: number): IRank {
  let rank = RANKS[0];
  for (const r of RANKS) if (clears >= r.minClears) rank = r;
  return rank;
}

export function rankOf(progress: IClears): IRank {
  return rankForClears(clearCount(progress));
}

/** Ships the nation may send on one sortie. */
export function fleetSlots(progress: IClears): number {
  return rankOf(progress).slots;
}

/** The next rank and how many more areas it needs, or null at the top. */
export function nextRank(progress: IClears): { rank: IRank; clearsNeeded: number } | null {
  const next = RANKS[rankOf(progress).index + 1];
  return next ? { rank: next, clearsNeeded: next.minClears - clearCount(progress) } : null;
}

/** "次の昇進: 中佐 (作戦 あと 1 海域)" / "最高位に到達". */
export function promotionText(progress: IClears): string {
  const next = nextRank(progress);
  return next ? `次の昇進: ${next.rank.name} (作戦 あと ${next.clearsNeeded} 海域)` : '最高位に到達';
}
