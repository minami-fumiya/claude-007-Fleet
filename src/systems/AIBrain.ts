import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';

/**
 * AI v2 decision making (pure, no Phaser): which enemy to shoot, at what range to fight and when
 * to break off. Each nation fights differently through a tactics profile.
 */

export interface ITacticsProfile {
  /** Fraction of the ship's longest surface weapon range it tries to hold */
  preferredRangeFraction: number;
  /** HP fraction at or below which the ship opens the range and fights defensively */
  retreatHpFraction: number;
  /** Weight for picking damaged targets (focus fire) */
  focusWeakWeight: number;
  /** Weight for picking near targets */
  distanceWeight: number;
  /** Weight for picking valuable targets (battleships, carriers) */
  capitalWeight: number;
  /** 0..1, passed to the weapon selector: how early torpedoes are launched */
  torpedoEagerness: number;
}

/** IJN closes in for torpedo attacks, USN keeps a long-range gun duel, KM gangs up on damaged ships. */
export const TACTICS: Record<Nation, ITacticsProfile> = {
  [Nation.IJN]: { preferredRangeFraction: 0.5, retreatHpFraction: 0.15, focusWeakWeight: 0.4, distanceWeight: 1, capitalWeight: 0.3, torpedoEagerness: 1 },
  [Nation.USN]: { preferredRangeFraction: 0.85, retreatHpFraction: 0.3, focusWeakWeight: 0.3, distanceWeight: 1, capitalWeight: 0.5, torpedoEagerness: 0.3 },
  [Nation.KM]: { preferredRangeFraction: 0.7, retreatHpFraction: 0.2, focusWeakWeight: 1, distanceWeight: 0.8, capitalWeight: 0.2, torpedoEagerness: 0.6 },
  [Nation.RN]: { preferredRangeFraction: 0.7, retreatHpFraction: 0.25, focusWeakWeight: 0.5, distanceWeight: 1, capitalWeight: 0.4, torpedoEagerness: 0.5 },
};

const CLASS_VALUE: Record<ShipClass, number> = {
  [ShipClass.Battleship]: 1,
  [ShipClass.Carrier]: 0.9,
  [ShipClass.Cruiser]: 0.6,
  [ShipClass.Destroyer]: 0.4,
  [ShipClass.Submarine]: 0.3,
};

/** A new target must beat the current one by this much before the AI switches (no flip-flopping). */
const SWITCH_MARGIN = 0.15;
/** Retreating ships hold this multiple of their preferred range. */
const RETREAT_RANGE_FACTOR = 1.6;
/** Bonus for hunters going after a submarine they have on sonar. */
const ASW_PRIORITY = 0.6;

export interface IAISelf {
  x: number;
  y: number;
  hpFraction: number;
  /** Longest range of its guns / torpedoes */
  maxRange: number;
  /** Carries depth charges, so can attack submerged boats */
  hasDepthCharges: boolean;
}

export interface IAITarget {
  x: number;
  y: number;
  alive: boolean;
  hpFraction: number;
  shipClass: ShipClass;
  submerged: boolean;
  /** Visible to this side (always true unless submerged and off sonar) */
  detected: boolean;
  /** Extra score, e.g. convoy ships the enemy is ordered to sink */
  priority?: number;
}

export enum AIMode {
  Engage = 'Engage',
  Retreat = 'Retreat',
  /** Running over a submerged submarine to drop depth charges */
  Hunt = 'Hunt',
}

export interface IAIDecision<T> {
  target: T | null;
  mode: AIMode;
  /** Range to hold from the target */
  preferredRange: number;
}

/** Can `self` attack `target` at all right now? */
export function isEngageable(self: IAISelf, target: IAITarget): boolean {
  if (!target.alive || !target.detected) return false;
  return !target.submerged || self.hasDepthCharges;
}

export function scoreTarget(self: IAISelf, target: IAITarget, profile: ITacticsProfile): number {
  const d = Math.hypot(target.x - self.x, target.y - self.y);
  const reach = Math.max(1, self.maxRange * 2);
  const near = 1 - Math.min(1, d / reach);
  const weak = 1 - Math.min(1, Math.max(0, target.hpFraction));
  let score = profile.distanceWeight * near + profile.focusWeakWeight * weak + profile.capitalWeight * CLASS_VALUE[target.shipClass];
  if (target.submerged) score += ASW_PRIORITY;
  return score + (target.priority ?? 0);
}

/** Best target by score; keeps `current` unless another beats it by SWITCH_MARGIN. */
export function chooseTarget<T extends IAITarget>(self: IAISelf, candidates: T[], profile: ITacticsProfile, current: T | null = null): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    if (!isEngageable(self, c)) continue;
    const s = scoreTarget(self, c, profile);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (current && current !== best && isEngageable(self, current)) {
    if (scoreTarget(self, current, profile) + SWITCH_MARGIN >= bestScore) return current;
  }
  return best;
}

export function decide<T extends IAITarget>(self: IAISelf, candidates: T[], profile: ITacticsProfile, current: T | null = null): IAIDecision<T> {
  const target = chooseTarget(self, candidates, profile, current);
  const preferred = self.maxRange * profile.preferredRangeFraction;
  if (!target) return { target: null, mode: AIMode.Engage, preferredRange: preferred };
  if (target.submerged) return { target, mode: AIMode.Hunt, preferredRange: 0 };
  if (self.hpFraction <= profile.retreatHpFraction) {
    return { target, mode: AIMode.Retreat, preferredRange: preferred * RETREAT_RANGE_FACTOR };
  }
  return { target, mode: AIMode.Engage, preferredRange: preferred };
}

/** Submarine AI: dive once enemies are near, but come up early rather than run the air out. */
export function submarineWantsDive(nearestEnemyDistance: number, air: number, submerged: boolean): boolean {
  const DIVE_DISTANCE = 750;
  const SURFACE_AIR = 0.12;
  const REDIVE_AIR = 0.5;
  if (nearestEnemyDistance > DIVE_DISTANCE) return false;
  return submerged ? air > SURFACE_AIR : air >= REDIVE_AIR;
}

/** AI turn rates (deg/s) by class: big ships answer the helm slowly. */
export const TURN_RATE_DEG: Record<ShipClass, number> = {
  [ShipClass.Battleship]: 55,
  [ShipClass.Carrier]: 50,
  [ShipClass.Cruiser]: 75,
  [ShipClass.Destroyer]: 110,
  [ShipClass.Submarine]: 80,
};
