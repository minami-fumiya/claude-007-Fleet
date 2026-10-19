import { Aptitude, CaptainAbility, CaptainSkill, ICaptain, ICaptainData } from '@/types/Captain';
import { ADDITIVE_MODIFIERS, IShipModifiers, NO_MODIFIERS } from '@/types/Modifiers';
import { ShipClass } from '@/types/ShipClass';
import { combineModifiers } from './CustomizationSystem';

/**
 * Captains (pure): experience, levels and the bonus a captain's speciality gives their ship.
 * Level n needs 100 × n(n−1)/2 XP in total (Lv2 = 100, Lv3 = 300, Lv4 = 600 …), capped at MAX_LEVEL (100, #131).
 * XP is what the save keeps, so raising the cap needs no migration.
 */

export const MAX_LEVEL = 100;
/** Skills grow with level up to here; past it the inherent skill strengthens in tiers instead (#131). */
export const SKILL_LEVEL_CAP = 10;

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

/** What a level-up brought (#131): "固有スキル「砲術 II」"・"習得枠 +1"・"砲術 +0.4%" (the largest ability gain). */
export function levelUpNotes(before: ICaptain, after: ICaptain): string[] {
  if (after.level <= before.level) return [];
  const notes: string[] = [];
  if (inherentTier(after.level).mul > inherentTier(before.level).mul) notes.push(`固有スキル「${inherentLabel(after)}」`);
  const slots = learnSlots(after.level) - learnSlots(before.level);
  if (slots > 0) notes.push(`習得枠 +${slots}`);
  const a = captainAbilities(before);
  const b = captainAbilities(after);
  const best = (Object.values(CaptainAbility) as CaptainAbility[]).reduce((m, k) => (b[k] - a[k] > b[m] - a[m] ? k : m), CaptainAbility.Gunnery);
  const gain = Math.round((b[best] - a[best]) * 10) / 10;
  if (gain > 0) notes.push(`${ABILITY_LABEL[best]} +${gain}%`);
  return notes;
}

/** Battle conditions some specialities depend on. */
export interface ICaptainContext {
  /** Night battle: the 夜戦 speciality only pays off in the dark */
  night?: boolean;
}

/** One speciality's bonus at `level` (counted up to Lv10); `scale` shrinks a learned skill (#45) or strengthens a tiered inherent one (#131). */
export function skillModifiers(skill: CaptainSkill, level: number, ctx: ICaptainContext = {}, scale = 1): IShipModifiers {
  const lv = Math.min(level, SKILL_LEVEL_CAP) * scale;
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
/** Levels at which a learn slot opens (#131: Lv30 and Lv60 add a fourth and fifth). */
export const LEARN_SLOT_LEVELS = [3, 6, 9, 30, 60];

/** The inherent skill's own slot strengthens at Lv10 (II, ×1.5) and Lv50 (III, ×2) (#131). */
export const INHERENT_TIERS: ReadonlyArray<{ level: number; mul: number; label: string }> = [
  { level: 1, mul: 1, label: '' },
  { level: 10, mul: 1.5, label: 'II' },
  { level: 50, mul: 2, label: 'III' },
];

export function inherentTier(level: number): { level: number; mul: number; label: string } {
  return [...INHERENT_TIERS].reverse().find((t) => level >= t.level) ?? INHERENT_TIERS[0];
}

/** The next tier and the level it comes at, or null at III. */
export function nextInherentTier(level: number): { level: number; mul: number; label: string } | null {
  return INHERENT_TIERS.find((t) => t.level > level) ?? null;
}

/** "砲術 II" */
export function inherentLabel(captain: ICaptain): string {
  const tier = inherentTier(captain.level).label;
  return tier ? `${SKILL_LABEL[captain.skill]} ${tier}` : SKILL_LABEL[captain.skill];
}

// ---------------------------------------------------------------------------
// Aptitude and abilities (#131)
// ---------------------------------------------------------------------------

export const APTITUDE_SCALE: Record<Aptitude, number> = { S: 1.2, A: 1, B: 0.8, C: 0.6 };

/** The ship classes a speciality suits; a captain's data can override single classes. */
const SKILL_APTITUDE: Record<CaptainSkill, Record<ShipClass, Aptitude>> = {
  [CaptainSkill.Gunnery]: { Battleship: 'S', Cruiser: 'A', Destroyer: 'B', Carrier: 'C', Submarine: 'C' },
  [CaptainSkill.Torpedo]: { Battleship: 'C', Cruiser: 'A', Destroyer: 'S', Carrier: 'C', Submarine: 'A' },
  // Every speciality suits at least one class at S (#188): fast ships for the engine room.
  [CaptainSkill.Engineering]: { Battleship: 'A', Cruiser: 'S', Destroyer: 'S', Carrier: 'B', Submarine: 'B' },
  [CaptainSkill.Aviation]: { Battleship: 'C', Cruiser: 'B', Destroyer: 'C', Carrier: 'S', Submarine: 'C' },
  [CaptainSkill.ASW]: { Battleship: 'C', Cruiser: 'B', Destroyer: 'S', Carrier: 'B', Submarine: 'A' },
  [CaptainSkill.Night]: { Battleship: 'B', Cruiser: 'A', Destroyer: 'S', Carrier: 'C', Submarine: 'B' },
  [CaptainSkill.Recon]: { Battleship: 'B', Cruiser: 'S', Destroyer: 'B', Carrier: 'A', Submarine: 'A' },
  [CaptainSkill.Damecon]: { Battleship: 'S', Cruiser: 'A', Destroyer: 'B', Carrier: 'A', Submarine: 'C' },
};

export function aptitudeFor(captain: ICaptainData, shipClass: ShipClass): Aptitude {
  return captain.aptitude?.[shipClass] ?? SKILL_APTITUDE[captain.skill][shipClass];
}

/** How well a captain fits a ship class (#164): aptitude first, then level. */
export function captainFit(captain: ICaptainData & { level: number }, shipClass: ShipClass): number {
  return APTITUDE_SCALE[aptitudeFor(captain, shipClass)] * 1000 + captain.level;
}

/** Up to `n` of the given ships the captain suits best (S aptitude), the strongest first (#164). */
export function recommendedShips<T extends { shipClass: ShipClass; hp: number }>(captain: ICaptainData, ships: readonly T[], n = 3): T[] {
  return ships.filter((s) => aptitudeFor(captain, s.shipClass) === 'S').sort((a, b) => b.hp - a.hp).slice(0, n);
}

/**
 * Captains for a fleet's slots (#164), greedily from the flagship down: each ship gets the best-fitting captain not
 * already given a slot. Empty slots get none.
 */
export function assignCaptains(slots: ReadonlyArray<ShipClass | null>, captains: ReadonlyArray<ICaptainData & { level: number }>): (string | null)[] {
  const free = [...captains];
  return slots.map((cls) => {
    if (!cls || free.length === 0) return null;
    let best = 0;
    free.forEach((c, i) => {
      if (captainFit(c, cls) > captainFit(free[best], cls)) best = i;
    });
    return free.splice(best, 1)[0].id;
  });
}

export const ABILITY_LABEL: Record<CaptainAbility, string> = {
  [CaptainAbility.Gunnery]: '砲術',
  [CaptainAbility.Torpedo]: '雷撃',
  [CaptainAbility.Aviation]: '航空',
  [CaptainAbility.Handling]: '操艦',
};

/** An ability's bonus at Lv100 for the captain's strongest growth (+20%). */
export const ABILITY_MAX = 20;

/** How each speciality's abilities grow (share of ABILITY_MAX); every captain grows a little in everything. */
const GROWTH: Record<CaptainSkill, Record<CaptainAbility, number>> = {
  [CaptainSkill.Gunnery]: { gunnery: 1, torpedo: 0.3, aviation: 0.2, handling: 0.5 },
  [CaptainSkill.Torpedo]: { gunnery: 0.4, torpedo: 1, aviation: 0.2, handling: 0.7 },
  [CaptainSkill.Engineering]: { gunnery: 0.5, torpedo: 0.5, aviation: 0.3, handling: 1 },
  [CaptainSkill.Aviation]: { gunnery: 0.2, torpedo: 0.3, aviation: 1, handling: 0.5 },
  [CaptainSkill.ASW]: { gunnery: 0.4, torpedo: 0.5, aviation: 0.3, handling: 0.9 },
  [CaptainSkill.Night]: { gunnery: 0.7, torpedo: 0.8, aviation: 0.2, handling: 0.6 },
  [CaptainSkill.Recon]: { gunnery: 0.5, torpedo: 0.4, aviation: 0.7, handling: 0.6 },
  [CaptainSkill.Damecon]: { gunnery: 0.7, torpedo: 0.3, aviation: 0.3, handling: 0.7 },
};

/**
 * A captain's abilities in percent (one decimal). They grow from 0 at Lv1 to ABILITY_MAX × growth at Lv100, faster
 * early on so the first levels are felt.
 */
export function captainAbilities(captain: ICaptainData & { level: number }): Record<CaptainAbility, number> {
  const t = Math.pow(Math.max(0, Math.min(MAX_LEVEL, captain.level) - 1) / (MAX_LEVEL - 1), 0.7);
  const growth = GROWTH[captain.skill];
  const out = {} as Record<CaptainAbility, number>;
  for (const a of Object.values(CaptainAbility)) out[a] = Math.round(ABILITY_MAX * growth[a] * t * 10) / 10;
  return out;
}

/** What the abilities add: firepower, torpedoes and air strikes by their percent, 操艦 as evasion (+5% at 20). */
export function abilityModifiers(abilities: Record<CaptainAbility, number>): IShipModifiers {
  return {
    ...NO_MODIFIERS,
    gunPowerMul: 1 + abilities.gunnery / 100,
    torpedoPowerMul: 1 + abilities.torpedo / 100,
    airPowerMul: 1 + abilities.aviation / 100,
    evadeAdd: abilities.handling / 400,
  };
}

/** Scales a bonus by `f` (aptitude): multipliers move toward or away from 1, additions are multiplied. */
export function scaleModifiers(m: IShipModifiers, f: number): IShipModifiers {
  const out = { ...m };
  for (const key of Object.keys(m) as Array<keyof IShipModifiers>) {
    const v = m[key];
    if (!ADDITIVE_MODIFIERS.includes(key)) out[key] = 1 + (v - 1) * f;
    else out[key] = key === 'evadeAdd' ? v * f : Math.floor(v * f);
  }
  return out;
}
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

/** What filling learn slot `slot` with `skill` does (#130): the new list, what it costs and which skill it drops. */
export interface ILearnPlan {
  learned: CaptainSkill[];
  cost: typeof RETRAIN_COST | null;
  replaces?: CaptainSkill;
}

export function learnPlan(captain: ICaptain, learned: readonly string[], slot: number, skill: CaptainSkill): ILearnPlan | null {
  const current = validLearned(captain, learned);
  if (slot < 0 || slot >= learnSlots(captain.level)) return null;
  const replaces = current[slot];
  if (replaces === skill) return null;
  const next = learnSkill(captain, current, skill, replaces);
  return next ? { learned: next, cost: replaces ? RETRAIN_COST : null, replaces } : null;
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

/** One thing that adds to a captain's bonus, for the colour-coded breakdown (#130). */
export interface ICaptainSource {
  kind: 'inherent' | 'learned' | 'ability' | 'trait';
  /** "砲術 II", "雷撃 (習得)", "能力", "夜戦巧者" */
  label: string;
  /** The skill behind it (inherent and learned), for its colour */
  skill?: CaptainSkill;
  mods: IShipModifiers;
}

/**
 * Everything a captain adds to their ship, one source at a time: inherent speciality (tiered, #131), learned skills
 * (60%), abilities and earned traits. Skills and abilities are scaled by the captain's aptitude for `shipClass`
 * (#131); traits are not.
 */
export function captainSources(
  captain: ICaptain | null | undefined,
  ctx: ICaptainContext = {},
  learned: readonly string[] = [],
  stats?: ICaptainStats,
  shipClass?: ShipClass,
): ICaptainSource[] {
  if (!captain) return [];
  const f = shipClass ? APTITUDE_SCALE[aptitudeFor(captain, shipClass)] : 1;
  const scaled = (m: IShipModifiers): IShipModifiers => (f === 1 ? m : scaleModifiers(m, f));
  return [
    { kind: 'inherent', label: inherentLabel(captain), skill: captain.skill, mods: scaled(skillModifiers(captain.skill, captain.level, ctx, inherentTier(captain.level).mul)) },
    ...validLearned(captain, learned).map((s): ICaptainSource => ({
      kind: 'learned', label: `${SKILL_LABEL[s]} (習得)`, skill: s, mods: scaled(skillModifiers(s, captain.level, ctx, LEARNED_SKILL_SCALE)),
    })),
    { kind: 'ability', label: '能力', mods: scaled(abilityModifiers(captainAbilities(captain))) },
    ...earnedTraits(stats).map((t): ICaptainSource => ({ kind: 'trait', label: t.name, mods: combineModifiers(t.modifiers(ctx)) })),
  ];
}

/** Everything a captain adds to their ship (all of captainSources combined). */
export function captainModifiers(
  captain: ICaptain | null | undefined,
  ctx: ICaptainContext = {},
  learned: readonly string[] = [],
  stats?: ICaptainStats,
  shipClass?: ShipClass,
): IShipModifiers {
  if (!captain) return NO_MODIFIERS;
  return combineModifiers(...captainSources(captain, ctx, learned, stats, shipClass).map((s) => s.mods));
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
