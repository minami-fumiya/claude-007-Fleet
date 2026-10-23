/**
 * Crew proficiency (pure), 0..100 per ship: grows with battles and makes the ship shoot straighter and
 * dodge some shells. Gains slow down as the crew gets better.
 */

export const MAX_PROFICIENCY = 100;

export interface IProficiencyGainInput {
  victory: boolean;
  enemiesSunk: number;
  survived: boolean;
  current: number;
}

/**
 * About a third of what it was until 0.0.41 (#305): a won battle with two sinks gives 7 to a green crew, so a destroyer
 * reaches 改 (20) in about 3 battles, a cruiser 改 (30) in 5 and a battleship 改三 (100) in about 60.
 */
export function proficiencyGain(i: IProficiencyGainInput): number {
  const base = 3 + Math.min(6, Math.max(0, i.enemiesSunk)) + (i.victory ? 2 : 0);
  const diminishing = Math.max(0.1, 1 - i.current / 110);
  return Math.max(1, Math.round(base * (i.survived ? 1 : 0.5) * diminishing));
}

/** 訓練教範 (#305): one book adds this much proficiency. */
export const TRAINING_MANUAL_GAIN = 10;
/** Chance an S-rank win brings a 訓練教範 (#305) */
export const TRAINING_MANUAL_DROP_CHANCE = 0.1;

/** Uses one 訓練教範 on `shipId`; null without a book or when the crew is already at the top. */
export function useTrainingManual<T extends { items: { trainingManual: number }; proficiency: Record<string, number> }>(progress: T, shipId: string): T | null {
  const current = progress.proficiency[shipId] ?? 0;
  if ((progress.items.trainingManual ?? 0) <= 0 || current >= MAX_PROFICIENCY) return null;
  return {
    ...progress,
    items: { ...progress.items, trainingManual: progress.items.trainingManual - 1 },
    proficiency: { ...progress.proficiency, [shipId]: addProficiency(current, TRAINING_MANUAL_GAIN) },
  };
}

export function addProficiency(current: number, gain: number): number {
  return Math.max(0, Math.min(MAX_PROFICIENCY, Math.round(current + gain)));
}

/** Multiplier on a ship's aim error: 1 for a green crew, 0.5 for a veteran one. */
export function aimErrorMul(proficiency: number): number {
  return 1 - Math.min(MAX_PROFICIENCY, Math.max(0, proficiency)) / 200;
}

/** Chance an incoming shell or torpedo narrowly misses (0..0.15). */
export function evadeChance(proficiency: number): number {
  return Math.min(MAX_PROFICIENCY, Math.max(0, proficiency)) * 0.0015;
}

export function proficiencyLabel(proficiency: number): string {
  if (proficiency >= 80) return '精鋭';
  if (proficiency >= 50) return '熟練';
  if (proficiency >= 20) return '一般';
  return '新兵';
}
