import { Formation } from '@/types/Formation';
import { IShipModifiers } from '@/types/Modifiers';

/**
 * What each formation does in battle (#59, pure). Formations used to only place the escorts; each now
 * trades firepower for anti-air, anti-submarine work or evasion, and some screen the flagship from the
 * enemy's fire (an extra target priority on top of AIBrain.FLAGSHIP_PRIORITY).
 */

export interface IFormationRule {
  ja: string;
  en: string;
  /** One line for the formation card */
  summary: string;
  /** Applied to every ship of the fleet */
  all: Partial<IShipModifiers>;
  /** Extra for the flagship only */
  flagship?: Partial<IShipModifiers>;
  /** Extra for escorts only */
  escorts?: Partial<IShipModifiers>;
  /** Added to the enemy's score for the flagship (negative = the escorts screen it) */
  flagshipPriority: number;
  /** Admiral rank index (RankSystem) that unlocks the formation */
  minRank: number;
}

/** Display order on the formation cards. */
export const FORMATION_ORDER: Formation[] = [
  Formation.LineAhead,
  Formation.DoubleLine,
  Formation.Circle,
  Formation.Echelon,
  Formation.LineAbreast,
  Formation.Vanguard,
];

export const FORMATION_RULES: Record<Formation, IFormationRule> = {
  [Formation.LineAhead]: {
    ja: '単縦陣', en: 'LINE AHEAD', summary: '砲火力 +10% / 回避 −3%',
    all: { gunPowerMul: 1.1, evadeAdd: -0.03 }, flagshipPriority: 0, minRank: 0,
  },
  [Formation.DoubleLine]: {
    ja: '複縦陣', en: 'DOUBLE LINE', summary: '砲 +3%・魚雷 +5%・回避 +3%',
    all: { gunPowerMul: 1.03, torpedoPowerMul: 1.05, evadeAdd: 0.03 }, flagshipPriority: 0, minRank: 2,
  },
  [Formation.Circle]: {
    ja: '輪形陣', en: 'CIRCLE', summary: '対空 +50%・旗艦を守る / 砲 −15%',
    all: { aaMul: 1.5, gunPowerMul: 0.85 }, flagshipPriority: -0.25, minRank: 4,
  },
  [Formation.Echelon]: {
    ja: '梯形陣', en: 'ECHELON', summary: '対潜 +20%・回避 +5% / 砲 −8%',
    all: { depthChargeMul: 1.2, sonarMul: 1.15, evadeAdd: 0.05, gunPowerMul: 0.92 }, flagshipPriority: 0, minRank: 6,
  },
  [Formation.LineAbreast]: {
    ja: '単横陣', en: 'LINE ABREAST', summary: '対潜 +40%・ソナー +30% / 砲 −25%',
    all: { depthChargeMul: 1.4, sonarMul: 1.3, gunPowerMul: 0.75, torpedoPowerMul: 0.9 }, flagshipPriority: 0, minRank: 3,
  },
  [Formation.Vanguard]: {
    ja: '警戒陣', en: 'VANGUARD', summary: '前衛の回避 +12%・旗艦を守る / 砲 −15%',
    all: { gunPowerMul: 0.85 }, escorts: { evadeAdd: 0.12 }, flagship: { evadeAdd: 0.06 }, flagshipPriority: -0.3, minRank: 7,
  },
};

/** Modifiers one ship gets from the fleet's formation. */
export function formationModifiers(formation: Formation, isFlagship: boolean): Partial<IShipModifiers> {
  const rule = FORMATION_RULES[formation];
  const extra = (isFlagship ? rule.flagship : rule.escorts) ?? {};
  const out: Partial<IShipModifiers> = { ...rule.all };
  for (const [key, value] of Object.entries(extra) as Array<[keyof IShipModifiers, number]>) {
    // Formation extras only use additive fields (evasion), so they add onto the fleet-wide value.
    out[key] = (out[key] ?? 0) + value;
  }
  return out;
}

export function formationUnlocked(formation: Formation, rankIndex: number): boolean {
  return rankIndex >= FORMATION_RULES[formation].minRank;
}

/** The formation to use: `wanted` if the rank allows it, else line ahead. */
export function usableFormation(wanted: Formation | undefined, rankIndex: number): Formation {
  return wanted && FORMATION_RULES[wanted] && formationUnlocked(wanted, rankIndex) ? wanted : Formation.LineAhead;
}
