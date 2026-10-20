/**
 * 難易度 (#100, pure): how hard the enemy fights in the campaign and in exercises, and what that pays. Historical
 * scenarios keep the real setup and play at 普通.
 */

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface IDifficulty {
  label: string;
  /** Enemy aim error multiplier (larger misses more) */
  aimMul: number;
  /** Extra priority the enemy gives the player's flagship (#34): more negative looks past it more */
  flagshipPriority: number;
  /** Enemy hit points multiplier */
  hpMul: number;
  /** Battle reward multiplier (resources and gold) */
  rewardMul: number;
}

export const DIFFICULTIES: Record<Difficulty, IDifficulty> = {
  easy: { label: '易しい', aimMul: 1.3, flagshipPriority: -0.15, hpMul: 0.85, rewardMul: 0.8 },
  normal: { label: '普通', aimMul: 1, flagshipPriority: 0, hpMul: 1, rewardMul: 1 },
  hard: { label: '難しい', aimMul: 0.85, flagshipPriority: 0.15, hpMul: 1.15, rewardMul: 1.25 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === 'string' && (DIFFICULTY_ORDER as string[]).includes(v);
}

/** The difficulty a battle plays at: scenarios always at 普通. */
export function battleDifficulty(setting: Difficulty, scenario: boolean): IDifficulty {
  return DIFFICULTIES[scenario ? 'normal' : setting];
}

export function nextDifficulty(d: Difficulty): Difficulty {
  return DIFFICULTY_ORDER[(DIFFICULTY_ORDER.indexOf(d) + 1) % DIFFICULTY_ORDER.length];
}
