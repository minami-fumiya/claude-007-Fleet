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
  /** The lowest HP share among the surviving ships (1 when all are untouched; omitted counts as 1) */
  minShipHp?: number;
  /** The area's time limit, 0 or omitted for none */
  timeLimitSec?: number;
  /** The objective is won by holding out until the time limit (遅滞): time never costs the S */
  timeWins?: boolean;
}

/** An S needs at least this much of the fleet's HP left (#295: 60% → 85%; #407: 80%, the 大佐 seas were out of reach), no ship lost and none heavily damaged. */
export const S_HP_RATIO = 0.8;
/** A win with this much of the HP left and no loss counts as flawless (無傷の完勝章, #295). */
export const FLAWLESS_HP = 0.95;
/** A ship at or under this share of its HP is heavily damaged (大破): no S. */
export const HEAVY_DAMAGE = 0.25;
/** Without a time limit, an S must be won inside this (#295: 600 → 420 s, #307: 300 s); with one, inside S_TIME_SHARE of it. */
export const SLOW_BATTLE_SEC = 300;
export const S_TIME_SHARE = 2 / 3;
/** An A needs this much of the HP left (and no loss). */
export const A_HP_RATIO = 0.6;
/** A B allows one ship lost, or more while this much of the HP is left. */
export const B_HP_RATIO = 0.4;

/** The time an S must be won in: S_TIME_SHARE of the area's limit, else SLOW_BATTLE_SEC (Infinity when holding out wins). */
export function sRankTime(i: Pick<IRankInput, 'timeLimitSec' | 'timeWins'>): number {
  if (i.timeWins) return Infinity;
  return i.timeLimitSec && i.timeLimitSec > 0 ? Math.round(i.timeLimitSec * S_TIME_SHARE) : SLOW_BATTLE_SEC;
}

/** What keeps the battle from each better rank (#295), best rank first; empty when nothing does. */
function misses(i: IRankInput, rank: BattleRank): string[] {
  const pct = (v: number): number => Math.round(v * 100);
  const out: string[] = [];
  if (rank === 'S' || rank === 'A') {
    if (i.shipsLost > 0) out.push(`喪失 ${i.shipsLost} 隻`);
    const need = rank === 'S' ? S_HP_RATIO : A_HP_RATIO;
    if (i.hpRatio < need) out.push(`残り耐久 ${pct(i.hpRatio)}% (${pct(need)}% 必要)`);
  }
  if (rank === 'S') {
    if ((i.minShipHp ?? 1) <= HEAVY_DAMAGE) out.push('大破艦あり');
    const t = sRankTime(i);
    if (i.durationSec > t) out.push(`${Math.ceil(i.durationSec)} 秒 (${t} 秒以内)`);
  }
  if (rank === 'B' && i.shipsLost > 1 && i.hpRatio < B_HP_RATIO) out.push(`喪失 ${i.shipsLost} 隻・残り耐久 ${pct(i.hpRatio)}%`);
  return out;
}

/**
 * Defeat is D. A win is S with no loss, S_HP_RATIO of the HP left, no ship heavily damaged and inside sRankTime; A
 * with no loss and A_HP_RATIO of the HP; B with at most one ship lost or B_HP_RATIO of the HP; C otherwise (#295).
 */
export function battleRank(i: IRankInput): BattleRank {
  if (!i.victory) return 'D';
  return (['S', 'A', 'B'] as BattleRank[]).find((r) => misses(i, r).length === 0) ?? 'C';
}

/** "S まで: 残り耐久 78% (85% 必要)": what kept a win from S ('' for an S or a defeat). */
export function rankShortfall(i: IRankInput): string {
  if (!i.victory) return '';
  const m = misses(i, 'S');
  return m.length === 0 ? '' : `S まで: ${m.join(' · ')}`;
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
