import { IShipData } from '@/types/Ship';
import { IResources } from '@/types/Progression';
import type { IProgress } from '@/utils/ProgressStore';
import { ICampaignArea } from '@/types/Campaign';
import { addResources, BAUXITE_PER_PLANE, battleReward, canAfford, pay, resources, sortieCost } from './ResourceSystem';
import { completeRepairs, hpFraction, isDocked, setDamage, SUNK_HP_FRACTION } from './DockSystem';
import { isFreeArea } from './CampaignSystem';

/**
 * Ties battles to the home base (pure): paying for a sortie and settling the outcome.
 * 演習 (exercise = free battle, #15): free, no damage kept, docked ships allowed, full HP, half the resource reward.
 * Proficiency, captain XP and the service record still count (handled by the battle scene).
 */

/** Resource reward multiplier for an exercise. */
export const EXERCISE_REWARD_SCALE = 0.5;

export interface ISortieOptions {
  /** Free battle (演習) */
  exercise?: boolean;
  /** Campaign area being sortied to (the first area of a theater is free, #28) */
  area?: ICampaignArea | null;
}

/** A battle is an exercise when it is neither a campaign area nor a historical scenario. */
export function isExercise(data: { areaId?: string; scenario?: unknown } | null | undefined): boolean {
  return !data?.areaId && !data?.scenario;
}

/** True when this sortie costs nothing. */
export function isFreeSortie(opts: ISortieOptions = {}): boolean {
  return opts.exercise === true || (opts.area ? isFreeArea(opts.area) : false);
}

/** What the sortie costs with these options. */
export function sortieCostFor(ships: IShipData[], opts: ISortieOptions = {}): IResources {
  return isFreeSortie(opts) ? resources() : sortieCost(ships);
}

export interface IShipOutcome {
  shipId: string;
  /** HP fraction left (ignored when sunk) */
  hpFraction: number;
  sunk: boolean;
}

export interface IBattleOutcome {
  victory: boolean;
  enemiesSunk: number;
  ships: IShipOutcome[];
  /** Carrier aircraft shot down */
  planesLost: number;
}

export interface ISettlement {
  progress: IProgress;
  reward: IResources;
  /** Bauxite spent replacing lost aircraft */
  aircraftCost: IResources;
}

/** Why the fleet can't sortie right now (empty = it can). */
export function sortieBlockers(progress: IProgress, ships: IShipData[], now: number, opts: ISortieOptions = {}): string[] {
  const state = completeRepairs(progress, now);
  const reasons: string[] = [];
  // Exercises use docked ships too: they fight at full HP and keep no damage.
  if (!opts.exercise) {
    for (const s of ships) {
      if (isDocked(state, s.id)) reasons.push(`${s.name} は入渠中`);
    }
  }
  if (!canAfford(progress.resources, sortieCostFor(ships, opts))) reasons.push('資源が不足しています');
  return reasons;
}

/** Pays the sortie cost. Returns null if resources are short. */
export function paySortie(progress: IProgress, ships: IShipData[], opts: ISortieOptions = {}): IProgress | null {
  const left = pay(progress.resources, sortieCostFor(ships, opts));
  return left ? { ...progress, resources: left } : null;
}

/**
 * Applies a battle's outcome: rewards, aircraft replacement cost and each ship's damage.
 * An exercise pays half the reward and keeps neither damage nor aircraft losses.
 */
export function settleBattle(progress: IProgress, outcome: IBattleOutcome, opts: { exercise?: boolean } = {}): ISettlement {
  const full = battleReward(outcome.victory, outcome.enemiesSunk);
  const reward = opts.exercise ? addResources(resources(), full, EXERCISE_REWARD_SCALE) : full;
  const aircraftCost = opts.exercise ? resources() : resources({ bauxite: Math.max(0, outcome.planesLost) * BAUXITE_PER_PLANE });
  let next: IProgress = {
    ...progress,
    resources: addResources(addResources(progress.resources, reward), aircraftCost, -1),
  };
  if (opts.exercise) return { progress: next, reward, aircraftCost };
  for (const s of outcome.ships) {
    const f = s.sunk ? SUNK_HP_FRACTION : s.hpFraction;
    next = { ...next, ...setDamage(next, s.shipId, f) };
  }
  return { progress: next, reward, aircraftCost };
}

/** HP fraction a ship starts its next battle with (exercises always start at full HP). */
export function startingHp(progress: IProgress, shipId: string, exercise = false): number {
  if (exercise) return 1;
  return Math.max(SUNK_HP_FRACTION, hpFraction(progress, shipId));
}
