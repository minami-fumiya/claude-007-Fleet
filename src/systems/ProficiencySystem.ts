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

export function proficiencyGain(i: IProficiencyGainInput): number {
  const base = 10 + 4 * Math.max(0, i.enemiesSunk) + (i.victory ? 6 : 0);
  const diminishing = Math.max(0.1, 1 - i.current / 150);
  return Math.round(base * (i.survived ? 1 : 0.5) * diminishing);
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
