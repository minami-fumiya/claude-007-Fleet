import { CaptainSkill, ICaptain, ICaptainData } from '@/types/Captain';
import { IShipModifiers, NO_MODIFIERS } from '@/types/Modifiers';

/**
 * Captains (pure): experience, levels and the bonus a captain's speciality gives their ship.
 * Level n needs 100 × n(n−1)/2 XP in total (Lv2 = 100, Lv3 = 300, Lv4 = 600 …), capped at MAX_LEVEL.
 */

export const MAX_LEVEL = 10;

export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return (100 * n * (n - 1)) / 2;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

export function withProgress(data: ICaptainData, xp: number): ICaptain {
  const safe = Math.max(0, Math.floor(xp));
  return { ...data, xp: safe, level: levelForXp(safe) };
}

export interface IBattleXpInput {
  victory: boolean;
  enemiesSunk: number;
  /** The captain commanded the flagship */
  flagship: boolean;
  /** The captain's ship survived */
  survived: boolean;
}

/** XP for one battle: 40 for taking part, +30 per enemy sunk by the fleet, +60 for a win, ×1.2 on the flagship, halved if the ship was lost. */
export function battleXp(input: IBattleXpInput): number {
  let xp = 40 + 30 * Math.max(0, input.enemiesSunk) + (input.victory ? 60 : 0);
  if (input.flagship) xp *= 1.2;
  if (!input.survived) xp *= 0.5;
  return Math.round(xp);
}

export interface IXpAward {
  captain: ICaptain;
  gained: number;
  leveledUp: boolean;
}

export function awardXp(captain: ICaptain, gained: number): IXpAward {
  const next = withProgress(captain, captain.xp + gained);
  return { captain: next, gained, leveledUp: next.level > captain.level };
}

/** Battle conditions some specialities depend on. */
export interface ICaptainContext {
  /** Night battle: the 夜戦 speciality only pays off in the dark */
  night?: boolean;
}

/** The captain's bonus as ship modifiers. */
export function captainModifiers(captain: ICaptain | null | undefined, ctx: ICaptainContext = {}): IShipModifiers {
  if (!captain) return NO_MODIFIERS;
  const lv = captain.level;
  switch (captain.skill) {
    case CaptainSkill.Gunnery:
      return { ...NO_MODIFIERS, gunPowerMul: 1 + 0.03 * lv, gunReloadMul: 1 - 0.01 * lv };
    case CaptainSkill.Torpedo:
      return { ...NO_MODIFIERS, torpedoPowerMul: 1 + 0.04 * lv };
    case CaptainSkill.Engineering:
      return { ...NO_MODIFIERS, speedMul: 1 + 0.02 * lv, hpMul: 1 + 0.01 * lv };
    case CaptainSkill.Aviation:
      return { ...NO_MODIFIERS, airPowerMul: 1 + 0.04 * lv, aaMul: 1 + 0.03 * lv };
    case CaptainSkill.ASW:
      return { ...NO_MODIFIERS, aswMul: 1 + 0.05 * lv, visionMul: 1 + 0.01 * lv };
    case CaptainSkill.Night:
      return ctx.night
        ? { ...NO_MODIFIERS, visionMul: 1 + 0.05 * lv, gunPowerMul: 1 + 0.02 * lv, torpedoPowerMul: 1 + 0.03 * lv }
        : NO_MODIFIERS;
    case CaptainSkill.Recon:
      return { ...NO_MODIFIERS, visionMul: 1 + 0.04 * lv };
    case CaptainSkill.Damecon:
      return { ...NO_MODIFIERS, hpMul: 1 + 0.02 * lv, armorAdd: Math.floor(lv / 2) };
    default:
      return NO_MODIFIERS;
  }
}

export const SKILL_LABEL: Record<CaptainSkill, string> = {
  [CaptainSkill.Gunnery]: '砲術',
  [CaptainSkill.Torpedo]: '水雷',
  [CaptainSkill.Engineering]: '機関',
  [CaptainSkill.Aviation]: '航空',
  [CaptainSkill.ASW]: '対潜',
  [CaptainSkill.Night]: '夜戦',
  [CaptainSkill.Recon]: '索敵',
  [CaptainSkill.Damecon]: '応急',
};
