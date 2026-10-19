/**
 * Battle rank S〜D (#149, pure): how well a battle went, from losses, damage taken and time. The rank scales the
 * battle's resource reward and merit, an S opens the area for sweeping (#57), and each area keeps its best rank.
 */

export type BattleRank = 'S' | 'A' | 'B' | 'C' | 'D';

export const BATTLE_RANKS: BattleRank[] = ['S', 'A', 'B', 'C', 'D'];

export interface IRankInput {
  victory: boolean;
  fleetSize: number;
  shipsLost: number;
  /** The fleet's HP left as a share of its full HP (sunk ships count as 0) */
  hpRatio: number;
  durationSec: number;
}

/** An S needs at least this much of the fleet's HP left, and no ship lost. */
export const S_HP_RATIO = 0.6;
/** Won, but slower than this: no better than A. */
export const SLOW_BATTLE_SEC = 600;

/**
 * Defeat is D. A win is S without losses, with S_HP_RATIO of the HP left and inside SLOW_BATTLE_SEC; A without
 * losses; B losing at most half the fleet; C otherwise.
 */
export function battleRank(i: IRankInput): BattleRank {
  if (!i.victory) return 'D';
  if (i.shipsLost === 0) return i.hpRatio >= S_HP_RATIO && i.durationSec <= SLOW_BATTLE_SEC ? 'S' : 'A';
  return i.shipsLost * 2 <= i.fleetSize ? 'B' : 'C';
}

/** Battle reward by rank: S +20%, A +10%, C −15% (a defeat already pays little). */
export const RANK_REWARD_MUL: Record<BattleRank, number> = { S: 1.2, A: 1.1, B: 1, C: 0.85, D: 1 };
/** Merit by rank: S +50%, A +20%, C −20%. */
export const RANK_MERIT_MUL: Record<BattleRank, number> = { S: 1.5, A: 1.2, B: 1, C: 0.8, D: 1 };

/** "損害 22% · 喪失 0" under the rank (sinks and time are on the results' stat cards). */
export function rankBreakdown(i: Pick<IRankInput, 'hpRatio' | 'shipsLost'>): string {
  const damage = Math.round((1 - Math.max(0, Math.min(1, i.hpRatio))) * 100);
  return `損害 ${damage}% · 喪失 ${i.shipsLost}`;
}

/** The better of two ranks (undefined counts as none). */
export function betterRank(a: BattleRank | undefined, b: BattleRank | undefined): BattleRank | undefined {
  if (!a) return b;
  if (!b) return a;
  return BATTLE_RANKS.indexOf(a) <= BATTLE_RANKS.indexOf(b) ? a : b;
}

export function isBattleRank(v: unknown): v is BattleRank {
  return typeof v === 'string' && (BATTLE_RANKS as string[]).includes(v);
}
