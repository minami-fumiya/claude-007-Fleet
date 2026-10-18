import { CaptainSkill, ICaptain, ICaptainData } from '@/types/Captain';
import { IShipModifiers, NO_MODIFIERS } from '@/types/Modifiers';
import { combineModifiers } from './CustomizationSystem';

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

/** One speciality's bonus at `level`; `scale` shrinks it for learned (not inherent) skills (#45). */
export function skillModifiers(skill: CaptainSkill, level: number, ctx: ICaptainContext = {}, scale = 1): IShipModifiers {
  const lv = level * scale;
  switch (skill) {
    case CaptainSkill.Gunnery:
      return { ...NO_MODIFIERS, gunPowerMul: 1 + 0.03 * lv, gunReloadMul: 1 - 0.01 * lv };
    case CaptainSkill.Torpedo:
      return { ...NO_MODIFIERS, torpedoPowerMul: 1 + 0.04 * lv };
    case CaptainSkill.Engineering:
      return { ...NO_MODIFIERS, speedMul: 1 + 0.02 * lv, hpMul: 1 + 0.01 * lv };
    case CaptainSkill.Aviation:
      return { ...NO_MODIFIERS, airPowerMul: 1 + 0.04 * lv, aaMul: 1 + 0.03 * lv };
    case CaptainSkill.ASW:
      return { ...NO_MODIFIERS, depthChargeMul: 1 + 0.05 * lv, visionMul: 1 + 0.01 * lv };
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

/** Learned skills work at this share of an inherent one, so a captain's own speciality stays special (#45). */
export const LEARNED_SKILL_SCALE = 0.6;
/** Levels at which a learn slot opens (Lv3 / Lv6 / Lv9 → up to three learned skills). */
export const LEARN_SLOT_LEVELS = [3, 6, 9];
/** Swapping out a learned skill (retraining) costs this; filling an empty slot is free. */
export const RETRAIN_COST = { fuel: 200, ammo: 200, steel: 0, bauxite: 0 };

export function learnSlots(level: number): number {
  return LEARN_SLOT_LEVELS.filter((l) => level >= l).length;
}

/** Learned skills that still fit: known specialities, not the inherent one, no repeats, within the open slots. */
export function validLearned(captain: ICaptain, learned: readonly string[]): CaptainSkill[] {
  const known = new Set<string>(Object.values(CaptainSkill));
  const out: CaptainSkill[] = [];
  for (const s of learned) {
    if (known.has(s) && s !== captain.skill && !out.includes(s as CaptainSkill)) out.push(s as CaptainSkill);
  }
  return out.slice(0, learnSlots(captain.level));
}

/** Learns `skill` into the next free slot, or replaces `replace` (paid retraining). Null when not allowed. */
export function learnSkill(captain: ICaptain, learned: readonly string[], skill: CaptainSkill, replace?: CaptainSkill): CaptainSkill[] | null {
  const current = validLearned(captain, learned);
  if (skill === captain.skill || current.includes(skill)) return null;
  if (replace !== undefined) {
    const i = current.indexOf(replace);
    if (i < 0) return null;
    const next = [...current];
    next[i] = skill;
    return next;
  }
  return current.length < learnSlots(captain.level) ? [...current, skill] : null;
}

// ---------------------------------------------------------------------------
// Traits (#45): earned in battle, always on, no slot needed
// ---------------------------------------------------------------------------

/** What a captain has done that traits count (per captain, in the save). */
export interface ICaptainStats {
  /** Enemies sunk by the captain's fleet in night battles */
  nightSinks: number;
  /** Enemy submarines sunk by the captain's fleet */
  subSinks: number;
  /** Battles the captain's ship came home from heavily damaged (25% HP or less) */
  heavySurvivals: number;
}

export const NO_STATS: ICaptainStats = { nightSinks: 0, subSinks: 0, heavySurvivals: 0 };

export interface ITrait {
  id: string;
  name: string;
  /** "夜戦で 3 隻撃沈" */
  condition: string;
  /** "夜戦の砲火力 +5%・夜間視界 +5%" */
  effect: string;
  earned: (s: ICaptainStats) => boolean;
  modifiers: (ctx: ICaptainContext) => Partial<IShipModifiers>;
}

export const TRAITS: ITrait[] = [
  {
    id: 'night_ace', name: '夜戦巧者', condition: '夜戦で 3 隻撃沈', effect: '夜戦の砲火力 +5%・夜間の視界 +5%',
    earned: (s) => s.nightSinks >= 3,
    modifiers: (ctx) => (ctx.night ? { gunPowerMul: 1.05, nightVisionMul: 1.05 } : {}),
  },
  {
    id: 'unsinkable', name: '不沈艦長', condition: '大破から 3 回生還', effect: '耐久 +5%・装甲 +1',
    earned: (s) => s.heavySurvivals >= 3,
    modifiers: () => ({ hpMul: 1.05, armorAdd: 1 }),
  },
  {
    id: 'sub_killer', name: '潜水艦キラー', condition: '潜水艦を 5 隻撃沈', effect: '爆雷 +10%・ソナー +10%',
    earned: (s) => s.subSinks >= 5,
    modifiers: () => ({ depthChargeMul: 1.1, sonarMul: 1.1 }),
  },
];

export function earnedTraits(stats: ICaptainStats | undefined): ITrait[] {
  return TRAITS.filter((t) => t.earned(stats ?? NO_STATS));
}

/** Adds one battle to a captain's stats. */
export function addBattleStats(stats: ICaptainStats | undefined, battle: { night: boolean; sunk: number; subsSunk: number; heavySurvival: boolean }): ICaptainStats {
  const s = stats ?? NO_STATS;
  return {
    nightSinks: s.nightSinks + (battle.night ? Math.max(0, battle.sunk) : 0),
    subSinks: s.subSinks + Math.max(0, battle.subsSunk),
    heavySurvivals: s.heavySurvivals + (battle.heavySurvival ? 1 : 0),
  };
}

/** Everything a captain adds to their ship: inherent speciality, learned skills (60%) and earned traits. */
export function captainModifiers(
  captain: ICaptain | null | undefined,
  ctx: ICaptainContext = {},
  learned: readonly string[] = [],
  stats?: ICaptainStats,
): IShipModifiers {
  if (!captain) return NO_MODIFIERS;
  return combineModifiers(
    skillModifiers(captain.skill, captain.level, ctx),
    ...validLearned(captain, learned).map((s) => skillModifiers(s, captain.level, ctx, LEARNED_SKILL_SCALE)),
    ...earnedTraits(stats).map((t) => t.modifiers(ctx)),
  );
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
